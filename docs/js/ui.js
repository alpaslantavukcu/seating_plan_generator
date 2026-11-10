// Small UI helpers shared by the step modules: toast, confirmation dialog,
// clipboard, file drop zones, icons, and focus-preserving re-renders.

import { getState } from './store.js';
import { t } from './i18n.js';

export function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast' + (isError ? ' error' : '');
  toast.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { toast.hidden = true; }, 3400);
}

// Promise<boolean> — a styled replacement for window.confirm().
export function askConfirm(message, okLabel) {
  const dialog = document.getElementById('confirm-dialog');
  document.getElementById('confirm-text').textContent = message;
  const ok = document.getElementById('confirm-ok');
  const cancel = document.getElementById('confirm-cancel');
  ok.textContent = okLabel;
  return new Promise((resolve) => {
    const finish = (value) => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onClose = () => finish(false); // Esc
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
    cancel.focus();
  });
}

// Changing students, rooms, capacities or settings makes the plan stale. An
// untouched plan is simply regenerated later; hand edits are worth a question.
export async function confirmDropPlan() {
  const s = getState();
  if (!s.plan || !s.planEdited) return true;
  return askConfirm(t('confirmDropPlan'), t('confirmDropPlanOk'));
}

export async function copyText(text, fallbackInput) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(t('tplCopied'));
  } catch (err) {
    // Blocked clipboard (file://, older browsers): select it for a manual copy.
    console.error(err);
    if (fallbackInput) {
      fallbackInput.focus();
      fallbackInput.select();
    }
    showToast(t('tplCopyFailed'), true);
  }
}

// A <label class="dropzone"> wrapping a hidden file input: click to pick,
// or drop a file onto `target` (the zone itself unless given).
export function wireDropzone(zone, input, handler, target = zone) {
  const run = async (file) => {
    if (file) await handler(file);
  };
  input.addEventListener('change', () => {
    const file = input.files[0];
    input.value = ''; // so picking the same file twice still fires
    run(file);
  });
  target.addEventListener('dragover', (e) => {
    e.preventDefault();
    target.classList.add('dragover');
  });
  target.addEventListener('dragleave', (e) => {
    if (!target.contains(e.relatedTarget)) target.classList.remove('dragover');
  });
  target.addEventListener('drop', (e) => {
    e.preventDefault();
    target.classList.remove('dragover');
    run(e.dataTransfer.files[0]);
  });
}

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Rebuild a container's children without losing keyboard focus: elements
// that carry data-focus-key get focus back after the rebuild.
export function rebuild(container, build) {
  const active = document.activeElement;
  const key = active && container.contains(active) ? active.dataset.focusKey : null;
  container.replaceChildren();
  build(container);
  if (key) container.querySelector(`[data-focus-key="${CSS.escape(key)}"]`)?.focus();
}
