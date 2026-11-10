// The four-step window: which step is open, which steps may be opened, the
// step indicator and the bottom bar (Back · status · Next).

import { getState, set, activeCellOrder, effectiveCaps } from './store.js';
import { totalCapacity } from './algorithm.js';
import { t } from './i18n.js';
import { placedCount } from './plan-ops.js';

export const STEP_LABELS = ['stepExam', 'stepRooms', 'stepPlan', 'stepExport'];
const LAST_STEP = STEP_LABELS.length;

let rooms = null;
let ensurePlan = () => {};

export function initWizard(classrooms, hooks) {
  rooms = classrooms.rooms;
  ensurePlan = hooks.ensurePlan;

  document.getElementById('stepper').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-go]');
    if (btn && !btn.disabled) goTo(Number(btn.dataset.go));
  });
  document.getElementById('nav-back').addEventListener('click', () => goTo(getState().step - 1));
  document.getElementById('nav-next').addEventListener('click', next);
}

// What still blocks leaving step n, as {key, params} for t(); null if nothing.
export function stepIssue(n, s = getState()) {
  if (n === 1) {
    if (!s.examName.trim()) return { key: 'needName' };
    if (!s.students.length) return { key: 'needStudents' };
  } else if (n === 2) {
    if (!s.selectedRooms.length) return { key: 'needRooms' };
    const cap = totalCapacity(s.selectedRooms, rooms, effectiveCaps(s));
    if (s.students.length > cap) return { key: 'needCapacity', params: { n: s.students.length, cap } };
  } else if (n === 3) {
    if (!activeCellOrder(s).length) return { key: 'needFields' };
  }
  return null;
}

// The furthest step that may be opened. Step 3 opens as soon as steps 1–2
// are complete (the plan is generated on arrival); step 4 needs a plan.
export function maxReachable(s = getState()) {
  if (stepIssue(1, s)) return 1;
  if (stepIssue(2, s)) return 2;
  if (!s.plan || stepIssue(3, s)) return 3;
  return LAST_STEP;
}

export function goTo(n, { focus = true } = {}) {
  const target = Math.max(1, Math.min(n, maxReachable()));
  if (target === 3 && !getState().plan) ensurePlan();
  if (target === getState().step) return;
  set({ step: target });
  document.getElementById('session-notice').hidden = true; // it has done its job
  document.getElementById('win-body').scrollTop = 0;
  if (focus) {
    requestAnimationFrame(() => {
      document.querySelector(`.step[data-step="${target}"] h2`)?.focus({ preventScroll: true });
    });
  }
}

// After a restore or a template: never leave the window on a step the data
// no longer supports.
export function clampStep() {
  const s = getState();
  const target = Math.max(1, Math.min(s.step || 1, maxReachable(s)));
  if (target === 3 && !s.plan) ensurePlan();
  if (target !== getState().step) set({ step: target });
}

function next() {
  const s = getState();
  if (stepIssue(s.step, s)) {
    // Next looks disabled; a press explains why instead of doing nothing.
    const btn = document.getElementById('nav-next');
    btn.classList.remove('nudge');
    void btn.offsetWidth; // restart the animation
    btn.classList.add('nudge');
    document.getElementById('step-status').classList.replace('todo', 'error');
    return;
  }
  goTo(s.step + 1);
}

function statusFor(s) {
  switch (s.step) {
    case 1:
      return { text: t('parsedCount', { n: s.students.length }), tone: 'ok' };
    case 2: {
      const cap = totalCapacity(s.selectedRooms, rooms, effectiveCaps(s));
      return { text: t('capSummary', { n: s.students.length, cap }), tone: 'ok' };
    }
    case 3: {
      const placed = placedCount(s);
      const missing = s.students.length - placed;
      return missing > 0
        ? { text: t('unplaced', { n: missing }), tone: 'warn' }
        : { text: t('placedCount', { placed }), tone: 'ok' };
    }
    default:
      return { text: s.usedSeed != null ? t('usedSeed', { seed: s.usedSeed }) : '', tone: '' };
  }
}

export function renderChrome(s) {
  const reach = maxReachable(s);

  document.querySelectorAll('[data-step-item]').forEach((li) => {
    const n = Number(li.dataset.stepItem);
    const btn = li.querySelector('button');
    li.classList.toggle('current', n === s.step);
    li.classList.toggle('done', n !== s.step && n < reach);
    li.classList.toggle('reached', n <= reach);
    btn.disabled = n > reach;
    if (n === s.step) btn.setAttribute('aria-current', 'step');
    else btn.removeAttribute('aria-current');
  });
  document.getElementById('stepper-compact').textContent =
    t('stepOf', { n: s.step, name: t(STEP_LABELS[s.step - 1]) });
  document.getElementById('progress-bar').style.width = `${(s.step / LAST_STEP) * 100}%`;

  document.querySelectorAll('.step[data-step]').forEach((section) => {
    section.hidden = Number(section.dataset.step) !== s.step;
  });

  const back = document.getElementById('nav-back');
  const nextBtn = document.getElementById('nav-next');
  back.classList.toggle('invisible', s.step === 1);
  nextBtn.classList.toggle('invisible', s.step === LAST_STEP);
  document.getElementById('nav-next-label').textContent =
    s.step === 2 && !s.plan ? t('nextGenerate')
      : s.step === 3 ? t('nextExport')
        : t('next');

  const issue = s.step < LAST_STEP ? stepIssue(s.step, s) : null;
  nextBtn.setAttribute('aria-disabled', String(!!issue));
  const status = document.getElementById('step-status');
  const { text, tone } = issue
    ? { text: t(issue.key, issue.params), tone: 'todo' }
    : statusFor(s);
  status.textContent = text;
  status.className = 'step-status' + (tone ? ` ${tone}` : '');
}
