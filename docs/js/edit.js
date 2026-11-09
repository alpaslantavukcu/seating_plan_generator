// Seat editor: change the seated student's ID/name, clear the seat, or type a
// new student into an empty seat. A popover next to the seat on wide screens,
// a bottom sheet on phones (see .edit-pop in style.css).

import { getState } from './store.js';
import { t } from './i18n.js';
import { findEntry, saveSeatStudent, clearSeat } from './plan-ops.js';
import { el } from './ui.js';

let pop = null;
let onDone = () => {};

export function initEdit(options = {}) {
  if (options.onDone) onDone = options.onDone;
  // Close on a press outside. Seats and the selection bar manage the
  // popover themselves, so presses there are left alone.
  document.addEventListener('pointerdown', (e) => {
    if (!pop || pop.contains(e.target)) return;
    if (e.target.closest('.g-seat, [data-keeps-pop]')) return;
    closeEditor();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditor();
  });
  window.addEventListener('resize', closeEditor);
  document.getElementById('grid-wrap').addEventListener('scroll', closeEditor, { passive: true });
}

export function isEditorOpen() {
  return pop != null;
}

export function closeEditor() {
  pop?.remove();
  pop = null;
}

export function openEditor(room, seatNo, anchor) {
  closeEditor();
  const state = getState();
  const entry = findEntry(state, room, seatNo);
  if (!entry) return;
  const student = entry.studentIdx != null ? state.students[entry.studentIdx] : null;

  pop = el('div', 'edit-pop');
  pop.setAttribute('role', 'dialog');
  const heading = t('editTitle', { room, seat: seatNo });
  pop.setAttribute('aria-label', heading);
  pop.appendChild(el('h4', null, heading));

  const idInput = field(t('editId'), 'edit-id', student ? student.id : '');
  const nameInput = field(t('editName'), 'edit-name', student ? student.rawName : '');

  const save = () => {
    const id = idInput.value.trim();
    const rawName = nameInput.value.trim();
    if (id || rawName) saveSeatStudent(room, seatNo, id, rawName);
    closeEditor();
    onDone();
  };

  const actions = el('div', 'edit-actions');
  actions.appendChild(button(t('editCancel'), 'btn-ghost small', closeEditor));
  actions.appendChild(button(t('editSave'), 'btn-primary small', save));
  pop.appendChild(actions);

  if (student) {
    const clearRow = el('div', 'edit-actions');
    clearRow.appendChild(button(t('editRemove'), 'btn-soft small danger', () => {
      clearSeat(room, seatNo);
      closeEditor();
      onDone();
    }));
    pop.appendChild(clearRow);
  }

  document.body.appendChild(pop);
  place(anchor);
  idInput.focus();

  [idInput, nameInput].forEach((input) =>
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); }));

  function field(label, id, value) {
    const l = el('label', null, label);
    l.htmlFor = id;
    const input = el('input');
    input.type = 'text';
    input.id = id;
    input.autocomplete = 'off';
    input.value = value;
    pop.appendChild(l);
    pop.appendChild(input);
    return input;
  }
}

// Below the anchor if it fits, above otherwise; clamped to the viewport.
// Phones get the bottom-sheet layout from CSS instead.
function place(anchor) {
  if (matchMedia('(max-width: 720px)').matches) return;
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const r = anchor
    ? anchor.getBoundingClientRect()
    : { left: vw / 2, width: 0, top: vh / 2 - h / 2, bottom: vh / 2 - h / 2 - 8 };
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(8, Math.min(left, vw - w - 8));
  let top = r.bottom + 8;
  if (top + h > vh - 8) top = r.top - h - 8;
  top = Math.max(8, Math.min(top, vh - h - 8));
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}

function button(label, className, onClick) {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
