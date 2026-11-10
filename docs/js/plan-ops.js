// Hand edits to a generated plan. Every change marks the plan as edited, so
// later setting changes ask before throwing the edits away.

import { update } from './store.js';
import { formatLongName } from './parse.js';

export function findEntry(s, room, seat) {
  return s.plan?.[room]?.find((entry) => entry.seat === seat) ?? null;
}

// Occupied ↔ occupied swaps two students; occupied ↔ empty moves one.
// Works across rooms too.
export function swapSeats(a, b) {
  update((s) => {
    const x = findEntry(s, a.room, a.seat);
    const y = findEntry(s, b.room, b.seat);
    if (!x || !y || x === y) return;
    if (x.studentIdx == null && y.studentIdx == null) return;
    [x.studentIdx, y.studentIdx] = [y.studentIdx, x.studentIdx];
    s.planEdited = true;
  });
}

export function clearSeat(room, seat) {
  update((s) => {
    const entry = findEntry(s, room, seat);
    if (!entry || entry.studentIdx == null) return;
    entry.studentIdx = null;
    s.planEdited = true;
  });
}

// Edit the seated student, or add a new student to an empty seat.
export function saveSeatStudent(room, seat, id, rawName) {
  update((s) => {
    const entry = findEntry(s, room, seat);
    if (!entry) return;
    if (entry.studentIdx != null) {
      const student = s.students[entry.studentIdx];
      student.id = id;
      student.rawName = rawName;
      student.name = formatLongName(rawName);
    } else {
      s.students.push({ id, rawName, name: formatLongName(rawName) });
      entry.studentIdx = s.students.length - 1;
    }
    s.planEdited = true;
  });
}

// How many students hold a seat in the plan (a cleared seat leaves one out).
export function placedCount(s) {
  if (!s.plan) return 0;
  const placed = new Set();
  for (const entries of Object.values(s.plan)) {
    for (const entry of entries) if (entry.studentIdx != null) placed.add(entry.studentIdx);
  }
  return placed.size;
}
