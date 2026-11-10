// Step 2: classrooms. Pick rooms (pick order = fill order), reorder them,
// and lower a room's capacity right in the fill-order list.

import { getState, update, dropPlan, effectiveCaps } from './store.js';
import { totalCapacity } from './algorithm.js';
import { t } from './i18n.js';
import { confirmDropPlan, rebuild, el, icon } from './ui.js';

let rooms = null;
let pickerKey = null;
let listKey = null;

export function initRooms(classrooms) {
  rooms = classrooms.rooms;

  document.getElementById('room-picker').addEventListener('click', (e) => {
    const card = e.target.closest('[data-room]');
    if (card) toggleRoom(card.dataset.room);
  });

  const list = document.getElementById('selected-list');
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.room;
    if (btn.dataset.act === 'remove') toggleRoom(id);
    else move(id, btn.dataset.act === 'up' ? -1 : 1);
  });
  list.addEventListener('change', (e) => {
    const input = e.target.closest('input[data-cap-room]');
    // Deferred so a Tab press moves focus first; the rebuild then hands
    // focus to the redrawn copy of whatever the user tabbed to.
    if (input) setTimeout(() => setCapacity(input.dataset.capRoom, input.value));
  });
  list.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input[data-cap-room]')) e.target.blur();
  });
}

export function capacityOf(s, id) {
  const max = rooms[id].capacity;
  return Math.min(effectiveCaps(s)[id] ?? max, max);
}

// Drop overrides of rooms no longer selected, and switch the custom-capacity
// flag off once no selected room is below its real capacity — so templates
// and codes only carry overrides that matter.
function syncCustomCaps(s) {
  if (!s.useCustomCapacities) return;
  for (const id of Object.keys(s.customCapacities)) {
    if (!s.selectedRooms.includes(id)) delete s.customCapacities[id];
  }
  s.useCustomCapacities = s.selectedRooms.some((id) => {
    const v = s.customCapacities[id];
    return v != null && v < rooms[id].capacity;
  });
}

async function mutate(fn) {
  if (!(await confirmDropPlan())) {
    pickerKey = listKey = null; // redraw, restoring any edited input
    renderRooms(getState());
    return;
  }
  update((s) => {
    fn(s);
    syncCustomCaps(s);
    dropPlan(s);
  });
}

function toggleRoom(id) {
  return mutate((s) => {
    const i = s.selectedRooms.indexOf(id);
    if (i === -1) s.selectedRooms.push(id);
    else s.selectedRooms.splice(i, 1);
  });
}

function move(id, delta) {
  return mutate((s) => {
    const i = s.selectedRooms.indexOf(id);
    const j = i + delta;
    if (i === -1 || j < 0 || j >= s.selectedRooms.length) return;
    [s.selectedRooms[i], s.selectedRooms[j]] = [s.selectedRooms[j], s.selectedRooms[i]];
  });
}

function setCapacity(id, raw) {
  const max = rooms[id].capacity;
  const value = Math.max(1, Math.min(max, Math.round(Number(raw)) || max));
  if (value === capacityOf(getState(), id)) {
    listKey = null;
    renderRooms(getState());
    return;
  }
  mutate((s) => {
    if (!s.useCustomCapacities) {
      // Overrides left over while the flag was off must not come back to life.
      s.customCapacities = {};
      s.useCustomCapacities = true;
    }
    if (value >= max) delete s.customCapacities[id];
    else s.customCapacities[id] = value;
  });
}

export function renderRooms(s) {
  const caps = s.selectedRooms.map((id) => capacityOf(s, id));

  const pk = `${s.lang}|${s.selectedRooms.join(',')}`;
  if (pk !== pickerKey) {
    pickerKey = pk;
    rebuild(document.getElementById('room-picker'), (picker) => {
      for (const [id, room] of Object.entries(rooms)) {
        const idx = s.selectedRooms.indexOf(id);
        const card = el('button', 'room-card' + (idx !== -1 ? ' selected' : ''));
        card.type = 'button';
        card.dataset.room = id;
        card.dataset.focusKey = `card-${id}`;
        card.setAttribute('aria-pressed', String(idx !== -1));
        card.appendChild(el('span', 'rc-name', id));
        card.appendChild(el('span', 'rc-cap', t('seatsN', { n: room.capacity })));
        if (idx !== -1) card.appendChild(el('span', 'rc-order', String(idx + 1)));
        picker.appendChild(card);
      }
    });
  }

  const lk = `${s.lang}|${s.selectedRooms.join(',')}|${caps.join(',')}`;
  if (lk !== listKey) {
    listKey = lk;
    rebuild(document.getElementById('selected-list'), (list) => {
      s.selectedRooms.forEach((id, i) => {
        const max = rooms[id].capacity;
        const li = el('li', 'sel-room');
        li.appendChild(el('span', 'sel-order', String(i + 1)));
        li.appendChild(el('span', 'sel-name', id));

        const cap = el('label', 'sel-cap');
        const input = el('input', caps[i] < max ? 'reduced' : '');
        input.type = 'number';
        input.inputMode = 'numeric';
        input.min = '1';
        input.max = String(max);
        input.value = String(caps[i]);
        input.dataset.capRoom = id;
        input.dataset.focusKey = `cap-${id}`;
        input.setAttribute('aria-label', t('capacityFor', { room: id }));
        cap.appendChild(input);
        cap.appendChild(el('span', null, t('capOf', { n: max })));
        li.appendChild(cap);

        const tools = el('div', 'sel-tools');
        tools.appendChild(toolButton('up', id, t('moveUp'), i === 0));
        tools.appendChild(toolButton('down', id, t('moveDown'), i === s.selectedRooms.length - 1));
        tools.appendChild(toolButton('remove', id, t('removeRoom'), false));
        li.appendChild(tools);
        list.appendChild(li);
      });
    });
  }

  const hasRooms = s.selectedRooms.length > 0;
  document.getElementById('selected-empty').hidden = hasRooms;
  document.getElementById('cap-edit-hint').hidden = !hasRooms;

  const n = s.students.length;
  const total = totalCapacity(s.selectedRooms, rooms, effectiveCaps(s));
  const over = n > total;
  document.getElementById('cap-meter').classList.toggle('over', over);
  document.getElementById('meter-fill').style.width =
    `${over ? 100 : total ? Math.round((n / total) * 100) : 0}%`;
  const summary = document.getElementById('capacity-summary');
  summary.classList.toggle('over', over);
  summary.replaceChildren(document.createTextNode(t('capSummary', { n, cap: total })));
  if (hasRooms) {
    const sub = over ? t('capMissing', { missing: n - total })
      : n === total ? t('capFull')
        : t('capFree', { free: total - n });
    summary.appendChild(el('span', 'sub', sub));
  }
}

function toolButton(act, id, label, disabled) {
  const b = el('button', 'icon-btn');
  b.type = 'button';
  b.dataset.act = act;
  b.dataset.room = id;
  b.dataset.focusKey = `${act}-${id}`;
  b.disabled = disabled;
  b.title = label;
  b.setAttribute('aria-label', `${label}: ${id}`);
  b.appendChild(icon(act === 'remove' ? 'x' : act));
  return b;
}
