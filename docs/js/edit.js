// Inline editing: double-click a seat to edit the student's ID/name,
// clear the seat, or type a new student into an empty seat.

import { getState, update } from './store.js';
import { t } from './i18n.js';
import { formatLongName } from './parse.js';

let pop = null;

export function initEdit() {
  document.getElementById('grid-wrap').addEventListener('dblclick', (e) => {
    const seat = e.target.closest('.g-seat');
    if (!seat || seat.classList.contains('disabled') || !seat.dataset.seat) return;
    openPopover(seat);
  });

  document.addEventListener('click', (e) => {
    if (pop && !pop.contains(e.target) && !e.target.closest('.g-seat')) closePopover();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePopover();
  });
}

function closePopover() {
  pop?.remove();
  pop = null;
}

function openPopover(seatEl) {
  closePopover();
  const room = seatEl.dataset.room;
  const seatNo = Number(seatEl.dataset.seat);
  const state = getState();
  const entry = state.plan[room].find((en) => en.seat === seatNo);
  const student = entry.studentIdx != null ? state.students[entry.studentIdx] : null;

  pop = document.createElement('div');
  pop.className = 'edit-pop';

  const idLabel = document.createElement('label');
  idLabel.textContent = t('editId');
  const idInput = document.createElement('input');
  idInput.type = 'text';
  idInput.value = student ? student.id : '';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = t('editName');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = student ? student.rawName : '';

  const actions = document.createElement('div');
  actions.className = 'edit-actions';
  const save = button(t('editSave'), () => {
    const id = idInput.value.trim();
    const rawName = nameInput.value.trim();
    if (!id && !rawName) { closePopover(); return; }
    update((s) => {
      const en = s.plan[room].find((x) => x.seat === seatNo);
      if (en.studentIdx != null) {
        const st = s.students[en.studentIdx];
        st.id = id;
        st.rawName = rawName;
        st.name = formatLongName(rawName);
      } else {
        s.students.push({ id, rawName, name: formatLongName(rawName) });
        en.studentIdx = s.students.length - 1;
      }
    });
    closePopover();
  });
  const cancel = button(t('editCancel'), closePopover);
  actions.appendChild(save);
  actions.appendChild(cancel);

  pop.appendChild(idLabel);
  pop.appendChild(idInput);
  pop.appendChild(nameLabel);
  pop.appendChild(nameInput);

  if (student) {
    const clear = button(t('editRemove'), () => {
      update((s) => {
        const en = s.plan[room].find((x) => x.seat === seatNo);
        en.studentIdx = null;
      });
      closePopover();
    });
    clear.classList.add('danger');
    const clearRow = document.createElement('div');
    clearRow.className = 'edit-actions';
    clearRow.appendChild(clear);
    pop.appendChild(actions);
    pop.appendChild(clearRow);
  } else {
    pop.appendChild(actions);
  }

  document.body.appendChild(pop);
  const rect = seatEl.getBoundingClientRect();
  const popW = 230;
  let left = window.scrollX + rect.left + rect.width / 2 - popW / 2;
  left = Math.max(8, Math.min(left, window.scrollX + document.documentElement.clientWidth - popW - 8));
  pop.style.left = `${left}px`;
  pop.style.top = `${window.scrollY + rect.bottom + 6}px`;
  idInput.focus();

  [idInput, nameInput].forEach((inp) =>
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save.click(); }));
}

function button(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn-secondary';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
