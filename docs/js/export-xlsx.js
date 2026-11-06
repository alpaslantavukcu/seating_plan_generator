// Excel workbooks built the way the Python generator builds them: load the
// room's own template (docs/templates/Template_<room>.xlsx, synced from
// Templates/ by tools/convert_templates.py), write "{exam} | {room}" into A1
// and the student lines into the seat cells, and keep everything else —
// fonts, borders, column widths, row heights, A4 paper, margins, print area,
// fit-to-page — exactly as the template has it. Per room a "<room>_id_only"
// and a "<room>_full" sheet, plus the SingleSheetRoomList workbook.

import { safeFileName, roomSnapshot, seatLines, downloadBlob } from './export-common.js';

const templateCache = new Map();

async function templateBuffer(roomId) {
  if (!templateCache.has(roomId)) {
    templateCache.set(roomId, (async () => {
      const res = await fetch(`templates/Template_${encodeURIComponent(roomId)}.xlsx`);
      if (!res.ok) throw new Error(`template for ${roomId}: HTTP ${res.status}`);
      return res.arrayBuffer();
    })());
  }
  return templateCache.get(roomId);
}

// Copy the template's only sheet into wb under a new name (openpyxl's
// copy_worksheet in the Python version). Loading a fresh copy per sheet keeps
// the two sheets from sharing style objects.
async function addTemplateSheet(wb, roomId, sheetName) {
  const src = new ExcelJS.Workbook();
  await src.xlsx.load(await templateBuffer(roomId));
  const model = src.worksheets[0].model;
  const ws = wb.addWorksheet(sheetName);
  ws.model = { ...model, name: sheetName, mergeCells: model.merges };
  return ws;
}

async function buildRoomSheet(wb, roomId, snaps, sheetName, mode, cellFields, examName) {
  const ws = await addTemplateSheet(wb, roomId, sheetName);
  ws.getCell('A1').value = `${examName} | ${roomId}`;
  for (const snap of snaps) {
    const lines = seatLines(snap, mode, cellFields);
    if (lines.length) ws.getCell(snap.cell).value = lines.join('\n');
  }
  return ws;
}

async function download(wb, filename) {
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), filename);
}

async function addRoomSheets(wb, state, roomId) {
  const snaps = roomSnapshot(state, roomId);
  await buildRoomSheet(wb, roomId, snaps, `${roomId}_id_only`, 'id', state.cellFields, state.examName);
  await buildRoomSheet(wb, roomId, snaps, `${roomId}_full`, 'full', state.cellFields, state.examName);
}

export async function exportRoomXlsx(state, classrooms) {
  const wb = new ExcelJS.Workbook();
  await addRoomSheets(wb, state, state.activeRoom);
  await download(wb, `${safeFileName(state.examName)}_${state.activeRoom}.xlsx`);
}

export async function exportAllXlsx(state, classrooms) {
  const wb = new ExcelJS.Workbook();
  for (const roomId of state.selectedRooms) await addRoomSheets(wb, state, roomId);
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
