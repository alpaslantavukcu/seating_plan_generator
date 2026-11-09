// Entry point: loads the classroom data, wires the four steps of the window,
// restores the saved session and keeps it auto-saved.
//
// Rendering is one pass per store change: the window chrome (step indicator,
// bottom bar) plus the step that is on screen.

import { getState, set, subscribe } from './store.js';
import { t, applyLang, toggleLang } from './i18n.js';
import { saveSessionSoon, saveSessionNow, loadSession, clearSession, onStorageError } from './persist.js';
import { initWizard, renderChrome, clampStep } from './wizard.js';
import { initStudents, renderStudents, hydrateStudents } from './step-students.js';
import { initRooms, renderRooms } from './step-rooms.js';
import { initPlan, renderPlan, ensurePlan } from './step-plan.js';
import { initExport, renderExport } from './step-export.js';
import { initTemplateUi, renderTemplateOutputs, applyHashTemplate } from './template-ui.js';
import { askConfirm, showToast } from './ui.js';

function render() {
  const s = getState();
  renderChrome(s);
  switch (s.step) {
    case 1: renderStudents(s); break;
    case 2: renderRooms(s); break;
    case 3: renderPlan(s); break;
    case 4: renderExport(s); renderTemplateOutputs(s); break;
    default: break;
  }
}

function restoreSession(classrooms) {
  let restored = null;
  try {
    restored = loadSession(classrooms.rooms);
  } catch (err) {
    console.error(err);
  }
  if (!restored) return;
  set(restored);
  hydrateStudents(getState());
  document.getElementById('session-notice').hidden = false;
}

function startAutoSave() {
  onStorageError(() => showToast(t('storageFull'), true));
  subscribe((s) => saveSessionSoon(s));
  window.addEventListener('pagehide', () => saveSessionNow(getState()));
}

async function startFresh() {
  if (!(await askConfirm(t('startFreshConfirm'), t('startFreshOk')))) return;
  clearSession();
  history.replaceState(null, '', location.pathname + location.search);
  location.reload();
}

async function init() {
  applyLang();
  document.getElementById('lang-toggle').addEventListener('click', toggleLang);

  const res = await fetch('data/classrooms.json');
  const classrooms = await res.json();

  initWizard(classrooms, { ensurePlan });
  initStudents();
  initRooms(classrooms);
  initPlan(classrooms);
  initExport(classrooms);
  initTemplateUi(classrooms, {
    onApplied: () => {
      hydrateStudents(getState());
      clampStep();
    },
  });

  document.querySelectorAll('[data-start-fresh]').forEach((btn) => {
    btn.addEventListener('click', startFresh);
  });
  document.getElementById('session-dismiss').addEventListener('click', () => {
    document.getElementById('session-notice').hidden = true;
  });

  // Registered before the restore so restored data draws itself.
  subscribe(render);
  restoreSession(classrooms);
  clampStep();
  render();
  await applyHashTemplate();
  // Last, so restoring and hydrating above do not immediately rewrite storage.
  startAutoSave();
}

init();
