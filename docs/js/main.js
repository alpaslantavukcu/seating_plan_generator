// Entry point: loads classroom data, wires the setup form, generation,
// plan view (tabs, live toggles, regenerate) and export buttons.

import { getState, set, update, subscribe } from './store.js';
import { t, applyLang, toggleLang } from './i18n.js';
import { parseNinovaText, parseCsv, parseXlsx } from './parse.js';
import { assign, totalCapacity } from './algorithm.js';
import { renderGrid, renderRoomTabs } from './grid.js';
import { initDnd } from './dnd.js';
import { initEdit } from './edit.js';
import {
  extractSettings, buildTemplate, serializeTemplate,
  encodeSettings, decodeSettings, parseTemplateJson, validateTemplate,
} from './template.js';
import { saveSessionSoon, saveSessionNow, loadSession, clearSession, onStorageError } from './persist.js';
import { safeFileName, downloadBlob } from './export-common.js';

let classrooms = null;

export function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast' + (isError ? ' error' : '');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

/* ---------- student input ---------- */

function setStudents(students) {
  set({ students, plan: null });
  renderStudentStatus();
  updateCapacitySummary();
}

function renderStudentStatus() {
  const { students } = getState();
  const status = document.getElementById('student-status');
  status.removeAttribute('data-i18n');
  if (students.length) {
    status.textContent = t('parsedCount', { n: students.length });
    status.className = 'status ok';
  } else {
    status.textContent = t('parseError');
    status.className = 'status error';
  }
}

function wireStudentInputs() {
  const pasteArea = document.getElementById('paste-area');
  let debounce;
  pasteArea.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (pasteArea.value.trim()) setStudents(parseNinovaText(pasteArea.value));
    }, 250);
  });

  wireDropzone('txt-drop', 'txt-file', async (file) => {
    setStudents(parseNinovaText(await file.text()));
  });

  wireDropzone('xlsx-drop', 'xlsx-file', async (file) => {
    if (/\.(csv|tsv|txt)$/i.test(file.name)) {
      setStudents(parseCsv(await file.text()));
    } else {
      setStudents(await parseXlsx(await file.arrayBuffer()));
    }
  });

  document.querySelectorAll('[data-input-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-input-tab]').forEach((el) =>
        el.classList.toggle('active', el === tab));
      document.querySelectorAll('[data-input-panel]').forEach((panel) =>
        panel.classList.toggle('hidden', panel.dataset.inputPanel !== tab.dataset.inputTab));
    });
  });
}

function wireDropzone(zoneId, inputId, handler) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  const run = async (file) => {
    if (!file) return;
    try {
      await handler(file);
      const span = zone.querySelector('span');
      span.removeAttribute('data-i18n');
      span.textContent = file.name;
    } catch (err) {
      console.error(err);
      showToast(t('parseError'), true);
    }
  };
  input.addEventListener('change', () => run(input.files[0]));
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    run(e.dataTransfer.files[0]);
  });
}

/* ---------- rooms ---------- */

function renderRoomPicker() {
  const picker = document.getElementById('room-picker');
  picker.innerHTML = '';
  const { selectedRooms } = getState();
  for (const [roomId, room] of Object.entries(classrooms.rooms)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const idx = selectedRooms.indexOf(roomId);
    btn.className = 'room-chip' + (idx !== -1 ? ' selected' : '');
    btn.dataset.room = roomId;
    btn.innerHTML = '';
    if (idx !== -1) {
      const order = document.createElement('span');
      order.className = 'order';
      order.textContent = String(idx + 1);
      btn.appendChild(order);
    }
    btn.appendChild(document.createTextNode(roomId));
    const cap = document.createElement('span');
    cap.className = 'cap';
    cap.textContent = String(room.capacity);
    btn.appendChild(cap);
    btn.addEventListener('click', () => {
      update((s) => {
        const i = s.selectedRooms.indexOf(roomId);
        if (i === -1) s.selectedRooms.push(roomId);
        else s.selectedRooms.splice(i, 1);
        s.plan = null;
      });
      renderRoomPicker();
      renderCapEditor();
      updateCapacitySummary();
    });
    picker.appendChild(btn);
  }
}

