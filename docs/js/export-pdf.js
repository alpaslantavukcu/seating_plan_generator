// Vector PDF generation with jsPDF. Each room page is the room's Excel
// template drawn the way Excel/LibreOffice prints it (the CLI pipeline's
// PDFs): same paper, margins, centring and fit-to-page scale, same column
// widths and row heights, the template's own borders, fonts (Arial metrics
// via the metric-compatible Liberation Sans subset), alignment and wrapping.
// The geometry comes from the "sheet" model tools/convert_templates.py
// extracts into classrooms.json. Merged documents are simply multiple pages
// in one jsPDF instance — no merge library needed.

import { safeFileName, roomSnapshot, seatLines } from './export-common.js';

const FONT = 'LiberationSans';   // metric-compatible with Arial, OFL 1.1
const PT_PER_INCH = 72;
const CHAR_PT = 5.6;      // one Excel column-width unit (Arial 10 digit) in pt
const PAD_X = 0.3;        // cell padding left/right, pt (LibreOffice wraps this tight)
const PAD_Y = 1.9;        // cell padding top/bottom, pt
const ASCENT = 0.905;     // Liberation Sans ascent / em
const LINE = 1.117;       // ascent + descent: the line pitch spreadsheets use
const CAP = 0.688;        // cap height / em, for centring rotated labels
const BORDER_W = 0.75;    // a "thin" border as Excel prints it

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

// Page position (pt) of every column/row edge after scaling.
function sheetGeometry(sheet, pageW, pageH) {
  const { page } = sheet;
  const cw = sheet.colWidths.map((w) => w * CHAR_PT);
  const rh = sheet.rowHeights;
  const natW = cw.reduce((a, b) => a + b, 0);
  const natH = rh.reduce((a, b) => a + b, 0);
  const m = page.margins;
  const availW = pageW - (m.left + m.right) * PT_PER_INCH;
  const availH = pageH - (m.top + m.bottom) * PT_PER_INCH;

  let s;
  if (page.fitToPage) {
    const sx = page.fitToWidth > 0 ? availW / natW : Infinity;
    const sy = page.fitToHeight > 0 ? availH / natH : Infinity;
    s = Math.min(1, sx, sy);
  } else {
    s = page.scale / 100;
  }
  // A browser export can't spill onto a second sheet: never overflow.
  s = Math.min(s, availW / natW, availH / natH);

  const x0 = page.hCenter ? (pageW - natW * s) / 2 : m.left * PT_PER_INCH;
  const y0 = page.vCenter ? (pageH - natH * s) / 2 : m.top * PT_PER_INCH;
  const xs = [x0];
  cw.forEach((w) => xs.push(xs[xs.length - 1] + w * s));
  const ys = [y0];
  rh.forEach((h) => ys.push(ys[ys.length - 1] + h * s));
  return { s, xs, ys };
}

function drawText(doc, text, style, box, s) {
  const size = style.sz * s;
  doc.setFont(FONT, style.b ? 'bold' : 'normal');
  doc.setFontSize(size);

  if (style.rot === 90) {
    // Reads bottom-to-top like the template; clipped to the merged area the
    // way a spreadsheet clips a label longer than its cell.
    doc.saveGraphicsState();
    doc.rect(box.x, box.y, box.w, box.h, null);
    doc.clip();
    doc.discardPath();
    const len = doc.getTextWidth(text);
    doc.text(text, box.x + box.w / 2 + (CAP * size) / 2, box.y + (box.h + len) / 2, { angle: 90 });
    doc.restoreGraphicsState();
    return;
  }

  const padX = PAD_X * s;
  let lines = String(text).split('\n');
  if (style.wrap) lines = lines.flatMap((l) => doc.splitTextToSize(l, box.w - 2 * padX));

  const pitch = LINE * size;
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
    doc.text(line, x, top + i * pitch + ASCENT * size, { align });
  });
}

// values: {cellRef: text} written over the template, exactly as the Python
// generator writes "{exam} | {room}" into A1 and student lines into seat cells.
function drawSheetPage(doc, sheet, values) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const { s, xs, ys } = sheetGeometry(sheet, pageW, pageH);

  const mergeOf = new Map();   // "c,r" -> merge rect, for every covered cell
  const anchorBox = new Map(); // anchor ref -> merge rect
  for (const range of sheet.merges) {
    const m = parseRange(range);
    for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) mergeOf.set(`${c},${r}`, m);
    anchorBox.set(range.split(':')[0], m);
  }
  const box = (m) => ({ x: xs[m.c1 - 1], y: ys[m.r1 - 1], w: xs[m.c2] - xs[m.c1 - 1], h: ys[m.r2] - ys[m.r1 - 1] });
  const sameMerge = (c1, r1, c2, r2) => {
    const a = mergeOf.get(`${c1},${r1}`);
    return a !== undefined && a === mergeOf.get(`${c2},${r2}`);
  };

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
    const m = anchorBox.get(ref);
    const { c, r } = parseRef(ref);
    const b = m ? box(m) : { x: xs[c - 1], y: ys[r - 1], w: xs[c] - xs[c - 1], h: ys[r] - ys[r - 1] };
    drawText(doc, text, sheet.styles[styleIdx], b, s);
  }
}

