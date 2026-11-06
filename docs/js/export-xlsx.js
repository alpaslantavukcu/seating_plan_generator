// Excel workbooks built the way the Python generator builds them with
// openpyxl: the room's own template workbook (docs/templates/Template_<room>
// .xlsx, synced from Templates/ by tools/convert_templates.py) is opened as a
// zip, its one sheet is renamed "<room>_id_only", a copy named "<room>_full"
// is added, "{exam} | {room}" goes into A1 and the student lines into the seat
// cells. Nothing else in the package is touched — styles.xml (and with it the
// template's default font), borders, column widths, row heights, page setup,
// printer settings and print areas stay byte for byte as the template has
// them. The single-sheet room list is a fresh workbook, like the CLI's.
//
// The zip is handled by fflate and the XML by the browser's DOMParser.

import {
  safeFileName, roomSnapshot, seatLines, downloadBytes, loadScript, fetchBytes,
} from './export-common.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const NS_XML = 'http://www.w3.org/XML/1998/namespace';
const REL_WORKSHEET = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet';
const REL_PRINTER = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings';
const CT_WORKSHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

async function ensureFflate() {
  if (!window.fflate) await loadScript('vendor/fflate.min.js');
  return window.fflate;
}

/* ---------------- XML helpers ---------------- */

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('template XML could not be parsed');
  return doc;
}

function serializeXml(doc) {
  const text = new XMLSerializer().serializeToString(doc);
  return text.startsWith('<?xml') ? text : XML_DECL + text;
}

function colNumber(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function splitRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`bad cell reference ${ref}`);
  return { col: colNumber(m[1]), row: Number(m[2]) };
}

function childElements(el, localName) {
  return Array.from(el.childNodes).filter((n) => n.nodeType === 1 && n.localName === localName);
}

// Write an inline string into a cell, creating the row/cell in sheet order
// when the template has none there. An existing cell keeps its style index.
function setCellText(doc, ref, text) {
  const { col, row } = splitRef(ref);
  const sheetData = doc.getElementsByTagNameNS(NS_MAIN, 'sheetData')[0];

  let rowEl = null;
  let nextRow = null;
  for (const r of childElements(sheetData, 'row')) {
    const n = Number(r.getAttribute('r'));
    if (n === row) { rowEl = r; break; }
    if (n > row) { nextRow = r; break; }
  }
  if (!rowEl) {
    rowEl = doc.createElementNS(NS_MAIN, 'row');
    rowEl.setAttribute('r', String(row));
    sheetData.insertBefore(rowEl, nextRow);
  }

  let cell = null;
  let nextCell = null;
  for (const c of childElements(rowEl, 'c')) {
    const r = c.getAttribute('r');
    if (r === ref) { cell = c; break; }
    if (splitRef(r).col > col) { nextCell = c; break; }
  }
  if (!cell) {
    cell = doc.createElementNS(NS_MAIN, 'c');
    cell.setAttribute('r', ref);
    rowEl.insertBefore(cell, nextCell);
  }

  while (cell.firstChild) cell.removeChild(cell.firstChild);
  cell.setAttribute('t', 'inlineStr');
  const is = doc.createElementNS(NS_MAIN, 'is');
  const t = doc.createElementNS(NS_MAIN, 't');
  t.setAttributeNS(NS_XML, 'xml:space', 'preserve');
  t.textContent = text;
  is.appendChild(t);
  cell.appendChild(is);
}

// openpyxl's copy_worksheet leaves the copy unselected; a second selected tab
// would open the workbook with the sheets grouped.
function unselectTab(doc) {
  for (const v of Array.from(doc.getElementsByTagNameNS(NS_MAIN, 'sheetView'))) v.removeAttribute('tabSelected');
}

