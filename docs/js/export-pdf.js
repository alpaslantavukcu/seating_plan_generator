// Vector PDF generation with jsPDF. Each room page is the room's Excel
// template drawn the way LibreOffice prints it in the CLI pipeline: same
// paper (Letter when the template names none, as LibreOffice defaults),
// margins, centring and fit-to-page scale, same column widths and row
// heights, the template's own borders, fonts (Arial metrics via the
// metric-compatible Liberation Sans subset), alignment and wrapping. The
// geometry comes from the "sheet" model tools/convert_templates.py extracts
// into classrooms.json.
//
// The merged documents are assembled from the per-room PDFs with pdf-lib,
// exactly as the CLI's merge_pdfs does with pypdf: page 1 of every room for
// the ID-only set, page 2 for the full set, and tutanak + page 2 for the
// printable set — rooms in sorted file-name order.

import {
  safeFileName, roomSnapshot, seatLines, roomsInFileOrder, downloadBytes, loadScript, fetchBytes,
} from './export-common.js';
import { buildRoomWorkbook, buildRoomListWorkbook } from './export-xlsx.js';

const PT_PER_INCH = 72;
const CHAR_PT = 5.6;      // one Excel column-width unit (max digit width) in pt
const PAD_X = 0.3;        // cell padding left/right, pt (LibreOffice wraps this tight)
const PAD_Y = 1.9;        // cell padding top/bottom, pt
const BORDER_W = 0.75;    // a "thin" border as Excel prints it

// Vertical metrics (per em) of the embedded fonts, from their hhea tables —
// the line pitch LibreOffice uses when it prints the sheet.
const FONTS = {
  LiberationSans: { ascent: 0.905, line: 1.117, cap: 0.688 }, // Arial metrics
  Caladea: { ascent: 0.900, line: 1.150, cap: 0.667 },        // what LibreOffice uses for the CLI's unnamed font
};
const DEFAULT_FONT = 'LiberationSans';

function newDoc(page) {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ orientation: page.orientation, unit: 'pt', format: page.paper });
}

function colNumber(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  return { c: colNumber(m[1]), r: Number(m[2]) };
}

function parseRange(range) {
  const [a, b] = range.split(':');
  const p = parseRef(a);
  const q = parseRef(b || a);
  return { c1: p.c, r1: p.r, c2: q.c, r2: q.r };
}

// Scale and page bands: which rows go on which page, as a spreadsheet prints
// a sheet taller than one page (fitToHeight 0 / no fit-to-page) — rows flow
// onto following pages, the columns always on one page.
function sheetLayout(sheet, pageW, pageH) {
  const { page } = sheet;
  const cw = sheet.colWidths.map((w) => w * CHAR_PT);
  const rh = sheet.rowHeights;
  const natW = cw.reduce((a, b) => a + b, 0);
  const m = page.margins;
  const availW = pageW - (m.left + m.right) * PT_PER_INCH;
  const availH = pageH - (m.top + m.bottom) * PT_PER_INCH;

  let s;
  if (page.fitToPage) {
    const natH = rh.reduce((a, b) => a + b, 0);
    const sx = page.fitToWidth > 0 ? availW / natW : Infinity;
    const sy = page.fitToHeight > 0 ? availH / natH : Infinity;
    s = Math.min(1, sx, sy);
  } else {
    s = page.scale / 100;
  }
  // Columns never spill onto a second page sideways.
  s = Math.min(s, availW / natW);

  const pages = [];
  let start = 0;
  while (start < rh.length) {
    let end = start;
    let h = 0;
    while (end < rh.length && (h + rh[end] * s <= availH || end === start)) { h += rh[end] * s; end++; }
    pages.push({ r1: start + 1, r2: end, height: h });
    start = end;
  }
  if (!pages.length) pages.push({ r1: 1, r2: 0, height: 0 });

  const x0 = page.hCenter ? (pageW - natW * s) / 2 : m.left * PT_PER_INCH;
  const xs = [x0];
  cw.forEach((w) => xs.push(xs[xs.length - 1] + w * s));
  return { s, xs, pages, availH, top: m.top * PT_PER_INCH, pageH };
}

