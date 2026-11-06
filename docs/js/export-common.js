// Helpers shared by the PDF and Excel exporters.

export function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || 'seating-plan';
}

// Snapshot of one room's current (possibly edited) occupancy:
// [{seat, cell, id, name}] in seat order; id/name null for empty seats.
export function roomSnapshot(state, roomId) {
  return state.plan[roomId].map((entry) => {
    const student = entry.studentIdx != null ? state.students[entry.studentIdx] : null;
    return {
      seat: entry.seat,
      cell: entry.cell,
      id: student ? student.id : null,
      name: student ? student.name : null,
    };
  });
}

// Lines shown inside a seat cell, mirroring the Python cell_params order
// (student_id, name, seat_number).
export function seatLines(snap, mode, cellFields) {
  if (snap.id == null) return [];
  if (mode === 'id') return [snap.id];
  const lines = [];
  if (cellFields.id) lines.push(snap.id);
  if (cellFields.name) lines.push(snap.name);
  if (cellFields.seat) lines.push(`(${snap.seat})`);
  return lines;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
