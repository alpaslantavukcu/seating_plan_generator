// Vector PDF generation with jsPDF + embedded Noto Sans subset (Turkish
// glyphs). Each room is drawn as a bordered grid mirroring the Excel
// template geometry from classrooms.json. Merged documents are simply
// multiple pages in one jsPDF instance — no merge library needed.

import { PT_TO_MM, CHAR_TO_MM, safeFileName, roomSnapshot, seatLines } from './export-common.js';

const MARGIN = 10;
const TITLE_H = 12;
const LECTERN_H = 8;
const PAD = 1.5;         // mm kept clear inside every cell
const LINE = 1.2;        // line-height as a multiple of the font size
const FONT = 'NotoSans';

function newDoc(orientation) {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ orientation, unit: 'mm', format: 'a4' });
}

function pageSize(doc) {
  return { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight() };
}

const CORRIDOR_RATIO = 1 / 3;  // widest an aisle may be, relative to a seat

// Geometry (mm) for one room: the template rendered at its true size, scaled
// by a single factor so it fits the page in both axes — which keeps the
// template's aspect ratio instead of stretching columns and rows apart.
function roomLayout(room, pageW, pageH) {
  const usableW = pageW - 2 * MARGIN;
  const usableH = pageH - 2 * MARGIN - TITLE_H - LECTERN_H;

  // MED_* and EEB_* give the corridor a full seat's width, which reads as a
  // missing column rather than an aisle. Cap it and let the seats have the
  // difference, so every room's stripe looks like every other room's.
  const seatUnits = Math.min(...room.columns.filter((c) => c.type === 'seat').map((c) => c.width));
  const units = room.columns.map((c) => (c.type === 'seat'
    ? c.width
    : Math.min(c.width, seatUnits * CORRIDOR_RATIO)));

  const natW = units.reduce((a, b) => a + b, 0) * CHAR_TO_MM;
  const natH = room.bands.length * room.rowHeight * 3 * PT_TO_MM;
  const scale = Math.min(usableW / natW, usableH / natH);

  const total = natW * scale;
  const gridH = natH * scale;
  const left = (pageW - total) / 2;
  let x = left;
  const cols = {};
  room.columns.forEach((c, i) => {
    const w = units[i] * CHAR_TO_MM * scale;
    cols[c.letter] = { x, w };
    x += w;
  });
  return {
    cols,
    left,
    total,
    seatW: seatUnits * CHAR_TO_MM * scale,
    bandH: gridH / room.bands.length,
    // title + lectern + grid are centered vertically as one block
    top: (pageH - (TITLE_H + LECTERN_H + gridH)) / 2,
  };
}

function fitText(doc, text, maxW, size, minSize = 5) {
  doc.setFontSize(size);
  while (size > minSize && doc.getTextWidth(text) > maxW) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  return size;
}

// The fields a seat cell holds, in the order seatLines emits them.
function lineRoles(mode, cellFields, idBase) {
  if (mode === 'id') return [{ bold: true, base: idBase }];
  const roles = [];
  if (cellFields.id) roles.push({ bold: true, base: idBase });
  if (cellFields.name) roles.push({ bold: false, base: idBase * 0.85 });
  if (cellFields.seat) roles.push({ bold: false, base: idBase * 0.72 });
  return roles;
}

// One font size per field for the WHOLE room: the largest at which every
// string of that kind still fits its cell on a single line. A shared size plus
// a fixed one-line-per-field layout puts every id, name and seat number on the
// same baseline page-wide — cells that differ in size or line count are what
// made the grid look ragged.
function uniformSizes(doc, rows, roles, maxW, maxH) {
  const sizes = roles.map((r) => r.base);
  roles.forEach((role, i) => {
    doc.setFont(FONT, role.bold ? 'bold' : 'normal');
    for (const lines of rows) sizes[i] = fitText(doc, lines[i], maxW, sizes[i], 4);
    // Keep the field order legible: a long name shrinking must pull the "(n)"
    // below it down too, otherwise the seat number shouts over the name.
    if (i > 0) sizes[i] = Math.min(sizes[i], sizes[i - 1]);
  });
  const stack = sizes.reduce((a, s) => a + s * PT_TO_MM * LINE, 0);
  if (stack <= maxH) return sizes;
  return sizes.map((s) => Math.max(4, s * (maxH / stack)));
}

