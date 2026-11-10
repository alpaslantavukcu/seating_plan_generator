// Renders the active classroom as a CSS grid mirroring the physical layout
// extracted from the Excel templates (data/classrooms.json): title bar,
// lectern (KÜRSÜ) band, seat columns with real width ratios, striped
// corridor columns with vertical labels. Rows stretch to fill the window up
// to a comfortable seat height and scroll inside the grid area beyond that.

import { t } from './i18n.js';
import { activeCellOrder } from './store.js';
import { el, rebuild } from './ui.js';

export function renderGrid(state, classrooms) {
  const wrap = document.getElementById('grid-wrap');
  wrap.replaceChildren();
  const roomId = state.activeRoom;
  if (!state.plan || !roomId || !state.plan[roomId]) return;

  const room = classrooms.rooms[roomId];
  const entries = state.plan[roomId];
  const bands = room.bands.length;
  const seatCols = room.columns.filter((c) => c.type !== 'corridor').length;
  const corridorCols = room.columns.length - seatCols;

  const grid = el('div', 'room-grid');
  grid.style.gridTemplateColumns = room.columns
    .map((c) => `minmax(${c.type === 'corridor' ? '24px' : 'var(--seat-min)'}, ${c.width}fr)`)
    .join(' ');
  grid.style.gridTemplateRows = `auto auto repeat(${bands}, minmax(50px, 1fr))`;
  grid.style.maxWidth = `${seatCols * 150 + corridorCols * 44}px`; // no giant seats in small rooms
  grid.style.maxHeight = `${92 + bands * 84}px`;

  const colIndex = {};
  room.columns.forEach((c, i) => { colIndex[c.letter] = i + 1; });

  const title = el('div', 'g-title', state.examName ? `${state.examName} | ${roomId}` : roomId);
  title.style.gridRow = '1';
  grid.appendChild(title);

  const lectern = el('div', 'g-lectern', room.lectern);
  lectern.style.gridRow = '2';
  grid.appendChild(lectern);

  for (const corridor of room.corridors) {
    const c = el('div', 'g-corridor', corridor.label);
    c.style.gridColumn = String(colIndex[corridor.col]);
    c.style.gridRow = `3 / span ${bands}`;
    grid.appendChild(c);
  }

  for (const desk of room.unassignedDesks || []) {
    const d = el('div', 'g-seat disabled', t('unassignedDesk'));
    d.style.gridColumn = String(colIndex[desk.col]);
    d.style.gridRow = String(3 + desk.band);
    grid.appendChild(d);
  }

  const seatByN = {};
  room.seats.forEach((s) => { seatByN[s.n] = s; });
  const order = activeCellOrder(state);

  for (const entry of entries) {
    const seatDef = seatByN[entry.seat];
    const seat = el('div', 'g-seat');
    seat.dataset.room = roomId;
    seat.dataset.seat = String(entry.seat);
    seat.tabIndex = 0;
    seat.setAttribute('role', 'button');
    seat.style.gridColumn = String(colIndex[seatDef.col]);
    seat.style.gridRow = String(3 + seatDef.band);
    const where = `${roomId} · ${t('seatNo', { n: entry.seat })}`;

    if (entry.studentIdx != null) {
      const student = state.students[entry.studentIdx];
      seat.classList.add('occupied');
      seat.draggable = true;
      seat.title = `${student.id} · ${student.rawName}`;
      seat.setAttribute('aria-label', `${where}: ${student.id} ${student.rawName}`);
      for (const key of order) {
        if (key === 'id') seat.appendChild(el('span', 's-id', student.id));
        else if (key === 'name') seat.appendChild(el('span', 's-name', student.name));
        else if (key === 'seat') seat.appendChild(el('span', 's-no', `(${entry.seat})`));
      }
      if (!order.length) seat.appendChild(el('span', 's-no', '•'));
    } else {
      seat.classList.add('empty');
      seat.setAttribute('aria-label', `${where}: ${t('emptySeat')}`);
      seat.appendChild(el('span', 's-no', `${t('emptySeat')} (${entry.seat})`));
    }
    grid.appendChild(seat);
  }

  wrap.appendChild(grid);
}

export function renderRoomTabs(state) {
  rebuild(document.getElementById('room-tabs'), (tabs) => {
    if (!state.plan) return;
    for (const roomId of state.selectedRooms) {
      const active = roomId === state.activeRoom;
      const btn = el('button', 'room-tab' + (active ? ' active' : ''), roomId);
      btn.type = 'button';
      btn.dataset.roomTab = roomId;
      btn.dataset.focusKey = `tab-${roomId}`;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(active));
      const filled = state.plan[roomId].filter((e) => e.studentIdx != null).length;
      btn.appendChild(el('span', 'rt-count', String(filled)));
      tabs.appendChild(btn);
    }
  });
}
