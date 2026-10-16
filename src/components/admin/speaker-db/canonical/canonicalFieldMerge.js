// canonicalFieldMerge.js
// ---------------------------------------------------------------------------
// The cell semantics of a canonical import, in one place.
//
//   blank cell        -> UNCHANGED  (the existing value is left exactly as it is)
//   [CLEAR]           -> CLEAR      (the value is deliberately removed)
//   anything else     -> NEW VALUE  (the value is proposed)
//
// The legacy comparison importer treats a blank cell as "clear this field",
// which is why an unedited sheet could silently wipe evidence. This module is
// the opposite by design, and it is the only place that decides what a cell
// means, so the preview and the write can never disagree about it.
//
// Nothing here calculates anything: it reads, coerces, compares and formats.
// ---------------------------------------------------------------------------

import { CLEAR_TOKEN } from "./canonicalSchema.js";

export const EMPTY_NUMBER_TEXT = "Not published";
export const EMPTY_TEXT = "—";

const DATE_EPOCH = Date.UTC(1899, 11, 30);

/** Excel serial number -> YYYY-MM-DD. */
export function excelSerialToDate(serial) {
  const value = Number(serial);
  if (!Number.isFinite(value) || value <= 0) return "";
  return new Date(DATE_EPOCH + value * 86400000).toISOString().slice(0, 10);
}

function toDateString(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "number" && raw > 0 && raw < 100000) return excelSerialToDate(raw);
  const text = String(raw ?? "").trim();
  if (!text) return "";
  // Already ISO, or any parseable date.
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(text)) {
    return parsed.toISOString().slice(0, 10);
  }
  return text;
}

/**
 * What a cell means.
 * @returns {{kind: 'unchanged'|'clear'|'value', value: any}}
 */
export function readCell(raw) {
  if (raw === null || raw === undefined) return { kind: "unchanged", value: null };
  if (typeof raw === "string") {
    const text = raw.trim();
    if (text === "") return { kind: "unchanged", value: null };
    if (text.toLowerCase() === CLEAR_TOKEN.toLowerCase()) return { kind: "clear", value: null };
    return { kind: "value", value: raw };
  }
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return { kind: "unchanged", value: null };
    return { kind: "value", value: raw };
  }
  return { kind: "value", value: raw };
}

/**
 * Coerce a supplied cell into the column's type.
 * @returns {{ok: boolean, value: any, error: string|null}}
 */
export function coerceValue(column, raw) {
  const type = column.type;
  if (type === "number") {
    if (typeof raw === "number" && Number.isFinite(raw)) return { ok: true, value: raw, error: null };
    const text = String(raw).trim();
    // Tolerate a unit suffix ("102 dB", "4 ohm", "90°") and a thousands comma.
    const numeric = Number(text.replace(/,/g, "").replace(/^[^0-9+\-.]*/, "").replace(/[^0-9eE+\-.]*$/, ""));
    if (!Number.isFinite(numeric)) {
      return { ok: false, value: null, error: `“${text}” is not a number` };
    }
    return { ok: true, value: numeric, error: null };
  }
  if (type === "date") {
    const text = toDateString(raw);
    if (!text) return { ok: false, value: null, error: "Not a recognisable date" };
    return { ok: true, value: text, error: null };
  }
  const text = String(raw).trim();
  if (type === "select" && Array.isArray(column.options)) {
    const match = column.options.find((option) => option.toLowerCase() === text.toLowerCase());
    if (!match) {
      return { ok: false, value: null, error: `“${text}” is not one of: ${column.options.join(", ")}` };
    }
    return { ok: true, value: match, error: null };
  }
  return { ok: true, value: text, error: null };
}

export function isBlankValue(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

/** Numbers compare numerically, text compares trimmed, dates compare as ISO strings. */
export function valuesMatch(type, a, b) {
  const blankA = isBlankValue(a);
  const blankB = isBlankValue(b);
  if (blankA && blankB) return true;
  if (blankA !== blankB) return false;
  if (type === "number") return Number(a) === Number(b);
  if (type === "date") return toDateString(a) === toDateString(b);
  return String(a).trim() === String(b).trim();
}

/** Text for the preview: a blank figure says so rather than reading as zero. */
export function displayValue(type, value) {
  if (isBlankValue(value)) return type === "number" ? EMPTY_NUMBER_TEXT : EMPTY_TEXT;
  if (type === "number") return String(Number(value));
  return String(value);
}

/** The stored value for one editable column, from the resolved target records. */
export function currentValueFor(column, context) {
  if (column.target === "manufacturer") return context.manufacturer?.[column.field] ?? null;
  if (column.target === "product") return context.product?.[column.field] ?? null;
  if (column.target === "spec") {
    const specValue = context.spec?.[column.field];
    if (specValue !== undefined && specValue !== null && specValue !== "") return specValue;
    // A new specification inherits the product's current values where the field
    // is not held on the specification itself — nothing is invented, the value
    // shown is the value that is in the database today.
    return specValue ?? null;
  }
  return null;
}

/**
 * Resolve every editable column for one row.
 * @returns {{proposed: object, changes: Array, errors: Array}}
 *   proposed: { product: {field: value}, spec: {field: value} } — only touched fields
 *   changes:  field-level diffs, each with the current and the proposed display value
 */
export function resolveRowChanges(columns, context, cells, rowNumber) {
  const proposed = { manufacturer: {}, product: {}, spec: {} };
  const changes = [];
  const errors = [];

  for (const column of columns) {
    const cell = readCell(cells[column.key]);

    if (cell.kind === "clear") {
      const current = currentValueFor(column, context);
      if (isBlankValue(current)) continue; // already empty — clearing changes nothing
      proposed[column.target][column.field] = null;
      changes.push({
        key: column.key,
        label: column.label,
        group: column.group,
        target: column.target,
        field: column.field,
        action: "clear",
        current: displayValue(column.type, current),
        proposed: displayValue(column.type, null),
      });
      continue;
    }

    if (cell.kind === "unchanged") continue;

    const coerced = coerceValue(column, cell.value);
    if (!coerced.ok) {
      errors.push({ rowNumber, column: column.key, label: column.label, message: coerced.error });
      continue;
    }

    const current = currentValueFor(column, context);
    if (valuesMatch(column.type, current, coerced.value)) continue;

    proposed[column.target][column.field] = coerced.value;
    changes.push({
      key: column.key,
      label: column.label,
      group: column.group,
      target: column.target,
      field: column.field,
      action: isBlankValue(current) ? "set" : "change",
      current: displayValue(column.type, current),
      proposed: displayValue(column.type, coerced.value),
    });
  }

  return { proposed, changes, errors };
}