function drawText(doc, text, style, box, s) {
  const family = style.f || DEFAULT_FONT;
  const metrics = FONTS[family] || FONTS[DEFAULT_FONT];
  const size = style.sz * s;
  doc.setFont(family, style.b ? 'bold' : 'normal');
  doc.setFontSize(size);

  if (style.rot === 90) {
    // Reads bottom-to-top like the template; clipped to the merged area the
    // way a spreadsheet clips a label longer than its cell.
    doc.saveGraphicsState();
    doc.rect(box.x, box.y, box.w, box.h, null);
    doc.clip();
    doc.discardPath();
    const len = doc.getTextWidth(text);
    doc.text(text, box.x + box.w / 2 + (metrics.cap * size) / 2, box.y + (box.h + len) / 2, { angle: 90 });
    doc.restoreGraphicsState();
    return;
  }

  const padX = PAD_X * s;
  let lines = String(text).split('\n');
  if (style.wrap) lines = lines.flatMap((l) => doc.splitTextToSize(l, box.w - 2 * padX));

  const pitch = metrics.line * size;
  const block = lines.length * pitch;
  let top;
  if (style.v === 'top') top = box.y + PAD_Y * s;
  else if (style.v === 'center') top = box.y + (box.h - block) / 2;
  else top = box.y + box.h - PAD_Y * s - block;

  let x = box.x + padX;
  let align = 'left';
  if (style.h === 'center') { x = box.x + box.w / 2; align = 'center'; }
  else if (style.h === 'right') { x = box.x + box.w - padX; align = 'right'; }

  lines.forEach((line, i) => {
    doc.text(line, x, top + i * pitch + metrics.ascent * size, { align });
  });
}

// values: {cellRef: text} written over the template, exactly as the Python
// generator writes "{exam} | {room}" into A1 and student lines into seat
// cells. Adds one or more pages to doc (doc already has a current page).
function drawSheetPages(doc, sheet, values) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const { s, xs, pages, top } = sheetLayout(sheet, pageW, pageH);

  const mergeOf = new Map();   // "c,r" -> merge rect, for every covered cell
  const anchorBox = new Map(); // anchor ref -> merge rect
  for (const range of sheet.merges) {
    const m = parseRange(range);
    for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) mergeOf.set(`${c},${r}`, m);
    anchorBox.set(range.split(':')[0], m);
  }
  const sameMerge = (c1, r1, c2, r2) => {
    const a = mergeOf.get(`${c1},${r1}`);
    return a !== undefined && a === mergeOf.get(`${c2},${r2}`);
  };

  pages.forEach((band, pageIdx) => {
    if (pageIdx > 0) doc.addPage(sheet.page.paper, sheet.page.orientation);
    const y0 = sheet.page.vCenter ? (pageH - band.height) / 2 : top;
    // Row edges for this page: rows above the band collapse to y0.
    const ys = new Array(sheet.rowHeights.length + 1).fill(y0);
    for (let r = band.r1; r <= band.r2; r++) ys[r] = ys[r - 1] + sheet.rowHeights[r - 1] * s;
    for (let r = band.r2 + 1; r < ys.length; r++) ys[r] = ys[band.r2];
    const onPage = (r) => r >= band.r1 && r <= band.r2;
    const box = (m) => ({ x: xs[m.c1 - 1], y: ys[m.r1 - 1], w: xs[m.c2] - xs[m.c1 - 1], h: ys[m.r2] - ys[m.r1 - 1] });

    // Borders: every flagged side of every cell, minus the inside of merges.
    doc.setDrawColor(0);
    doc.setLineWidth(BORDER_W);
    const drawn = new Set();
    const seg = (x1, y1, x2, y2) => {
      const k = `${x1.toFixed(2)},${y1.toFixed(2)},${x2.toFixed(2)},${y2.toFixed(2)}`;
      if (drawn.has(k)) return;
      drawn.add(k);
      doc.line(x1, y1, x2, y2);
    };
    for (const [ref, , bits] of sheet.cells) {
      if (!bits.includes('1')) continue;
      const { c, r } = parseRef(ref);
      if (!onPage(r)) continue;
      const x1 = xs[c - 1]; const x2 = xs[c]; const y1 = ys[r - 1]; const y2 = ys[r];
      if (bits[0] === '1' && !sameMerge(c, r, c - 1, r)) seg(x1, y1, x1, y2);
      if (bits[1] === '1' && !sameMerge(c, r, c + 1, r)) seg(x2, y1, x2, y2);
      if (bits[2] === '1' && !sameMerge(c, r, c, r - 1)) seg(x1, y1, x2, y1);
      if (bits[3] === '1' && !sameMerge(c, r, c, r + 1)) seg(x1, y2, x2, y2);
      // Diagonals (the templates' X over a desk with no seat) span the whole
      // merged area when set on its anchor, as Excel draws them.
      if (bits[4] === '1' || bits[5] === '1') {
        const m = anchorBox.get(ref);
        const b = m ? box(m) : { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
        if (bits[4] === '1') doc.line(b.x, b.y + b.h, b.x + b.w, b.y);
        if (bits[5] === '1') doc.line(b.x, b.y, b.x + b.w, b.y + b.h);
      }
    }

    // Text: template labels (KÜRSÜ, KORİDOR) and the values written over it.
    doc.setTextColor(0);
    for (const [ref, styleIdx, , templateValue] of sheet.cells) {
      const text = values[ref] ?? templateValue;
      if (text == null || text === '') continue;
      const { c, r } = parseRef(ref);
      if (!onPage(r)) continue;
      const m = anchorBox.get(ref);
      const b = m ? box(m) : { x: xs[c - 1], y: ys[r - 1], w: xs[c] - xs[c - 1], h: ys[r] - ys[r - 1] };
      drawText(doc, text, sheet.styles[styleIdx], b, s);
    }
  });
}

