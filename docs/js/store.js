// Tiny observable state container. Mutate via set()/update(); every
// subscriber runs after each mutation and re-renders what it owns.

const state = {
  lang: localStorage.getItem('sp-lang') || 'tr',
  examName: '',
  seed: '',
  usedSeed: null,              // seed actually used for the last generation
  selectedRooms: [],           // order matters: fill order
  customCapacities: {},        // roomId -> capacity (only when custom enabled)
  useCustomCapacities: false,
  cellFields: { id: true, name: true, seat: false },
  students: [],                // [{id, name, rawName}]
  plan: null,                  // {roomId: [{seat, cell, studentIdx|null}]}
  activeRoom: null,
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
