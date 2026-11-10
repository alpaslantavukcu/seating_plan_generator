// Templates in the window: the "Load template" dialog (step 1), the code /
// link / .json outputs (step 4), and #t= share links. A template can carry
// the student list, so a class can reuse it all semester.

import { getState, update, dropPlan } from './store.js';
import { t } from './i18n.js';
import {
  extractSettings, buildTemplate, serializeTemplate,
  encodeTemplateCode, decodeSettings, parseTemplateJson, validateTemplate,
} from './template.js';
import { safeFileName, downloadBlob } from './export-common.js';
import { showToast, copyText, confirmDropPlan, askConfirm, wireDropzone } from './ui.js';

let classrooms = null;
let onApplied = () => {};
// Whether step 4's template outputs include the student list. On by default;
// not saved — sharing names should be a fresh choice each session.
let includeStudents = true;
let outputKey = null;
let outputToken = 0;

const readTemplateFile = (text) => validateTemplate(parseTemplateJson(text), classrooms.rooms);
const readTemplateCode = (code) => decodeSettings(code, classrooms.rooms);

export function initTemplateUi(cls, hooks) {
  classrooms = cls;
  onApplied = hooks.onApplied;

  const dialog = document.getElementById('tpl-dialog');
  const codeInput = document.getElementById('tpl-code');

  document.getElementById('tpl-open').addEventListener('click', () => {
    dialog.showModal();
    codeInput.focus();
  });
  document.querySelectorAll('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('dialog').close());
  });
  // A press on the backdrop (outside the dialog box) closes it.
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dialog.close();
  });

  wireDropzone(
    document.getElementById('tpl-drop'),
    document.getElementById('tpl-file'),
    async (file) => {
      if (await loadTemplateText(await file.text(), readTemplateFile)) dialog.close();
    },
    dialog,
  );

  const apply = async () => {
    if (await loadTemplateText(codeInput.value, readTemplateCode)) {
      codeInput.value = '';
      dialog.close();
    }
  };
  document.getElementById('tpl-apply').addEventListener('click', apply);
  codeInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    // Without this, focus returns to the "Load template" button as the dialog
    // closes and the same Enter press opens it again.
    e.preventDefault();
    apply();
  });

  const include = document.getElementById('tpl-include-students');
  include.checked = includeStudents;
  include.addEventListener('change', () => {
    includeStudents = include.checked;
    renderTemplateOutputs(getState());
  });

  document.getElementById('tpl-save').addEventListener('click', () => {
    const s = getState();
    const settings = extractSettings(s);
    const template = buildTemplate(settings, classrooms.version, studentsToShare(s));
    const blob = new Blob([serializeTemplate(template)], { type: 'application/json' });
    downloadBlob(blob, `${safeFileName(settings.examName)}-template.json`);
  });

  const codeOut = document.getElementById('tpl-code-out');
  const linkOut = document.getElementById('tpl-link-out');
  document.getElementById('tpl-copy-code').addEventListener('click', () => copyText(codeOut.value, codeOut));
  document.getElementById('tpl-copy-link').addEventListener('click', () => copyText(linkOut.value, linkOut));
  [codeOut, linkOut].forEach((input) => input.addEventListener('focus', () => input.select()));

  // Opening a shared link while the app is already open is a same-document
  // fragment navigation — init never re-runs, so catch it here too.
  window.addEventListener('hashchange', applyHashTemplate);
}

function studentsToShare(s) {
  return includeStudents && s.students.length ? s.students : null;
}

export function renderTemplateOutputs(s) {
  const n = s.students.length;
  const include = document.getElementById('tpl-include-students');
  include.disabled = n === 0;
  document.getElementById('tpl-include-label').textContent = t('tplIncludeStudents', { n });
  document.getElementById('tpl-students-hint').hidden = !studentsToShare(s);
  const current = document.getElementById('tpl-code-out').value;
  document.getElementById('tpl-code-len').textContent = current ? t('charCount', { n: current.length }) : '';

  // Encoding a student list compresses it, so only redo it when the inputs
  // changed; the token drops results that arrive after a newer request.
  const settings = extractSettings(s);
  const students = studentsToShare(s);
  const key = JSON.stringify([settings, students && students.map((st) => [st.id, st.rawName])]);
  if (key === outputKey) return;
  outputKey = key;
  const token = ++outputToken;
  encodeTemplateCode(settings, students).then((code) => {
    if (token === outputToken) showOutputs(code);
  }, (err) => {
    console.error(err);
    if (token === outputToken) showOutputs('');
  });
}

function showOutputs(code) {
  document.getElementById('tpl-code-out').value = code;
  // The `t=` already labels it, so the link drops the SP1- prefix the copied
  // code keeps for recognisability in a chat message.
  document.getElementById('tpl-link-out').value = code
    ? `${location.origin}${location.pathname}#t=${code.replace(/^SP1-/, '')}`
    : '';
  document.getElementById('tpl-code-len').textContent = code ? t('charCount', { n: code.length }) : '';
}

function sameStudents(a, b) {
  return a.length === b.length && a.every((st, i) => st.id === b[i].id && st.rawName === b[i].rawName);
}

// `read` turns the pasted code or file contents into {settings, warnings,
// students}; it may be async.
async function loadTemplateText(text, read) {
  let result;
  try {
    result = await read(text);
  } catch (err) {
    console.error(err);
    showToast(t('tplInvalid'), true);
    return false;
  }
  const s = getState();
  const incoming = result.students;
  if (incoming && s.students.length && !sameStudents(s.students, incoming)) {
    // A different list is already loaded: say what is replaced (and, if the
    // plan was edited by hand, that those edits go too).
    const message = t('tplReplaceStudents', { n: incoming.length, m: s.students.length })
      + (s.plan && s.planEdited ? ` ${t('editsLostNote')}` : '');
    if (!(await askConfirm(message, t('tplReplaceOk')))) return false;
  } else if (!(await confirmDropPlan())) {
    return false;
  }
  applySettings(result);
  return true;
}

// Settings replace the current ones, and so does the student list when the
// template carries one; otherwise the loaded list is kept. The plan is
// dropped because it no longer matches. A code carries no exam name, so its
// patch has no examName key and the name the user typed stays.
function applySettings({ settings, warnings, students }) {
  const keptName = !('examName' in settings);
  update((s) => {
    Object.assign(s, settings);
    if (students) s.students = students;
    dropPlan(s);
  });
  onApplied({ studentsReplaced: !!students });
  const loaded = students
    ? t(keptName ? 'tplLoadedCodeStudents' : 'tplLoadedStudents', { n: students.length })
    : t(keptName ? 'tplLoadedCode' : 'tplLoaded');
  const messages = [loaded, ...warnings.map((w) => t(w.key, w.params))];
  showToast(messages.join(' · '), warnings.length > 0);
}

// A shared link wins over whatever was restored: it replaces the settings.
// The hash is stripped either way, otherwise every later refresh would
// silently re-apply the template and wipe a freshly generated plan.
// Resolves to true when a template from the link was applied.
export async function applyHashTemplate() {
  if (!location.hash.startsWith('#t=')) return false;
  const code = location.hash.slice(3);
  history.replaceState(null, '', location.pathname + location.search);
  return loadTemplateText(code, readTemplateCode);
}