function roomValues(state, roomId, snaps, mode) {
  const values = { A1: `${state.examName} | ${roomId}` };
  for (const snap of snaps) {
    const lines = seatLines(snap, mode, state);
    if (lines.length) values[snap.cell] = lines.map(String).join('\n');
  }
  return values;
}

// The room's PDF exactly as the CLI's per-room file: page 1 the ID-only
// sheet, page 2 the full sheet.
export function buildRoomPdf(state, classrooms, roomId) {
  const room = classrooms.rooms[roomId];
  const snaps = roomSnapshot(state, roomId);
  const doc = newDoc(room.sheet.page);
  drawSheetPages(doc, room.sheet, roomValues(state, roomId, snaps, 'id'));
  doc.addPage(room.sheet.page.paper, room.sheet.page.orientation);
  drawSheetPages(doc, room.sheet, roomValues(state, roomId, snaps, 'full'));
  return new Uint8Array(doc.output('arraybuffer'));
}

/* ---------------- single-sheet room list ---------------- */

function columnLetter(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Port of export_single_sheet_room_list as LibreOffice prints the CLI's
// workbook: Letter landscape (the workbook names no paper), 100 % scale (the
// workbook sets fitToWidth but not the fit-to-page flag, so no scaling), rows
// flowing onto further pages, 0.2" margins, one 16-wide column per room and
// 8.43-wide filler columns, the CLI's font sizes. The cells name no font, and
// LibreOffice renders such cells in Caladea — so that is what is embedded.
export function roomListSheet(state) {
  const rooms = state.selectedRooms;
  const perRoom = rooms.map((roomId) =>
    roomSnapshot(state, roomId).filter((s) => s.id != null).map((s) => s.id));
  const maxRows = Math.max(0, ...perRoom.map((ids) => ids.length));
  const lastCol = rooms.length + 5;

  const styles = [
    { f: 'Caladea', sz: 12, b: 1, h: 'center', v: 'center', rot: 0, wrap: 0 }, // title
    { f: 'Caladea', sz: 11, b: 1, h: 'center', v: 'bottom', rot: 0, wrap: 0 }, // room header
    { f: 'Caladea', sz: 5.5, b: 0, h: 'center', v: 'bottom', rot: 0, wrap: 0 }, // student id
  ];
  const cells = [['A1', 0, '0000', state.examName]];
  rooms.forEach((roomId, i) => cells.push([`${columnLetter(i + 1)}2`, 1, '0000', roomId]));
  perRoom.forEach((ids, i) => ids.forEach((id, r) => {
    cells.push([`${columnLetter(i + 1)}${r + 3}`, 2, '0000', String(id)]);
  }));

  return {
    page: {
      paper: 'letter', orientation: 'landscape',
      margins: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2 },
      hCenter: false, vCenter: false,
      fitToPage: false, fitToWidth: 1, fitToHeight: 0, scale: 100,
    },
    colWidths: Array.from({ length: lastCol }, (_, i) => (i < rooms.length ? 16 : 8.43)),
    rowHeights: [20, 15, ...Array(maxRows).fill(7.5)],
    merges: [`A1:${columnLetter(lastCol)}1`],
    styles,
    cells,
  };
}

export function buildRoomListPdf(state) {
  const sheet = roomListSheet(state);
  const doc = newDoc(sheet.page);
  drawSheetPages(doc, sheet, {});
  return new Uint8Array(doc.output('arraybuffer'));
}

/* ---------------- merging (pdf-lib) ---------------- */

async function ensurePdfLib() {
  if (!window.PDFLib) await loadScript('vendor/pdf-lib.min.js');
  return window.PDFLib;
}

