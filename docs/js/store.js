// Tiny observable state container. Mutate via set()/update(); every
// subscriber runs after each mutation and re-renders what it owns.

export const DEFAULT_CELL_FIELDS = { id: true, name: true, seat: false };
// Line order inside a seat cell: the CLI's cell_params order. Ticking a field
// moves it to the end, so the lines appear in the order they were ticked.
export const DEFAULT_CELL_ORDER = ['id', 'name', 'seat'];
export const CELL_KEYS = ['id', 'name', 'seat'];

const state = {
  lang: localStorage.getItem('sp-lang') || 'tr',
  examName: '',
  seed: '',
  usedSeed: null,              // seed actually used for the last generation
  selectedRooms: [],           // order matters: fill order
  customCapacities: {},        // roomId -> capacity (only when custom enabled)
  useCustomCapacities: false,
  cellFields: { ...DEFAULT_CELL_FIELDS },
  cellOrder: [...DEFAULT_CELL_ORDER],
  students: [],                // [{id, name, rawName}]
  plan: null,                  // {roomId: [{seat, cell, studentIdx|null}]}
  planEdited: false,           // true once a seat was swapped, edited or cleared by hand
  activeRoom: null,
  step: 1,                     // wizard step on screen (1–4)
};

const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function set(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function update(fn) {
  fn(state);
  listeners.forEach((l) => l(state));
}

// The enabled fields in display order — the equivalent of the CLI's
// cell_params list (["student_id", "name", "seat_number"]).
export function activeCellOrder(s = state) {
  return s.cellOrder.filter((k) => s.cellFields[k]);
}

// Enable/disable one field. Enabling appends it to the order so the lines
// come out in tick order, like listing cell_params in the CLI input file.
export function setCellField(s, key, enabled) {
  s.cellFields[key] = enabled;
  if (enabled) {
    s.cellOrder = s.cellOrder.filter((k) => k !== key);
    s.cellOrder.push(key);
  }
}

// Capacities that actually apply: the per-room overrides only count while the
// custom-capacity flag is on (the flag is what templates and codes carry).
export function effectiveCaps(s = state) {
  return s.useCustomCapacities ? s.customCapacities : {};
}

// Forget the generated plan; it no longer matches the settings or students.
export function dropPlan(s) {
  s.plan = null;
  s.usedSeed = null;
  s.planEdited = false;
  s.activeRoom = null;
}
