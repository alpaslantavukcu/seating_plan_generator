// Plan templates: a portable, settings-only description of a setup — exam name,
// classrooms and their fill order, custom capacities, seed, seat-cell fields.
// Templates deliberately carry NO student data and NO generated plan, because
// they travel as files, pasted codes and shared links.
//
// Pure module: no DOM, no i18n. Warnings come back as {key, params} for the
// caller to translate.

import { DEFAULT_CELL_FIELDS } from './store.js';

export const TEMPLATE_TYPE = 'seating-plan-template';
export const TEMPLATE_VERSION = 1;

const CODE_PREFIX = 'SP1-';
const MAX_NAME_LENGTH = 200;

export function extractSettings(state) {
  return {
    examName: state.examName,
    selectedRooms: state.selectedRooms.slice(),
    useCustomCapacities: state.useCustomCapacities,
    customCapacities: { ...state.customCapacities },
    seed: state.seed,
    cellFields: { ...state.cellFields },
  };
}

export function buildTemplate(settings, classroomsVersion) {
  return {
    type: TEMPLATE_TYPE,
    version: TEMPLATE_VERSION,
    savedAt: new Date().toISOString(),
    classroomsVersion: classroomsVersion ?? null,
    settings,
  };
}

export function serializeTemplate(template) {
  return JSON.stringify(template, null, 2);
}

/* ---------- code / link encoding ---------- */

// btoa() only accepts latin1, so exam names like "Arasınav Yerleşim" have to go
// through UTF-8 bytes first. base64url keeps the result safe in a URL hash.
function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code) {
  const base64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeTemplate(template) {
  return CODE_PREFIX + toBase64Url(JSON.stringify(template));
}

// Accepts a bare code, a prefixed one, or either with stray whitespace from a
// chat or email client. Throws on anything that is not a template.
export function decodeTemplate(code) {
  const cleaned = String(code ?? '').trim().replace(/\s+/g, '');
  const body = cleaned.startsWith(CODE_PREFIX) ? cleaned.slice(CODE_PREFIX.length) : cleaned;
  if (!body) throw new Error('empty template code');
  return JSON.parse(fromBase64Url(body));
}

export function parseTemplateJson(text) {
  return JSON.parse(text);
}

/* ---------- validation ---------- */

// Templates move between machines whose docs/data/classrooms.json may differ,
// so nothing in a template is trusted: unknown rooms are dropped, capacities are
// clamped to what the room actually holds, and the caller is told what changed.
// Returns {settings, warnings}; throws if the document is not a template at all.
export function validateSettings(raw, rooms) {
  if (!raw || typeof raw !== 'object') throw new Error('not a template');
  if (raw.type !== TEMPLATE_TYPE) throw new Error('not a seating plan template');
  if (raw.version !== TEMPLATE_VERSION) throw new Error(`unsupported template version: ${raw.version}`);

  const src = raw.settings;
  if (!src || typeof src !== 'object') throw new Error('template has no settings');

  const warnings = [];

  const examName = typeof src.examName === 'string'
    ? src.examName.trim().slice(0, MAX_NAME_LENGTH)
    : '';

  // Order is fill order — preserve it, drop duplicates and unknown rooms.
  const seen = new Set();
  const selectedRooms = [];
  const dropped = [];
  for (const id of Array.isArray(src.selectedRooms) ? src.selectedRooms : []) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    if (rooms[id]) selectedRooms.push(id);
    else dropped.push(id);
  }
  if (dropped.length) {
    warnings.push({ key: 'tplRoomsDropped', params: { rooms: dropped.join(', ') } });
  }

  const rawCaps = src.customCapacities && typeof src.customCapacities === 'object'
    ? src.customCapacities
    : {};
  const customCapacities = {};
  let clamped = 0;
  for (const id of selectedRooms) {
    const wanted = Math.trunc(Number(rawCaps[id]));
    if (!Number.isFinite(wanted) || wanted <= 0) continue;
    const capacity = Math.min(wanted, rooms[id].capacity);
    if (capacity !== wanted) clamped++;
    customCapacities[id] = capacity;
  }
  if (clamped) warnings.push({ key: 'tplCapsClamped', params: { n: clamped } });

  const seed = typeof src.seed === 'string' || typeof src.seed === 'number'
    ? String(src.seed).trim().replace(/\D/g, '')
    : '';

  const rawFields = src.cellFields && typeof src.cellFields === 'object' ? src.cellFields : {};
  let cellFields = { id: !!rawFields.id, name: !!rawFields.name, seat: !!rawFields.seat };
  // All-false would make the plan unbuildable (see validate() in main.js).
  if (!cellFields.id && !cellFields.name && !cellFields.seat) {
    cellFields = { ...DEFAULT_CELL_FIELDS };
  }

  return {
    settings: {
      examName,
      selectedRooms,
      useCustomCapacities: !!src.useCustomCapacities,
      customCapacities,
      seed,
      cellFields,
    },
    warnings,
  };
}
