// Student list parsing: Ninova text / .txt, CSV/TSV, and .xlsx (via ExcelJS).
// Port of _load_student_ids / _format_long_name from seating_plan_generator.py.

const MAX_NAME_LEN = 16;

// Names longer than 16 chars get middle names abbreviated to initials;
// if still too long, the initials lose their separating spaces.
export function formatLongName(fullName) {
  if (fullName.length <= MAX_NAME_LEN) return fullName;
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return fullName;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const middles = parts.slice(1, -1);
  let initials = middles.map((p) => p[0] + '.').join(' ');
  let formatted = `${first} ${initials} ${last}`;
  if (formatted.length > MAX_NAME_LEN) {
    initials = middles.map((p) => p[0] + '.').join('');
    formatted = `${first} ${initials} ${last}`;
  }
  return formatted;
}

// Internal whitespace is kept as it is in the list (the CLI only strips the
// ends), so a double space inside a name comes out the same in both tools.
function makeStudent(id, rawName) {
  const clean = rawName.trim();
  return { id: id.trim(), rawName: clean, name: formatLongName(clean) };
}

// Ninova format: one student per line, "150220722   Ahmet Yılmaz (yilmaza22)".
// The Python original sliced up to rfind("(") which chopped the last character
// when no nickname was present; here a missing "(" keeps the whole rest.
export function parseNinovaText(text) {
  const students = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const id = line.split(/\s+/)[0];
    if (!id) continue;
    const paren = line.lastIndexOf('(');
    const name = line.slice(id.length, paren === -1 ? undefined : paren).trim();
    if (!name) continue;
    students.push(makeStudent(id, name));
  }
  return students;
}

// CSV/TSV: first column = ID, second = name (or name split over the remaining
// columns). Delimiter sniffed per file; quoted fields supported. A header row
// (non-numeric first cell) is skipped.
export function parseCsv(text) {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? undefined : text.indexOf('\n'));
  const delim = [';', '\t', ','].find((d) => firstLine.includes(d)) || ',';

  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }

  return rowsToStudents(rows);
}

// Shared for CSV and xlsx: rows of cells -> students.
export function rowsToStudents(rows) {
  const students = [];
  for (const cells of rows) {
    const trimmed = cells.map((c) => String(c ?? '').trim());
    if (!trimmed.some(Boolean)) continue;
    const id = trimmed[0];
    const name = trimmed.slice(1).filter(Boolean).join(' ');
    if (!id || !name) continue;
    if (!/\d/.test(id)) continue; // header row ("Öğrenci No", "ID", …)
    students.push(makeStudent(id, name));
  }
  return students;
}

// .xlsx via ExcelJS (loaded globally from vendor/). First sheet only.
export async function parseXlsx(arrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows = [];
  ws.eachRow((row) => {
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      let v = cell.value;
      if (v && typeof v === 'object') v = v.richText ? v.richText.map((r) => r.text).join('') : (v.result ?? v.text ?? '');
      cells.push(v == null ? '' : String(v));
    });
    rows.push(cells);
  });
  return rowsToStudents(rows);
}
