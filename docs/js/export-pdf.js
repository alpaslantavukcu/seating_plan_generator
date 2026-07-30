// Vector PDF generation with jsPDF + embedded Noto Sans subset (Turkish
// glyphs). Each room is drawn as a bordered grid mirroring the Excel
// template geometry from classrooms.json. Merged documents are simply
// multiple pages in one jsPDF instance — no merge library needed.

import { PT_TO_MM, CHAR_TO_MM, safeFileName, roomSnapshot, seatLines } from './export-common.js';

const MARGIN = 10;
const TITLE_H = 12;
const LECTERN_H = 8;
const MAX_COL_MM = 30;   // cap so tiny rooms don't get comically wide cells
const FONT = 'NotoSans';

function newDoc(orientation) {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ orientation, unit: 'mm', format: 'a4' });
}

function pageSize(doc) {
  return { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight() };
}

// Column x-positions/widths (mm) for a room, centered on the page.
function columnLayout(room, pageW) {
  const usable = pageW - 2 * MARGIN;
  const units = room.columns.reduce((s, c) => s + c.width, 0);
  const scale = Math.min(usable / units, MAX_COL_MM / Math.max(...room.columns.map((c) => c.width)));
  const widths = room.columns.map((c) => c.width * scale);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = (pageW - total) / 2;
  const cols = {};
  room.columns.forEach((c, i) => {
    cols[c.letter] = { x, w: widths[i] };
    x += widths[i];
  });
  return { cols, left: (pageW - total) / 2, total };
}

function fitText(doc, text, maxW, size, minSize = 5) {
  doc.setFontSize(size);
  while (size > minSize && doc.getTextWidth(text) > maxW) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  return size;
}

