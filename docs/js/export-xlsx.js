// Excel workbooks rebuilt from classrooms.json with ExcelJS — same sheet
// structure as the Python generator: per room a "<room>_id_only" and a
// "<room>_full" sheet, plus the SingleSheetRoomList workbook.

import { safeFileName, roomSnapshot, seatLines, downloadBlob } from './export-common.js';

const THIN = { style: 'thin', color: { argb: 'FF000000' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const CENTER = { horizontal: 'center', vertical: 'center', wrapText: true };

function colLetterToIndex(letter) {
  let n = 0;
  for (const ch of letter) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function buildRoomSheet(wb, roomId, room, snaps, sheetName, mode, cellFields, examName) {
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      orientation: room.orientation,
      fitToPage: true,
      margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 },
    },
  });

  room.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });
  const lastRow = room.extent.lastRow;
  for (let r = 1; r <= lastRow; r++) ws.getRow(r).height = room.rowHeight;

  const lastCol = room.extent.lastCol;

  // Title (rows 1-2) and lectern (row 3) bands, as in the templates
  ws.mergeCells(`A1:${lastCol}2`);
  const title = ws.getCell('A1');
  title.value = `${examName} | ${roomId}`;
  title.font = { name: 'Arial', size: 13, bold: true };
  title.alignment = CENTER;

  ws.mergeCells(`A3:${lastCol}3`);
  const lectern = ws.getCell('A3');
  lectern.value = room.lectern;
  lectern.font = { name: 'Arial', size: 11, bold: true };
  lectern.alignment = CENTER;

  // Corridors: vertical repeated label spanning the seat rows
  for (const corridor of room.corridors) {
    ws.mergeCells(corridor.range);
    const cell = ws.getCell(corridor.range.split(':')[0]);
    cell.value = Array(7).fill(corridor.label).join(' '.repeat(16));
    cell.font = { name: 'Arial', size: 8 };
    cell.alignment = { horizontal: 'center', vertical: 'center', textRotation: 90 };
    cell.border = { left: THIN, right: THIN };
  }

  // Unassigned desks: bordered empty cells
  for (const desk of room.unassignedDesks || []) {
    const row = room.bands[desk.band];
    ws.mergeCells(`${desk.col}${row}:${desk.col}${row + 2}`);
    ws.getCell(`${desk.col}${row}`).border = BORDER;
  }

  // Seats
  const seatByN = {};
  room.seats.forEach((s) => { seatByN[s.n] = s; });
  for (const snap of snaps) {
    const def = seatByN[snap.seat];
    const row = room.bands[def.band];
    ws.mergeCells(`${def.col}${row}:${def.col}${row + 2}`);
    const cell = ws.getCell(`${def.col}${row}`);
    cell.border = BORDER;
    cell.alignment = CENTER;
    const lines = seatLines(snap, mode, cellFields);
    if (lines.length) {
      cell.value = lines.join('\n');
      cell.font = { name: 'Arial', size: 8 };
    }
  }

  // Keep ExcelJS from writing phantom styles past the layout
  ws.getColumn(colLetterToIndex(lastCol) + 1).width = 8.43;
  return ws;
}

async function download(wb, filename) {
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), filename);
}

function addRoomSheets(wb, state, classrooms, roomId) {
  const room = classrooms.rooms[roomId];
  const snaps = roomSnapshot(state, roomId);
  buildRoomSheet(wb, roomId, room, snaps, `${roomId}_id_only`, 'id', state.cellFields, state.examName);
  buildRoomSheet(wb, roomId, room, snaps, `${roomId}_full`, 'full', state.cellFields, state.examName);
}

export async function exportRoomXlsx(state, classrooms) {
  const wb = new ExcelJS.Workbook();
  addRoomSheets(wb, state, classrooms, state.activeRoom);
  await download(wb, `${safeFileName(state.examName)}_${state.activeRoom}.xlsx`);
}

export async function exportAllXlsx(state, classrooms) {
  const wb = new ExcelJS.Workbook();
  for (const roomId of state.selectedRooms) addRoomSheets(wb, state, classrooms, roomId);
  await download(wb, `${safeFileName(state.examName)}_All_Rooms.xlsx`);
}

// Port of export_single_sheet_room_list: one column per room, student IDs
// in seat order, 5.5pt, landscape fit-to-width.
export async function exportRoomListXlsx(state, classrooms) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Room List', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, header: 0.1, footer: 0.1 },
    },
  });

  const rooms = state.selectedRooms;
  ws.mergeCells(1, 1, 1, rooms.length + 5);
  const title = ws.getCell(1, 1);
  title.value = state.examName;
  title.font = { name: 'Arial', size: 12, bold: true };
  title.alignment = { horizontal: 'center', vertical: 'center' };
  ws.getRow(1).height = 20;

  rooms.forEach((roomId, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = roomId;
    cell.font = { name: 'Arial', bold: true };
    cell.alignment = { horizontal: 'center' };
    ws.getColumn(i + 1).width = 16;
  });

  const perRoom = rooms.map((roomId) =>
    roomSnapshot(state, roomId).filter((s) => s.id != null).map((s) => s.id));
  const maxRows = Math.max(...perRoom.map((ids) => ids.length));
  for (let r = 0; r < maxRows; r++) {
    ws.getRow(r + 3).height = 7.5;
    perRoom.forEach((ids, i) => {
      if (ids[r] != null) {
        const cell = ws.getCell(r + 3, i + 1);
        cell.value = ids[r];
        cell.font = { name: 'Arial', size: 5.5 };
        cell.alignment = { horizontal: 'center' };
      }
    });
  }

  await download(wb, `${safeFileName(state.examName)}_SingleSheetRoomList.xlsx`);
}