function resolveTarget(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

function nextFreeName(files, pattern) {
  for (let i = 2; ; i++) {
    const name = pattern(i);
    if (!(name in files)) return name;
  }
}

function sheetRefForName(name) {
  return /^[A-Za-z0-9_]+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

/* ---------------- template filling ---------------- */

const templateCache = new Map();
function templateFiles(roomId) {
  if (!templateCache.has(roomId)) {
    templateCache.set(roomId, (async () => {
      const fflate = await ensureFflate();
      const bytes = await fetchBytes(`templates/Template_${encodeURIComponent(roomId)}.xlsx`);
      return fflate.unzipSync(bytes);
    })().catch((err) => { templateCache.delete(roomId); throw err; }));
  }
  return templateCache.get(roomId);
}

// Fill the template for one room: {id_only sheet values, full sheet values}
// -> xlsx bytes. Mirrors SeatingPlanGenerator.export_to_excel.
export async function buildRoomWorkbook(state, roomId) {
  const fflate = await ensureFflate();
  const src = await templateFiles(roomId);
  const files = { ...src };
  const text = (p) => fflate.strFromU8(files[p]);
  const put = (p, xml) => { files[p] = fflate.strToU8(xml); };

  const idName = `${roomId}_id_only`;
  const fullName = `${roomId}_full`;

  // --- workbook.xml: rename the first sheet, append the copy ---
  const wbPath = 'xl/workbook.xml';
  const wb = parseXml(text(wbPath));
  const sheets = wb.getElementsByTagNameNS(NS_MAIN, 'sheets')[0];
  const sheetEls = childElements(sheets, 'sheet');
  const first = sheetEls[0];
  const oldName = first.getAttribute('name');
  const firstRid = first.getAttributeNS(NS_REL, 'id');
  const maxSheetId = Math.max(...sheetEls.map((s) => Number(s.getAttribute('sheetId')) || 0));
  first.setAttribute('name', idName);

  // --- workbook rels: locate the sheet part, register the copy ---
  const relsPath = 'xl/_rels/workbook.xml.rels';
  const rels = parseXml(text(relsPath));
  const relEls = Array.from(rels.getElementsByTagNameNS(NS_PKG_REL, 'Relationship'));
  const sheetRel = relEls.find((r) => r.getAttribute('Id') === firstRid);
  const sheetPath = resolveTarget(wbPath, sheetRel.getAttribute('Target'));
  const copyPath = nextFreeName(files, (i) => `xl/worksheets/sheet${i}.xml`);
  let ridNum = 1;
  while (relEls.some((r) => r.getAttribute('Id') === `rId${ridNum}`)) ridNum++;
  const copyRid = `rId${ridNum}`;
  const newRel = rels.createElementNS(NS_PKG_REL, 'Relationship');
  newRel.setAttribute('Id', copyRid);
  newRel.setAttribute('Type', REL_WORKSHEET);
  newRel.setAttribute('Target', copyPath.replace(/^xl\//, ''));
  rels.documentElement.appendChild(newRel);
  put(relsPath, serializeXml(rels));

  const copy = first.cloneNode(true);
  copy.setAttribute('name', fullName);
  copy.setAttribute('sheetId', String(maxSheetId + 1));
  copy.setAttributeNS(NS_REL, 'r:id', copyRid);
  sheets.appendChild(copy);

  // Sheet-scoped defined names (the print area) follow the rename and are
  // repeated for the copy, so both sheets print the same area.
  const dnContainer = wb.getElementsByTagNameNS(NS_MAIN, 'definedNames')[0];
  if (dnContainer) {
    const oldRef = sheetRefForName(oldName);
    for (const dn of childElements(dnContainer, 'definedName')) {
      if (dn.getAttribute('localSheetId') !== '0') continue;
      const renamed = dn.textContent.split(`${oldRef}!`).join(`${sheetRefForName(idName)}!`);
      dn.textContent = renamed;
      const dup = dn.cloneNode(true);
      dup.setAttribute('localSheetId', String(sheetEls.length));
      dup.textContent = renamed.split(`${sheetRefForName(idName)}!`).join(`${sheetRefForName(fullName)}!`);
      dnContainer.appendChild(dup);
    }
  }
  put(wbPath, serializeXml(wb));

  // --- content types: the copied sheet part ---
  const ctPath = '[Content_Types].xml';
  const ct = parseXml(text(ctPath));
  const override = ct.createElementNS(NS_CT, 'Override');
  override.setAttribute('PartName', `/${copyPath}`);
  override.setAttribute('ContentType', CT_WORKSHEET);
  ct.documentElement.appendChild(override);

  // --- sheet rels (printer settings): the copy gets its own part ---
  const sheetRelsPath = sheetPath.replace(/worksheets\/([^/]+)$/, 'worksheets/_rels/$1.rels');
  if (sheetRelsPath in files) {
    const sr = parseXml(text(sheetRelsPath));
    for (const r of Array.from(sr.getElementsByTagNameNS(NS_PKG_REL, 'Relationship'))) {
      if (r.getAttribute('Type') !== REL_PRINTER) continue;
      const binPath = resolveTarget(sheetPath, r.getAttribute('Target'));
      if (!(binPath in files)) continue;
      const binCopy = nextFreeName(files, (i) => binPath.replace(/\d*\.bin$/, `${i}.bin`));
      files[binCopy] = files[binPath];
      r.setAttribute('Target', `../${binCopy.replace(/^xl\//, '')}`);
    }
    put(copyPath.replace(/worksheets\/([^/]+)$/, 'worksheets/_rels/$1.rels'), serializeXml(sr));
  }
  put(ctPath, serializeXml(ct));

  // --- app.xml lists sheet titles; drop the stale list rather than lie ---
  if ('docProps/app.xml' in files) {
    const app = parseXml(text('docProps/app.xml'));
    for (const tag of ['HeadingPairs', 'TitlesOfParts']) {
      for (const el of Array.from(app.getElementsByTagName(tag))) el.parentNode.removeChild(el);
    }
    put('docProps/app.xml', serializeXml(app));
  }

  // --- the two sheets ---
  const snaps = roomSnapshot(state, roomId);
  const title = `${state.examName} | ${roomId}`;
  const sheetXml = text(sheetPath);
  for (const [path, mode, fresh] of [[sheetPath, 'id', false], [copyPath, 'full', true]]) {
    const doc = parseXml(sheetXml);
    setCellText(doc, 'A1', title);
    for (const snap of snaps) {
      const lines = seatLines(snap, mode, state);
      if (lines.length) setCellText(doc, snap.cell, lines.join('\n'));
    }
    if (fresh) unselectTab(doc);
    put(path, serializeXml(doc));
  }

  return fflate.zipSync(files, { level: 6 });
}

export async function exportRoomXlsx(state) {
  const roomId = state.activeRoom;
  const bytes = await buildRoomWorkbook(state, roomId);
  downloadBytes(bytes, `${safeFileName(state.examName)}_${roomId}.xlsx`, XLSX_MIME);
}

/* ---------------- single-sheet room list ---------------- */

// Port of export_single_sheet_room_list: one column per room, student IDs in
// seat order, 5.5pt on 7.5pt rows, bold title merged across rooms+5 columns,
// landscape, 0.2" margins. Like the CLI it sets fitToWidth/fitToHeight but not
// the fit-to-page flag, and names no font, so it prints exactly the same way.
export async function buildRoomListWorkbook(state) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Room List', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: false,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, header: 0.1, footer: 0.1 },
    },
  });

  const rooms = state.selectedRooms;
  ws.mergeCells(1, 1, 1, rooms.length + 5);
  const title = ws.getCell(1, 1);
  title.value = state.examName;
  title.font = { size: 12, bold: true };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 20;

  rooms.forEach((roomId, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = roomId;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center' };
    ws.getColumn(i + 1).width = 16;
  });

  const perRoom = rooms.map((roomId) =>
    roomSnapshot(state, roomId).filter((s) => s.id != null).map((s) => s.id));
  const maxRows = Math.max(0, ...perRoom.map((ids) => ids.length));
  for (let r = 0; r < maxRows; r++) {
    ws.getRow(r + 3).height = 7.5;
    perRoom.forEach((ids, i) => {
      if (ids[r] != null) {
        const cell = ws.getCell(r + 3, i + 1);
        cell.value = ids[r];
        cell.font = { size: 5.5 };
        cell.alignment = { horizontal: 'center' };
      }
    });
  }

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

export async function exportRoomListXlsx(state) {
  const bytes = await buildRoomListWorkbook(state);
  downloadBytes(bytes, `${safeFileName(state.examName)}_SingleSheetRoomList.xlsx`, XLSX_MIME);
}
