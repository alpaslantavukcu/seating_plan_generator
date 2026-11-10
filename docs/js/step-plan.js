// Step 3: the seating plan. Room tabs, the seat-field toggles, seed and
// reshuffle, and the grid with three ways to rearrange it: tap a seat then
// another (works on touch screens and across rooms), drag and drop (mouse),
// and the seat editor (double-click or the selection bar).

import { getState, set, update, setCellField, activeCellOrder, effectiveCaps, CELL_KEYS } from './store.js';
import { assign } from './algorithm.js';
import { t, esc } from './i18n.js';
import { renderGrid, renderRoomTabs } from './grid.js';
import { initDnd } from './dnd.js';
import { initEdit, openEditor, closeEditor, isEditorOpen } from './edit.js';
import { swapSeats, clearSeat, findEntry } from './plan-ops.js';
import { askConfirm, showToast } from './ui.js';

let classrooms = null;
let selected = null; // {room, seat} picked for tap-to-swap
let lastSwap = null; // the latest tap swap, so a double-click can take it back

export function initPlan(cls) {
  classrooms = cls;
  const wrap = document.getElementById('grid-wrap');

  document.getElementById('room-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-room-tab]');
    if (tab) {
      closeEditor();
      set({ activeRoom: tab.dataset.roomTab });
    }
  });

  document.querySelectorAll('.toggle-chip[data-field]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.field;
      update((s) => setCellField(s, key, !s.cellFields[key]));
    });
  });

  const seed = document.getElementById('seed');
  seed.maxLength = 9;
  seed.addEventListener('change', () => onSeedChange(seed));
  seed.addEventListener('keydown', (e) => { if (e.key === 'Enter') seed.blur(); });

  document.getElementById('regenerate').addEventListener('click', reshuffle);

  wrap.addEventListener('click', (e) => {
    const seatEl = e.target.closest('.g-seat');
    if (seatEl) onSeatTap(seatEl);
  });
  wrap.addEventListener('keydown', (e) => {
    const seatEl = e.target.closest('.g-seat');
    if (!seatEl || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    onSeatTap(seatEl);
  });
  wrap.addEventListener('dblclick', (e) => {
    const seatEl = e.target.closest('.g-seat');
    if (!seatEl || seatEl.classList.contains('disabled')) return;
    const target = { room: seatEl.dataset.room, seat: Number(seatEl.dataset.seat) };
    // With a seat already picked, the first click of this double-click
    // swapped into this seat; the user meant to edit, so undo that swap.
    if (lastSwap && performance.now() - lastSwap.at < 700
      && lastSwap.to.room === target.room && lastSwap.to.seat === target.seat) {
      swapSeats(lastSwap.to, lastSwap.from);
      if (!lastSwap.wasEdited) set({ planEdited: false });
    }
    lastSwap = null;
    selected = null;
    applySelection();
    openEditor(target.room, target.seat, seatElement(target)); // re-query: a swap redraws the grid
  });

  document.getElementById('sel-edit').addEventListener('click', () => {
    if (!selected) return;
    const anchor = seatElement(selected) || document.getElementById('sel-edit');
    openEditor(selected.room, selected.seat, anchor);
  });
  document.getElementById('sel-clear').addEventListener('click', () => {
    if (!selected) return;
    const { room, seat } = selected;
    selected = null;
    closeEditor();
    clearSeat(room, seat);
  });
  document.getElementById('sel-cancel').addEventListener('click', clearSelection);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selected && !isEditorOpen() && getState().step === 3) clearSelection();
  });

  initDnd({
    onSwap: (a, b) => {
      selected = null;
      swapSeats(a, b);
    },
  });
  initEdit({ onDone: clearSelection });
}

// Generates a plan from the current settings. `seedValue` '' means random.
export function generatePlan(seedValue, patch = {}) {
  const s = getState();
  const { plan, usedSeed } = assign(s.students, s.selectedRooms, classrooms.rooms, effectiveCaps(s), seedValue);
  const activeRoom = s.selectedRooms.includes(s.activeRoom) ? s.activeRoom : s.selectedRooms[0];
  selected = null;
  closeEditor();
  set({ ...patch, plan, usedSeed, activeRoom, planEdited: false });
}

