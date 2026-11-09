// Templates in the window: the "Load template" dialog (step 1), the code /
// link / .json outputs (step 4), and #t= share links.

import { getState, update, dropPlan } from './store.js';
import { t } from './i18n.js';
import {
  extractSettings, buildTemplate, serializeTemplate,
  encodeSettings, decodeSettings, parseTemplateJson, validateTemplate,
} from './template.js';
import { safeFileName, downloadBlob } from './export-common.js';
import { showToast, copyText, confirmDropPlan, wireDropzone } from './ui.js';

let classrooms = null;
let onApplied = () => {};

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

  document.getElementById('tpl-save').addEventListener('click', () => {
    const settings = extractSettings(getState());
    const template = buildTemplate(settings, classrooms.version);
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

export function renderTemplateOutputs(s) {
  let code = '';
  try {
    code = encodeSettings(extractSettings(s));
  } catch (err) {
    console.error(err);
  }
  document.getElementById('tpl-code-out').value = code;
  // The `t=` already labels it, so the link drops the SP1- prefix the copied
  // code keeps for recognisability in a chat message.
  document.getElementById('tpl-link-out').value = code
    ? `${location.origin}${location.pathname}#t=${code.replace(/^SP1-/, '')}`
    : '';
}

// `read` turns the pasted code or file contents into {settings, warnings}.
async function loadTemplateText(text, read) {
  let result;
  try {
    result = read(text);
  } catch (err) {
    console.error(err);
    showToast(t('tplInvalid'), true);
    return false;
  }
  if (!(await confirmDropPlan())) return false;
  applySettings(result);
  return true;
}

// Settings replace the current ones; the student list is deliberately left
// alone, and the plan is dropped because it no longer matches the settings.
// A code carries no exam name, so its patch has no examName key and the name
// the user typed stays.
function applySettings({ settings, warnings }) {
  const keptName = !('examName' in settings);
  update((s) => {
    Object.assign(s, settings);
    dropPlan(s);
  });
  onApplied();
  const messages = [t(keptName ? 'tplLoadedCode' : 'tplLoaded'),
    ...warnings.map((w) => t(w.key, w.params))];
  showToast(messages.join(' · '), warnings.length > 0);
}

// A shared link wins over whatever was restored: it replaces the settings.
// The hash is stripped either way, otherwise every later refresh would
// silently re-apply the template and wipe a freshly generated plan.
export async function applyHashTemplate() {
  if (!location.hash.startsWith('#t=')) return;
  const code = location.hash.slice(3);
  history.replaceState(null, '', location.pathname + location.search);
  await loadTemplateText(code, readTemplateCode);
}
