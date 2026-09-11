// Minimal RFC-4180-ish CSV parser -- no npm dependency available (this
// repo has none, same reason test/support/d1-shim.js hand-rolls a D1
// shim instead of installing one). Handles quoted fields, embedded
// commas/newlines inside quotes, and escaped quotes ("" -> ").
// Deliberately does NOT try to sniff delimiters/encodings beyond
// UTF-8 comma-separated -- brief §11 only asks for CSV/JSON, not a
// general-purpose spreadsheet importer.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  // Normalize line endings up front so \r\n inside/outside quotes
  // behaves identically.
  const input = text.replace(/\r\n/g, '\n');

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') { inQuotes = true; continue; }
    if (char === ',') { row.push(field); field = ''; continue; }
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += char;
  }
  // Final field/row (files not always newline-terminated).
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  if (rows.length === 0) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.length > 1 || (r.length === 1 && r[0] !== ''))
    .map(r => {
      const obj = {};
      header.forEach((key, idx) => { obj[key] = r[idx] !== undefined ? r[idx] : ''; });
      return obj;
    });
}

/**
 * Parses a JSON import payload into a flat array of row objects.
 * Accepts either a bare array or { rows: [...] } / { data: [...] }
 * wrapper shapes, since networks are inconsistent about this.
 */
export function parseJsonRows(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  if (Array.isArray(parsed?.data)) return parsed.data;
  throw new Error('JSON import must be an array of rows, or an object with a "rows" or "data" array');
}