// Port of merge_pdfs. roomPdfs: [{roomId, bytes}] already in file order.
async function mergeRoomPdfs(roomPdfs, pageIndex, tutanakBytes) {
  const { PDFDocument } = await ensurePdfLib();
  const out = await PDFDocument.create();
  const tutanak = tutanakBytes ? await PDFDocument.load(tutanakBytes) : null;
  for (const { bytes } of roomPdfs) {
    const src = await PDFDocument.load(bytes);
    if (tutanak) {
      const [tp] = await out.copyPages(tutanak, [0]);
      out.addPage(tp);
    }
    const [p] = await out.copyPages(src, [pageIndex]);
    out.addPage(p);
  }
  return out.save();
}

function roomPdfsInFileOrder(state, classrooms) {
  return roomsInFileOrder(state).map((roomId) => ({ roomId, bytes: buildRoomPdf(state, classrooms, roomId) }));
}

const SUFFIX_ID = 'All_Seating_Plans_Only_ID';
const SUFFIX_FULL = 'All_Seating_Plans_Full';
const SUFFIX_TUTANAK = 'All_Seating_Plans_with_Tutanak_Printable';

/* ---------------- public exports ---------------- */

export async function exportRoomPdf(state, classrooms) {
  const roomId = state.activeRoom;
  downloadBytes(buildRoomPdf(state, classrooms, roomId), `${safeFileName(state.examName)}_${roomId}.pdf`, 'application/pdf');
}

export async function exportMergedPdfId(state, classrooms) {
  const bytes = await mergeRoomPdfs(roomPdfsInFileOrder(state, classrooms), 0, null);
  downloadBytes(bytes, `${safeFileName(state.examName)}_${SUFFIX_ID}.pdf`, 'application/pdf');
}

export async function exportMergedPdfFull(state, classrooms) {
  const bytes = await mergeRoomPdfs(roomPdfsInFileOrder(state, classrooms), 1, null);
  downloadBytes(bytes, `${safeFileName(state.examName)}_${SUFFIX_FULL}.pdf`, 'application/pdf');
}

export async function exportMergedPdfTutanak(state, classrooms) {
  const tutanak = await fetchBytes('templates/tutanak.pdf');
  const bytes = await mergeRoomPdfs(roomPdfsInFileOrder(state, classrooms), 1, tutanak);
  downloadBytes(bytes, `${safeFileName(state.examName)}_${SUFFIX_TUTANAK}.pdf`, 'application/pdf');
}

export async function exportRoomListPdf(state) {
  downloadBytes(buildRoomListPdf(state), `${safeFileName(state.examName)}_SingleSheetRoomList.pdf`, 'application/pdf');
}

// Everything the CLI writes into its output directory, as one zip: a
// workbook and a PDF per room, the three merged PDFs and the room list.
export async function exportAllZip(state, classrooms) {
  if (!window.fflate) await loadScript('vendor/fflate.min.js');
  const exam = state.examName;
  const files = {};
  const roomPdfs = [];
  for (const roomId of state.selectedRooms) {
    files[`${exam}_${roomId}.xlsx`] = await buildRoomWorkbook(state, roomId);
    const bytes = buildRoomPdf(state, classrooms, roomId);
    files[`${exam}_${roomId}.pdf`] = bytes;
    roomPdfs.push({ roomId, bytes });
  }
  const ordered = roomsInFileOrder(state).map((roomId) => roomPdfs.find((r) => r.roomId === roomId));
  files[`${exam}_${SUFFIX_ID}.pdf`] = await mergeRoomPdfs(ordered, 0, null);
  files[`${exam}_${SUFFIX_FULL}.pdf`] = await mergeRoomPdfs(ordered, 1, null);
  files[`${exam}_${SUFFIX_TUTANAK}.pdf`] = await mergeRoomPdfs(ordered, 1, await fetchBytes('templates/tutanak.pdf'));
  files[`${exam}_SingleSheetRoomList.xlsx`] = await buildRoomListWorkbook(state);
  files[`${exam}_SingleSheetRoomList.pdf`] = buildRoomListPdf(state);

  const safe = safeFileName(exam);
  const zipped = {};
  for (const [name, bytes] of Object.entries(files)) {
    // Keep the CLI's file names inside the archive; only strip what a file
    // system would reject.
    zipped[`${safe}/${safeFileName(name)}`] = [bytes, { level: name.endsWith('.pdf') ? 1 : 6 }];
  }
  downloadBytes(window.fflate.zipSync(zipped), `${safe}.zip`, 'application/zip');
}