export function ensurePlan() {
  if (getState().plan) return;
  try {
    generatePlan(getState().seed);
  } catch (err) {
    console.error(err);
    showToast(String(err.message || err), true);
  }
}

async function confirmLoseEdits() {
  return !getState().planEdited || askConfirm(t('confirmReshuffle'), t('confirmReshuffleOk'));
}

// A typed seed pins the plan to it; clearing the field un-pins it (the plan
// stays until the next reshuffle).
async function onSeedChange(input) {
  const s = getState();
  const digits = input.value.replace(/\D/g, '');
  if (!input.value.trim()) {
    if (s.seed !== '') set({ seed: '' });
    return;
  }
  if (!digits || (digits === s.seed && Number(digits) === s.usedSeed)) {
    input.value = s.seed;
    return;
  }
  if (!(await confirmLoseEdits())) {
    input.value = s.seed;
    return;
  }
  generatePlan(digits, { seed: digits });
}

// Always a fresh random plan, so a pinned seed is released.
async function reshuffle() {
  if (!getState().plan || !(await confirmLoseEdits())) return;
  generatePlan('', { seed: '' });
}

/* ---------- tap to swap ---------- */

function seatElement(sel) {
  if (!sel || sel.room !== getState().activeRoom) return null;
  return document.querySelector(`#grid-wrap .g-seat[data-seat="${sel.seat}"]`);
}

function clearSelection() {
  selected = null;
  applySelection();
}

function onSeatTap(seatEl) {
  if (seatEl.classList.contains('disabled')) return;
  closeEditor();
  const target = { room: seatEl.dataset.room, seat: Number(seatEl.dataset.seat) };
  if (!selected) {
    selected = target;
    applySelection();
    return;
  }
  if (selected.room === target.room && selected.seat === target.seat) {
    clearSelection();
    return;
  }
  const s = getState();
  const a = findEntry(s, selected.room, selected.seat);
  const b = findEntry(s, target.room, target.seat);
  if (a?.studentIdx == null && b?.studentIdx == null) {
    selected = target; // two empty seats: just move the selection
    applySelection();
    return;
  }
  const from = selected;
  selected = null;
  lastSwap = { from, to: target, at: performance.now(), wasEdited: s.planEdited };
  swapSeats(from, target);
}

// Selection lives outside the store (it is not worth saving); this redraws
// its highlight and the selection bar without rebuilding the grid.
function applySelection() {
  const s = getState();
  if (selected && !findEntry(s, selected.room, selected.seat)) selected = null;

  const wrap = document.getElementById('grid-wrap');
  wrap.classList.toggle('picking', !!selected);
  wrap.querySelectorAll('.g-seat.selected').forEach((n) => n.classList.remove('selected'));
  seatElement(selected)?.classList.add('selected');

  const bar = document.getElementById('sel-bar');
  const text = document.getElementById('sel-text');
  const actions = document.getElementById('sel-actions');
  bar.classList.toggle('active', !!selected);
  actions.hidden = !selected;
  if (!selected) {
    text.textContent = t('selHint');
    return;
  }
  const entry = findEntry(s, selected.room, selected.seat);
  const student = entry.studentIdx != null ? s.students[entry.studentIdx] : null;
  const params = { room: esc(selected.room), seat: selected.seat };
  text.innerHTML = student
    ? t('selPicked', { ...params, name: esc(`${student.id} ${student.rawName}`) })
    : t('selPickedEmpty', params);
  document.getElementById('sel-edit-label').textContent = t(student ? 'selEdit' : 'selAdd');
  document.getElementById('sel-clear').hidden = !student;
}

export function renderPlan(s) {
  renderRoomTabs(s);
  renderGrid(s, classrooms);

  const order = activeCellOrder(s);
  for (const key of CELL_KEYS) {
    const chip = document.querySelector(`.toggle-chip[data-field="${key}"]`);
    chip.setAttribute('aria-pressed', String(!!s.cellFields[key]));
    const pos = order.indexOf(key);
    chip.querySelector('.fo').textContent = pos === -1 ? '' : String(pos + 1);
  }

  const seed = document.getElementById('seed');
  if (document.activeElement !== seed) seed.value = s.seed;
  seed.placeholder = s.usedSeed != null ? String(s.usedSeed) : '';

  applySelection();
}