function renderCapEditor() {
  const editor = document.getElementById('cap-editor');
  const state = getState();
  editor.classList.toggle('hidden', !state.useCustomCapacities || !state.selectedRooms.length);
  editor.innerHTML = '';
  if (!state.useCustomCapacities) return;
  for (const roomId of state.selectedRooms) {
    const max = classrooms.rooms[roomId].capacity;
    const label = document.createElement('label');
    const span = document.createElement('span');
    span.textContent = roomId;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = String(max);
    input.value = String(state.customCapacities[roomId] ?? max);
    input.addEventListener('change', () => {
      const v = Math.max(1, Math.min(max, Number(input.value) || max));
      input.value = String(v);
      update((s) => { s.customCapacities[roomId] = v; s.plan = null; });
      updateCapacitySummary();
    });
    label.appendChild(span);
    label.appendChild(input);
    editor.appendChild(label);
  }
}

function updateCapacitySummary() {
  const el = document.getElementById('capacity-summary');
  const s = getState();
  if (!s.selectedRooms.length) { el.textContent = ''; return; }
  const cap = totalCapacity(s.selectedRooms, classrooms.rooms,
    s.useCustomCapacities ? s.customCapacities : {});
  el.textContent = t('totalCapacity', { cap, n: s.students.length });
  const over = s.students.length > cap;
  el.className = 'status ' + (over ? 'error' : 'muted');
  if (over) el.textContent += ' — ' + t('overCapacity');
}

/* ---------- generation ---------- */

function readSetupFields() {
  update((s) => {
    s.examName = document.getElementById('exam-name').value.trim();
    s.seed = document.getElementById('seed').value.trim();
    s.cellFields = {
      id: document.getElementById('field-id').checked,
      name: document.getElementById('field-name').checked,
      seat: document.getElementById('field-seat').checked,
    };
  });
}

// Keep the store in step with the form as it is edited, so auto-save and
// template export never miss a field. 'change' (not 'input') fires on blur,
// which avoids re-rendering the plan grid on every keystroke.
function wireSetupFields() {
  document.getElementById('exam-name').addEventListener('change', readSetupFields);
  document.getElementById('seed').addEventListener('change', readSetupFields);
  for (const key of ['id', 'name', 'seat']) {
    document.getElementById(`field-${key}`).addEventListener('change', (e) => {
      update((s) => { s.cellFields[key] = e.target.checked; });
      document.getElementById(`live-${key}`).checked = e.target.checked;
    });
  }
}

// The reverse direction: write the store back into the form. Needed whenever
// settings arrive from somewhere other than the user typing — a template or a
// restored session.
function hydrateSetupDom() {
  const s = getState();
  document.getElementById('exam-name').value = s.examName;
  document.getElementById('seed').value = s.seed;
  document.getElementById('custom-cap').checked = s.useCustomCapacities;
  for (const key of ['id', 'name', 'seat']) {
    document.getElementById(`field-${key}`).checked = s.cellFields[key];
    document.getElementById(`live-${key}`).checked = s.cellFields[key];
  }
  renderRoomPicker();
  renderCapEditor();
  updateCapacitySummary();
}

function validate() {
  const s = getState();
  if (!s.examName) return t('errNoName');
  if (!s.students.length) return t('errNoStudents');
  if (!s.selectedRooms.length) return t('errNoRooms');
  if (!s.cellFields.id && !s.cellFields.name && !s.cellFields.seat) return t('errNoFields');
  return null;
}

