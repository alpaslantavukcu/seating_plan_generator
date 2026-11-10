// Step 1: exam name and student list (pasted from Ninova or uploaded as
// .txt / .xlsx / .csv), with a live preview of what was read.

import { getState, set, update, dropPlan } from './store.js';
import { t } from './i18n.js';
import { parseNinovaText, parseCsv, parseXlsx } from './parse.js';
import { confirmDropPlan, showToast, wireDropzone, el } from './ui.js';

let parseFailed = false; // the last input was non-empty but gave no students
let fileName = '';
let lastPaste = '';
let listSignature = null;

export function initStudents() {
  const name = document.getElementById('exam-name');
  name.addEventListener('input', () => set({ examName: name.value.trim() }));

  document.querySelectorAll('[data-input-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-input-tab]').forEach((other) => {
        const on = other === tab;
        other.classList.toggle('active', on);
        other.setAttribute('aria-selected', String(on));
      });
      document.querySelectorAll('[data-input-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.inputPanel !== tab.dataset.inputTab;
      });
    });
  });

  const area = document.getElementById('paste-area');
  let debounce;
  area.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => applyPaste(area), 250);
  });

  wireDropzone(
    document.getElementById('student-drop'),
    document.getElementById('student-file'),
    loadFile,
  );

  document.getElementById('students-clear').addEventListener('click', async () => {
    if (!(await confirmDropPlan())) return;
    area.value = '';
    lastPaste = '';
    fileName = '';
    parseFailed = false;
    replaceStudents([]);
  });
}

// Settings arrived from elsewhere (restore, template): write them into the form.
export function hydrateStudents(s) {
  document.getElementById('exam-name').value = s.examName;
}

// A template replaced the student list: the pasted text or file name on
// screen no longer describes it.
export function resetStudentInputs() {
  document.getElementById('paste-area').value = '';
  lastPaste = '';
  fileName = '';
  parseFailed = false;
}

function replaceStudents(students) {
  update((s) => {
    s.students = students;
    dropPlan(s);
  });
}

async function applyPaste(area) {
  const text = area.value;
  if (text === lastPaste) return;
  if (!(await confirmDropPlan())) {
    area.value = lastPaste;
    return;
  }
  lastPaste = text;
  fileName = '';
  const students = text.trim() ? parseNinovaText(text) : [];
  parseFailed = text.trim() !== '' && students.length === 0;
  replaceStudents(students);
}

async function loadFile(file) {
  let students;
  try {
    if (/\.txt$/i.test(file.name)) students = parseNinovaText(await file.text());
    else if (/\.(csv|tsv)$/i.test(file.name)) students = parseCsv(await file.text());
    else students = await parseXlsx(await file.arrayBuffer());
  } catch (err) {
    console.error(err);
    showToast(t('parseError'), true);
    return;
  }
  if (!(await confirmDropPlan())) return;
  parseFailed = students.length === 0;
  fileName = students.length ? file.name : '';
  replaceStudents(students);
}

export function renderStudents(s) {
  const n = s.students.length;
  const count = document.getElementById('student-count');
  count.textContent = String(n);
  count.classList.toggle('zero', n === 0);
  document.getElementById('students-clear').hidden = n === 0;

  const empty = document.getElementById('student-empty');
  const list = document.getElementById('student-list');
  empty.hidden = n > 0;
  list.hidden = n === 0;
  empty.classList.toggle('error', parseFailed);
  document.getElementById('student-empty-text').textContent = t(parseFailed ? 'parseError' : 'noStudents');
  document.getElementById('student-file-name').textContent = fileName ? t('fileLoaded', { name: fileName }) : '';

  // Rebuild the preview only when the list itself changed, not on every
  // keystroke in the exam name.
  const signature = s.students.map((st) => `${st.id}\u0001${st.rawName}`).join('\u0002');
  if (signature === listSignature) return;
  listSignature = signature;
  const frag = document.createDocumentFragment();
  s.students.forEach((st, i) => {
    const row = el('div', 'st-row');
    row.appendChild(el('span', 'st-n', String(i + 1)));
    row.appendChild(el('span', 'st-id', st.id));
    const nameCell = el('span', 'st-name', st.rawName);
    nameCell.title = st.rawName;
    row.appendChild(nameCell);
    frag.appendChild(row);
  });
  list.replaceChildren(frag);
}
