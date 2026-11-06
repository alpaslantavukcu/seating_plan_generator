// Helpers shared by the PDF and Excel exporters.

import { activeCellOrder } from './store.js';

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

// Lines shown inside a seat cell. mode 'id' is the "<room>_id_only" sheet
// (student ID only, whatever the fields say); 'full' follows the enabled
// fields in their configured order, exactly like the CLI's cell_params.
export function seatLines(snap, mode, state) {
  if (snap.id == null) return [];
  if (mode === 'id') return [snap.id];
  const lines = [];
  for (const key of activeCellOrder(state)) {
    if (key === 'id') lines.push(snap.id);
    else if (key === 'name') lines.push(snap.name);
    else if (key === 'seat') lines.push(`(${snap.seat})`);
  }
  return lines;
}

// The CLI merges rooms in sorted(file name) order, not input order; the
// per-room file names share the exam prefix, so this is the room sort.
export function roomsInFileOrder(state) {
  const key = (roomId) => `${state.examName}_${roomId}.pdf`;
  return state.selectedRooms.slice().sort((a, b) => {
    const ka = key(a); const kb = key(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
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

export function downloadBytes(bytes, filename, type = 'application/octet-stream') {
  downloadBlob(new Blob([bytes], { type }), filename);
}

// Vendored libraries that are only needed for exports are loaded on first
// use so the page itself stays light.
const scriptLoads = new Map();
export function loadScript(src) {
  if (!scriptLoads.has(src)) {
    scriptLoads.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => { scriptLoads.delete(src); reject(new Error(`failed to load ${src}`)); };
      document.head.appendChild(el);
    }));
  }
  return scriptLoads.get(src);
}

const fetchCache = new Map();
export function fetchBytes(url) {
  if (!fetchCache.has(url)) {
    fetchCache.set(url, (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    })().catch((err) => { fetchCache.delete(url); throw err; }));
  }
  return fetchCache.get(url);
}