function generate() {
  readSetupFields();
  const errEl = document.getElementById('setup-error');
  const err = validate();
  if (err) {
    errEl.textContent = err;
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');

  const s = getState();
  const caps = s.useCustomCapacities ? s.customCapacities : {};
  try {
    const { plan, usedSeed } = assign(s.students, s.selectedRooms, classrooms.rooms, caps, s.seed);
    set({ plan, usedSeed, activeRoom: s.selectedRooms[0] });
  } catch (e) {
    if (e.code === 'capacity') {
      errEl.textContent = t('errCapacity', { n: s.students.length, cap: e.capacity });
      errEl.classList.remove('hidden');
      return;
    }
    throw e;
  }

  // Sync live toggles with setup choices
  document.getElementById('live-id').checked = s.cellFields.id;
  document.getElementById('live-name').checked = s.cellFields.name;
  document.getElementById('live-seat').checked = s.cellFields.seat;

  // Visibility is owned by the store subscriber; set() above already revealed it.
  document.getElementById('plan').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- plan view ---------- */

function renderPlan() {
  const s = getState();
  renderRoomTabs(s);
  renderGrid(s, classrooms);
  const seedInfo = document.getElementById('seed-info');
  seedInfo.textContent = s.usedSeed != null ? t('usedSeed', { seed: s.usedSeed }) : '';
}

function wirePlanView() {
  document.getElementById('room-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-room-tab]');
    if (tab) set({ activeRoom: tab.dataset.roomTab });
  });

  for (const key of ['id', 'name', 'seat']) {
    document.getElementById(`live-${key}`).addEventListener('change', (e) => {
      update((s) => { s.cellFields[key] = e.target.checked; });
      document.getElementById(`field-${key}`).checked = e.target.checked;
    });
  }

  document.getElementById('regenerate').addEventListener('click', () => {
    const s = getState();
    if (!s.plan) return;
    const caps = s.useCustomCapacities ? s.customCapacities : {};
    const seedField = document.getElementById('seed').value.trim();
    // Empty seed field: every reshuffle is a fresh random plan.
    const { plan, usedSeed } = assign(s.students, s.selectedRooms, classrooms.rooms, caps, seedField);
    set({ plan, usedSeed });
  });
}

/* ---------- templates ---------- */

function currentSettings() {
  readSetupFields();
  return extractSettings(getState());
}

// Settings replace what is in the form; the student list is deliberately left
// alone, and the plan is dropped because it no longer matches the settings.
// A code carries no exam name, so its patch has no examName key and Object.assign
// leaves whatever the user typed in place.
function applySettings({ settings, warnings }) {
  const keptName = !('examName' in settings);
  set({ ...settings, plan: null, usedSeed: null, activeRoom: null });
  hydrateSetupDom();
  const messages = [t(keptName ? 'tplLoadedCode' : 'tplLoaded'),
    ...warnings.map((w) => t(w.key, w.params))];
  showToast(messages.join(' · '), warnings.length > 0);
}

// `read` turns the pasted text or file contents into {settings, warnings}.
function loadTemplateText(text, read) {
  try {
    applySettings(read(text));
    return true;
  } catch (err) {
    console.error(err);
    showToast(t('tplInvalid'), true);
    return false;
  }
}

const readTemplateFile = (text) => validateTemplate(parseTemplateJson(text), classrooms.rooms);
const readTemplateCode = (code) => decodeSettings(code, classrooms.rooms);

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(t('tplCopied'));
  } catch (err) {
    // Blocked clipboard (file://, older browsers): show the text to copy by hand.
    console.error(err);
    const row = document.getElementById('tpl-code-row');
    const input = document.getElementById('tpl-code');
    row.classList.remove('hidden');
    input.value = text;
    input.select();
    showToast(t('tplCopyFailed'), true);
  }
}

function wireTemplate() {
  document.getElementById('tpl-save').addEventListener('click', () => {
    const settings = currentSettings();
    const template = buildTemplate(settings, classrooms.version);
    const blob = new Blob([serializeTemplate(template)], { type: 'application/json' });
    downloadBlob(blob, `${safeFileName(settings.examName)}-template.json`);
  });

  document.getElementById('tpl-copy-code').addEventListener('click', () => {
    copyText(encodeSettings(currentSettings()));
  });

  document.getElementById('tpl-copy-link').addEventListener('click', () => {
    // The `t=` already labels it, so the link drops the SP1- prefix the copied
    // code keeps for recognisability in a chat message.
    const code = encodeSettings(currentSettings()).replace(/^SP1-/, '');
    copyText(`${location.origin}${location.pathname}#t=${code}`);
  });

  const fileInput = document.getElementById('tpl-file');
  document.getElementById('tpl-load').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = ''; // so picking the same file twice still fires
    if (file) loadTemplateText(await file.text(), readTemplateFile);
  });

  const box = document.getElementById('template-box');
  box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('dragover'); });
  box.addEventListener('dragleave', () => box.classList.remove('dragover'));
  box.addEventListener('drop', async (e) => {
    e.preventDefault();
    box.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) loadTemplateText(await file.text(), readTemplateFile);
  });

  const codeRow = document.getElementById('tpl-code-row');
  const codeInput = document.getElementById('tpl-code');
  document.getElementById('tpl-paste-toggle').addEventListener('click', () => {
    codeRow.classList.toggle('hidden');
    if (!codeRow.classList.contains('hidden')) codeInput.focus();
  });
  document.getElementById('tpl-apply').addEventListener('click', () => {
    if (loadTemplateText(codeInput.value, readTemplateCode)) {
      codeInput.value = '';
      codeRow.classList.add('hidden');
    }
  });

  // Opening a shared link while the app is already open is a same-document
  // fragment navigation — init() never re-runs, so catch it here too.
  window.addEventListener('hashchange', applyHashTemplate);
}