export function drawRoomPage(doc, roomId, room, snaps, mode, cellFields, examName) {
  const values = { A1: `${examName} | ${roomId}` };
  for (const snap of snaps) {
    const lines = seatLines(snap, mode, cellFields);
    if (lines.length) values[snap.cell] = lines.map(String).join('\n');
  }
  drawSheetPage(doc, room.sheet, values);
}

function addRoomPage(doc, room) {
  if (!doc) return newDoc(room.sheet.page);
  doc.addPage(room.sheet.page.paper, room.sheet.page.orientation);
  return doc;
}

/* ---------------- public exports ---------------- */

export async function exportRoomPdf(state, classrooms) {
  const roomId = state.activeRoom;
  const room = classrooms.rooms[roomId];
  const snaps = roomSnapshot(state, roomId);
  const doc = addRoomPage(null, room);
  drawRoomPage(doc, roomId, room, snaps, 'id', state.cellFields, state.examName);
  addRoomPage(doc, room);
  drawRoomPage(doc, roomId, room, snaps, 'full', state.cellFields, state.examName);
  doc.save(`${safeFileName(state.examName)}_${roomId}.pdf`);
}

function exportMerged(state, classrooms, mode, suffix) {
  let doc = null;
  for (const roomId of state.selectedRooms) {
    const room = classrooms.rooms[roomId];
    doc = addRoomPage(doc, room);
    drawRoomPage(doc, roomId, room, roomSnapshot(state, roomId), mode, state.cellFields, state.examName);
  }
  doc.save(`${safeFileName(state.examName)}_${suffix}.pdf`);
}

export async function exportMergedPdfId(state, classrooms) {
  exportMerged(state, classrooms, 'id', 'All_Seating_Plans_Only_ID');
}

export async function exportMergedPdfFull(state, classrooms) {
  exportMerged(state, classrooms, 'full', 'All_Seating_Plans_Full');
}

// Port of export_single_sheet_room_list: one 16-wide column per room with the
// student IDs in seat order at 5.5pt on 7.5pt rows, a bold title merged across
// rooms+5 columns, landscape, 0.2" margins, fit to one page wide. Built as the
// same sheet model the room templates use, so it prints like the CLI's PDF.
function columnLetter(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function roomListSheet(state) {
  const rooms = state.selectedRooms;
  const perRoom = rooms.map((roomId) =>
    roomSnapshot(state, roomId).filter((s) => s.id != null).map((s) => s.id));
  const maxRows = Math.max(...perRoom.map((ids) => ids.length));
  const lastCol = rooms.length + 5;

  const styles = [
    { sz: 12, b: 1, h: 'center', v: 'center', rot: 0, wrap: 0 }, // title
    { sz: 11, b: 1, h: 'center', v: 'bottom', rot: 0, wrap: 0 },  // room header
    { sz: 5.5, b: 0, h: 'center', v: 'bottom', rot: 0, wrap: 0 }, // student id
  ];
  const cells = [['A1', 0, '0000', state.examName]];
  rooms.forEach((roomId, i) => cells.push([`${columnLetter(i + 1)}2`, 1, '0000', roomId]));
  perRoom.forEach((ids, i) => ids.forEach((id, r) => {
    cells.push([`${columnLetter(i + 1)}${r + 3}`, 2, '0000', String(id)]);
  }));

  return {
    page: {
      paper: 'a4', orientation: 'landscape',
      margins: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2 },
      hCenter: false, vCenter: false,
      fitToPage: true, fitToWidth: 1, fitToHeight: 0, scale: 100,
    },
    colWidths: Array.from({ length: lastCol }, (_, i) => (i < rooms.length ? 16 : 8.43)),
    rowHeights: [20, 15, ...Array(maxRows).fill(7.5)],
    merges: [`A1:${columnLetter(lastCol)}1`],
    styles,
    cells,
  };
}

export async function exportRoomListPdf(state) {
  const sheet = roomListSheet(state);
  const doc = newDoc(sheet.page);
  drawSheetPage(doc, sheet, {});
  doc.save(`${safeFileName(state.examName)}_SingleSheetRoomList.pdf`);
}
