// Auto-saves the working session — settings, parsed students, the generated
// plan with every swap and inline edit, and the wizard step — to localStorage, so a
// refresh or a closed tab loses nothing. Everything stays on this machine; the
// language lives in its own 'sp-lang' key and is never touched here.

import { extractSettings, validateTemplate, TEMPLATE_TYPE, TEMPLATE_VERSION } from './template.js';

const KEY = 'sp-session';
const SESSION_VERSION = 1;
const DEBOUNCE_MS = 300;

let timer = null;
let disabled = false;
let errorHandler = null;

export function onStorageError(fn) {
  errorHandler = fn;
}

function payload(state) {
  return {
    v: SESSION_VERSION,
    savedAt: new Date().toISOString(),
    settings: extractSettings(state),
    students: state.students,
    plan: state.plan,
    planEdited: state.planEdited,
    usedSeed: state.usedSeed,
    activeRoom: state.activeRoom,
    step: state.step,
  };
}

export function saveSessionNow(state) {
  clearTimeout(timer);
  if (disabled) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(payload(state)));
  } catch (err) {
    // Quota exceeded or storage blocked: stop trying and tell the user once.
    console.error(err);
    disabled = true;
    if (errorHandler) errorHandler(err);
  }
}

export function saveSessionSoon(state) {
  if (disabled) return;
  clearTimeout(timer);
  timer = setTimeout(() => saveSessionNow(state), DEBOUNCE_MS);
}

function discardStored() {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    console.error(err);
  }
}

// "Start fresh": wipe the session AND stop this page from ever writing again.
// Without the latch the pagehide flush would re-save everything on the way out
// and the reload would restore what the user just asked to erase.
export function clearSession() {
  clearTimeout(timer);
  disabled = true;
  discardStored();
}

// A plan holds one entry per physical seat of each room, so it is only valid
// against the exact layout it was built from. If classrooms.json changed under
// it, or the saved rooms no longer match the saved selection, drop the plan
// rather than render a wrong grid — the setup still restores.
function restorePlan(rawPlan, selectedRooms, rooms, studentCount) {
  if (!rawPlan || typeof rawPlan !== 'object') return null;
  const plannedRooms = Object.keys(rawPlan);
  if (!plannedRooms.length) return null;
  if (plannedRooms.length !== selectedRooms.length) return null;
  if (!plannedRooms.every((id) => selectedRooms.includes(id))) return null;

  const plan = {};
  for (const id of selectedRooms) {
    const room = rooms[id];
    const entries = rawPlan[id];
    if (!room || !Array.isArray(entries) || entries.length !== room.seats.length) return null;
    // seat/cell are re-derived from the live layout; only the occupancy is
    // taken from storage.
    plan[id] = entries.map((entry, i) => {
      const idx = entry && Number.isInteger(entry.studentIdx)
        && entry.studentIdx >= 0 && entry.studentIdx < studentCount
        ? entry.studentIdx
        : null;
      return { seat: room.seats[i].n, cell: room.seats[i].cell, studentIdx: idx };
    });
  }
  return plan;
}

// Returns a store patch, or null when there is nothing worth restoring.
export function loadSession(rooms) {
  let raw;
  try {
    raw = localStorage.getItem(KEY);
  } catch (err) {
    console.error(err);
    return null;
  }
  if (!raw) return null;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    discardStored();
    return null;
  }
  if (!data || data.v !== SESSION_VERSION) {
    discardStored();
    return null;
  }

  let settings;
  try {
    // Same rules as a shared template: unknown rooms out, capacities clamped.
    ({ settings } = validateTemplate(
      { type: TEMPLATE_TYPE, version: TEMPLATE_VERSION, settings: data.settings },
      rooms,
    ));
  } catch (err) {
    console.error(err);
    discardStored();
    return null;
  }

  const students = Array.isArray(data.students)
    ? data.students
        .filter((s) => s && typeof s === 'object')
        .map((s) => ({
          id: String(s.id ?? ''),
          name: String(s.name ?? ''),
          rawName: String(s.rawName ?? s.name ?? ''),
        }))
    : [];

  const plan = restorePlan(data.plan, settings.selectedRooms, rooms, students.length);

  if (!plan && !students.length && !settings.examName && !settings.selectedRooms.length) {
    return null; // nothing meaningful was saved
  }

  let activeRoom = null;
  if (plan) {
    activeRoom = settings.selectedRooms.includes(data.activeRoom)
      ? data.activeRoom
      : settings.selectedRooms[0];
  }

  return {
    ...settings,
    students,
    plan,
    usedSeed: plan && Number.isFinite(data.usedSeed) ? data.usedSeed : null,
    // Older sessions have no flag: assume hand edits so nothing is dropped silently.
    planEdited: plan ? data.planEdited !== false : false,
    activeRoom,
    // The caller clamps this to the furthest step the restored data allows.
    step: Number.isInteger(data.step) ? data.step : 1,
  };
}