// Wrap each spec onto as many lines as it needs, shrinking the whole block
// until it also fits maxH. Nothing ever leaves the box: splitTextToSize
// breaks on spaces and fitText is the backstop for one over-long word.
// Used for the title/lectern bands, where a second line is fine.
// specs: [{text, base, bold}] -> [{text, size, bold}]
function cellLines(doc, specs, maxW, maxH) {
  for (let shrink = 1; ; shrink -= 0.05) {
    const out = [];
    let h = 0;
    for (const s of specs) {
      const size = Math.max(4, s.base * shrink);
      doc.setFont(FONT, s.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      for (const part of doc.splitTextToSize(s.text, maxW)) {
        const ps = fitText(doc, part, maxW, size, 4);
        out.push({ text: part, size: ps, bold: s.bold });
        h += ps * PT_TO_MM * LINE;
      }
    }
    if (h <= maxH || shrink <= 0.5) return out;
  }
}

// Draw pre-measured lines centered in the box (x, y, w, h).
function drawLines(doc, lines, x, y, w, h) {
  const totalH = lines.reduce((a, l) => a + l.size * PT_TO_MM * LINE, 0);
  let ty = y + (h - totalH) / 2;
  for (const l of lines) {
    const lh = l.size * PT_TO_MM * LINE;
    doc.setFont(FONT, l.bold ? 'bold' : 'normal');
    doc.setFontSize(l.size);
    doc.text(l.text, x + w / 2, ty + lh / 2, { align: 'center', baseline: 'middle' });
    ty += lh;
  }
}

export function drawRoomPage(doc, roomId, room, snaps, mode, cellFields, examName) {
  const { w: pageW, h: pageH } = pageSize(doc);
  const { cols, left, total, seatW, bandH, top } = roomLayout(room, pageW, pageH);
  const bands = room.bands.length;

  doc.setDrawColor(0);
  doc.setLineWidth(0.25);

  // Title band: "{exam} | {room}" — mirrors template cell A1
  const titleY = top;
  doc.rect(left, titleY, total, TITLE_H);
  const title = `${examName} | ${roomId}`;
  drawLines(doc, cellLines(doc, [{ text: title, base: 13, bold: true }],
    total - 2 * PAD, TITLE_H - PAD), left, titleY, total, TITLE_H);

  // Lectern (KÜRSÜ) band
  const lectY = titleY + TITLE_H;
  doc.setFillColor(245, 245, 245);
  doc.rect(left, lectY, total, LECTERN_H, 'FD');
  drawLines(doc, cellLines(doc, [{ text: room.lectern, base: 11, bold: true }],
    total - 2 * PAD, LECTERN_H - PAD), left, lectY, total, LECTERN_H);

  const gridTop = lectY + LECTERN_H;
  const gridBottom = gridTop + bands * bandH;

  // Corridors: full-height striped columns with a vertical label.
  // jsPDF 2.5.2 applies align/baseline in unrotated page space and only then
  // rotates, which throws the label half its own length out of the column —
  // so anchor it by hand and pass nothing but the angle. angle 90 emits
  // Tm [0 1 -1 0]: the text reads bottom-to-top with glyph tops facing left,
  // hence the baseline sits right of centre by about half the cap height.
  for (const corridor of room.corridors) {
    const c = cols[corridor.col];
    doc.setFillColor(238, 238, 238);
    doc.rect(c.x, gridTop, c.w, gridBottom - gridTop, 'FD');
    doc.setFont(FONT, 'normal');
    doc.setTextColor(120);
    const size = fitText(doc, corridor.label, gridBottom - gridTop,
      Math.min(10, Math.max(6, c.w * 0.4)));
    const len = doc.getTextWidth(corridor.label);
    doc.text(corridor.label, c.x + c.w / 2 + size * PT_TO_MM * 0.35,
      (gridTop + gridBottom + len) / 2, { angle: 90 });
    doc.setTextColor(0);
  }

  // Unassigned desks: bordered, hatched-looking gray fill
  for (const desk of room.unassignedDesks || []) {
    const c = cols[desk.col];
    doc.setFillColor(228, 228, 228);
    doc.rect(c.x, gridTop + desk.band * bandH, c.w, bandH, 'FD');
  }

  // Seats: borders first, then text once the room-wide sizes are known.
  // Base sizes track the band height so the bigger cells of small rooms don't
  // end up with a lonely 9pt id floating in the middle.
  const idBase = Math.min(14, Math.max(9, bandH * 0.38));
  const roles = lineRoles(mode, cellFields, idBase);
  const seatByN = {};
  room.seats.forEach((s) => { seatByN[s.n] = s; });

  const filled = [];
  for (const snap of snaps) {
    const def = seatByN[snap.seat];
    const c = cols[def.col];
    const y = gridTop + def.band * bandH;
    doc.rect(c.x, y, c.w, bandH);
    const lines = seatLines(snap, mode, cellFields);
    if (lines.length) filled.push({ lines: lines.map(String), x: c.x, y, w: c.w });
  }
  if (!filled.length) return;

  const sizes = uniformSizes(doc, filled.map((f) => f.lines), roles,
    seatW - 2 * PAD, bandH - 2 * PAD);
  for (const f of filled) {
    drawLines(doc, f.lines.map((text, i) => ({ text, size: sizes[i], bold: roles[i].bold })),
      f.x, f.y, f.w, bandH);
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
