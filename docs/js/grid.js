// Renders the active classroom as a CSS grid mirroring the physical layout
// extracted from the Excel templates (data/classrooms.json): title bar,
// lectern (KÜRSÜ) band, seat columns with real width ratios, striped
// corridor columns with vertical labels.

import { t } from './i18n.js';
import { activeCellOrder } from './store.js';

export function renderGrid(state, classrooms) {
  const wrap = document.getElementById('grid-wrap');
  const meta = document.getElementById('room-meta');
  wrap.innerHTML = '';
  if (!state.plan || !state.activeRoom) return;

  const roomId = state.activeRoom;
  const room = classrooms.rooms[roomId];
  const entries = state.plan[roomId];

  const grid = document.createElement('div');
  grid.className = 'room-grid';
  grid.style.gridTemplateColumns = room.columns
    .map((c) => `minmax(${c.type === 'corridor' ? '26px' : '64px'}, ${c.width}fr)`)
    .join(' ');

  const colIndex = {};
  room.columns.forEach((c, i) => { colIndex[c.letter] = i + 1; });
  const bandCount = room.bands.length;

  const title = document.createElement('div');
  title.className = 'g-title';
  title.textContent = state.examName ? `${state.examName} | ${roomId}` : roomId;
  title.style.gridRow = '1';
  grid.appendChild(title);

  const lectern = document.createElement('div');
  lectern.className = 'g-lectern';
  lectern.textContent = room.lectern;
  lectern.style.gridRow = '2';
  grid.appendChild(lectern);

  for (const corridor of room.corridors) {
    const el = document.createElement('div');
    el.className = 'g-corridor';
    el.textContent = corridor.label;
    el.style.gridColumn = String(colIndex[corridor.col]);
    el.style.gridRow = `3 / span ${bandCount}`;
    grid.appendChild(el);
  }

  for (const desk of room.unassignedDesks || []) {
    const el = document.createElement('div');
    el.className = 'g-seat disabled';
    el.textContent = t('unassignedDesk');
    el.style.gridColumn = String(colIndex[desk.col]);
    el.style.gridRow = String(3 + desk.band);
    grid.appendChild(el);
  }

  const seatByN = {};
  room.seats.forEach((s) => { seatByN[s.n] = s; });

  let used = 0;
  for (const entry of entries) {
    const seatDef = seatByN[entry.seat];
    const el = document.createElement('div');
    el.dataset.room = roomId;
    el.dataset.seat = String(entry.seat);
    el.style.gridColumn = String(colIndex[seatDef.col]);
    el.style.gridRow = String(3 + seatDef.band);

    if (entry.studentIdx != null) {
      used++;
      const student = state.students[entry.studentIdx];
      el.className = 'g-seat occupied';
      el.draggable = true;
      const order = activeCellOrder(state);
      for (const key of order) {
        if (key === 'id') el.appendChild(line('s-id', student.id));
        else if (key === 'name') {
          const n = line('s-name', student.name);
          n.title = student.rawName;
          el.appendChild(n);
        } else if (key === 'seat') el.appendChild(line('s-no', `(${entry.seat})`));
      }
      if (!order.length) el.appendChild(line('s-no', '•'));
    } else {
      el.className = 'g-seat empty';
      el.appendChild(line('s-no', `${t('emptySeat')} (${entry.seat})`));
    }
    grid.appendChild(el);
  }

  wrap.appendChild(grid);
  meta.textContent = t('seatCount', { used, cap: entries.length });
}

function line(cls, text) {
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = text;
  return span;
}

export function renderRoomTabs(state) {
  const tabs = document.getElementById('room-tabs');
  tabs.innerHTML = '';
  if (!state.plan) return;
  for (const roomId of state.selectedRooms) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab' + (roomId === state.activeRoom ? ' active' : '');
    btn.dataset.roomTab = roomId;
    const filled = state.plan[roomId].filter((e) => e.studentIdx != null).length;
    btn.textContent = `${roomId} · ${filled}`;
    tabs.appendChild(btn);
  }
}