export function drawRoomPage(doc, roomId, room, snaps, mode, cellFields, examName) {
  const { w: pageW, h: pageH } = pageSize(doc);
  const { cols, left, total } = columnLayout(room, pageW);

  let bandH = room.rowHeight * 3 * PT_TO_MM;
  const bands = room.bands.length;
  const usableH = pageH - 2 * MARGIN - TITLE_H - LECTERN_H;
  if (bands * bandH > usableH) bandH = usableH / bands;

  doc.setDrawColor(0);
  doc.setLineWidth(0.25);

  // Title band: "{exam} | {room}" — mirrors template cell A1
  const titleY = MARGIN;
  doc.rect(left, titleY, total, TITLE_H);
  doc.setFont(FONT, 'bold');
  const title = `${examName} | ${roomId}`;
  fitText(doc, title, total - 4, 13, 8);
  doc.text(title, pageW / 2, titleY + TITLE_H / 2, { align: 'center', baseline: 'middle' });

  // Lectern (KÜRSÜ) band
  const lectY = titleY + TITLE_H;
  doc.setFillColor(245, 245, 245);
  doc.rect(left, lectY, total, LECTERN_H, 'FD');
  doc.setFontSize(11);
  doc.text(room.lectern, pageW / 2, lectY + LECTERN_H / 2, { align: 'center', baseline: 'middle' });

  const gridTop = lectY + LECTERN_H;
  const gridBottom = gridTop + bands * bandH;

  // Corridors: full-height striped columns with vertical label
  for (const corridor of room.corridors) {
    const c = cols[corridor.col];
    doc.setFillColor(238, 238, 238);
    doc.rect(c.x, gridTop, c.w, gridBottom - gridTop, 'FD');
    doc.setFont(FONT, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(corridor.label, c.x + c.w / 2, (gridTop + gridBottom) / 2, {
      align: 'center', baseline: 'middle', angle: 90,
    });
    doc.setTextColor(0);
  }

  // Unassigned desks: bordered, hatched-looking gray fill
  for (const desk of room.unassignedDesks || []) {
    const c = cols[desk.col];
    doc.setFillColor(228, 228, 228);
    doc.rect(c.x, gridTop + desk.band * bandH, c.w, bandH, 'FD');
  }

  // Seats
  const seatByN = {};
  room.seats.forEach((s) => { seatByN[s.n] = s; });
  for (const snap of snaps) {
    const def = seatByN[snap.seat];
    const c = cols[def.col];
    const y = gridTop + def.band * bandH;
    doc.rect(c.x, y, c.w, bandH);

    const lines = seatLines(snap, mode, cellFields);
    if (!lines.length) continue;

    const specs = lines.map((text, i) => {
      const isId = mode === 'id' || (cellFields.id && i === 0);
      const base = isId ? 9 : (text.startsWith('(') ? 7 : 8);
      doc.setFont(FONT, isId ? 'bold' : 'normal');
      const size = fitText(doc, text, c.w - 2, base);
      return { text, size, bold: isId };
    });
    const lineH = specs.map((s) => s.size * PT_TO_MM * 1.25);
    const totalH = lineH.reduce((a, b) => a + b, 0);
    let ty = y + (bandH - totalH) / 2;
    specs.forEach((s, i) => {
      doc.setFont(FONT, s.bold ? 'bold' : 'normal');
      doc.setFontSize(s.size);
      doc.text(s.text, c.x + c.w / 2, ty + lineH[i] / 2, { align: 'center', baseline: 'middle' });
      ty += lineH[i];
    });
  }
}

/* ---------------- public exports ---------------- */

export async function exportRoomPdf(state, classrooms) {
  const roomId = state.activeRoom;
  const room = classrooms.rooms[roomId];
  const snaps = roomSnapshot(state, roomId);
  const doc = newDoc(room.orientation);
  drawRoomPage(doc, roomId, room, snaps, 'id', state.cellFields, state.examName);
  doc.addPage('a4', room.orientation);
  drawRoomPage(doc, roomId, room, snaps, 'full', state.cellFields, state.examName);
  doc.save(`${safeFileName(state.examName)}_${roomId}.pdf`);
}

function exportMerged(state, classrooms, mode, suffix) {
  let doc = null;
  for (const roomId of state.selectedRooms) {
    const room = classrooms.rooms[roomId];
    if (!doc) doc = newDoc(room.orientation);
    else doc.addPage('a4', room.orientation);
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

// Landscape page, one column per room, student IDs in seat order at 5.5pt —
// port of export_single_sheet_room_list.
export async function exportRoomListPdf(state, classrooms) {
  const doc = newDoc('landscape');
  const { w: pageW, h: pageH } = pageSize(doc);
  const margin = 6;
  const usableW = pageW - 2 * margin;
  const rooms = state.selectedRooms;
  const colW = usableW / rooms.length;
  const idRowH = 7.5 * PT_TO_MM + 0.4;
  const headerH = 6;

  const perRoom = rooms.map((roomId) =>
    roomSnapshot(state, roomId).filter((s) => s.id != null).map((s) => s.id));
  const maxRows = Math.max(...perRoom.map((ids) => ids.length));

  let page = 0;
  let row = 0;
  while (row < maxRows) {
    if (page > 0) doc.addPage('a4', 'landscape');
    let y = margin;
    doc.setFont(FONT, 'bold');
    fitText(doc, state.examName, usableW, 12);
    doc.text(state.examName, pageW / 2, y + 3, { align: 'center', baseline: 'middle' });
    y += 8;
    rooms.forEach((roomId, i) => {
      const x = margin + i * colW;
      doc.rect(x, y, colW, headerH);
      doc.setFont(FONT, 'bold');
      fitText(doc, roomId, colW - 2, 9);
      doc.text(roomId, x + colW / 2, y + headerH / 2, { align: 'center', baseline: 'middle' });
    });
    y += headerH;

    const rowsThisPage = Math.min(maxRows - row, Math.floor((pageH - margin - y) / idRowH));
    doc.setFont(FONT, 'normal');
    doc.setFontSize(5.5);
    for (let r = 0; r < rowsThisPage; r++) {
      perRoom.forEach((ids, i) => {
        const id = ids[row + r];
        if (id != null) {
          doc.text(String(id), margin + i * colW + colW / 2, y + r * idRowH + idRowH / 2, {
            align: 'center', baseline: 'middle',
          });
        }
      });
    }
    row += rowsThisPage;
    page++;
  }
  doc.save(`${safeFileName(state.examName)}_SingleSheetRoomList.pdf`);
}