// A shared link wins over whatever was restored: it replaces the settings.
// The hash is stripped either way, otherwise every later refresh would silently
// re-apply the template and wipe a freshly generated plan.
function applyHashTemplate() {
  if (!location.hash.startsWith('#t=')) return;
  const code = location.hash.slice(3);
  history.replaceState(null, '', location.pathname + location.search);
  loadTemplateText(code, readTemplateCode);
}

/* ---------- session ---------- */

function restoreSession() {
  let restored = null;
  try {
    restored = loadSession(classrooms.rooms);
  } catch (err) {
    console.error(err);
  }
  if (!restored) return;
  set(restored);
  hydrateSetupDom();
  if (restored.students.length) renderStudentStatus();
  document.getElementById('session-banner').classList.remove('hidden');
}

function startAutoSave() {
  onStorageError(() => showToast(t('storageFull'), true));
  subscribe((s) => saveSessionSoon(s));
  // Catch a field edited but never blurred before the tab goes away.
  window.addEventListener('pagehide', () => {
    readSetupFields();
    saveSessionNow(getState());
  });
}

function startFresh() {
  if (!confirm(t('startFreshConfirm'))) return;
  clearSession();
  history.replaceState(null, '', location.pathname + location.search);
  location.reload();
}

/* ---------- exports ---------- */

function wireExports() {
  const wire = (id, module, fn) => {
    document.getElementById(id).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (!getState().plan) return;
      btn.disabled = true;
      try {
        const mod = await import(module);
        await mod[fn](getState(), classrooms);
      } catch (err) {
        console.error(err);
        showToast(String(err.message || err), true);
      } finally {
        btn.disabled = false;
      }
    });
  };
  wire('exp-pdf-room', './export-pdf.js', 'exportRoomPdf');
  wire('exp-pdf-all-id', './export-pdf.js', 'exportMergedPdfId');
  wire('exp-pdf-all-full', './export-pdf.js', 'exportMergedPdfFull');
  wire('exp-pdf-roomlist', './export-pdf.js', 'exportRoomListPdf');
  wire('exp-xlsx-room', './export-xlsx.js', 'exportRoomXlsx');
  wire('exp-xlsx-all', './export-xlsx.js', 'exportAllXlsx');
  wire('exp-xlsx-roomlist', './export-xlsx.js', 'exportRoomListXlsx');
  document.getElementById('exp-print').addEventListener('click', () => window.print());
}

/* ---------- init ---------- */

async function init() {
  applyLang();
  document.getElementById('lang-toggle').addEventListener('click', () => {
    toggleLang();
    updateCapacitySummary();
    const s = getState();
    if (s.plan) renderPlan();
  });

  const res = await fetch('data/classrooms.json');
  classrooms = await res.json();

  renderRoomPicker();
  wireStudentInputs();
  wireSetupFields();
  wirePlanView();
  wireExports();
  wireTemplate();
  initDnd();
  initEdit();

  document.getElementById('custom-cap').addEventListener('change', (e) => {
    update((s) => { s.useCustomCapacities = e.target.checked; s.plan = null; });
    renderCapEditor();
    updateCapacitySummary();
  });

  document.getElementById('generate').addEventListener('click', generate);

  document.querySelectorAll('[data-start-fresh]').forEach((btn) => {
    btn.addEventListener('click', startFresh);
  });
  document.getElementById('session-dismiss').addEventListener('click', () => {
    document.getElementById('session-banner').classList.add('hidden');
  });

  // Registered before the restore below so a restored plan shows itself.
  subscribe(() => {
    const s = getState();
    document.getElementById('plan').classList.toggle('hidden', !s.plan);
    if (s.plan) renderPlan();
  });

  restoreSession();
  applyHashTemplate();
  // Last, so hydrating the form above does not immediately rewrite storage.
  startAutoSave();
}

init();
