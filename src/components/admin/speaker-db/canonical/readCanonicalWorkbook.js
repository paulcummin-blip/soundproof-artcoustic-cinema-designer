// readCanonicalWorkbook.js
// ---------------------------------------------------------------------------
// Reads a canonical Speaker Database workbook back in.
//
// It verifies the workbook is one of ours (the schema version marker has to be
// present, so a random spreadsheet cannot be imported as speaker data by
// accident) and returns the raw cells. It applies no cell semantics of its own —
// blank, [CLEAR] and value are interpreted by canonicalFieldMerge, so the reader
// and the diff engine can never disagree about what a cell means.
// ---------------------------------------------------------------------------

import { CANONICAL_SCHEMA_VERSION, CHANGE_LOG_TYPES, SHEET_NAMES } from "./canonicalSchema.js";
import { loadSheetJs } from "./loadSheetJs.js";

const REQUIRED_COLUMNS = ["manufacturer_id", "manufacturer", "product_id", "model", "specification_id"];
const MAX_HEADER_SCAN_ROWS = 10;

function gridOf(XLSX, sheet) {
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null });
}

function textOfGrid(grid) {
  return grid.flat().map((cell) => String(cell ?? "")).join(" ");
}

function findHeaderRow(grid) {
  for (let index = 0; index < Math.min(grid.length, MAX_HEADER_SCAN_ROWS); index += 1) {
    const keys = (grid[index] || []).map((cell) => String(cell ?? "").trim());
    if (keys.includes("manufacturer_id") && keys.includes("model")) return index;
  }
  return -1;
}

function locateDataSheet(XLSX, workbook, errors) {
  const named = workbook.Sheets[SHEET_NAMES.data];
  if (named && findHeaderRow(gridOf(XLSX, named)) >= 0) return named;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (findHeaderRow(gridOf(XLSX, sheet)) >= 0) return sheet;
  }
  errors.push(`No “${SHEET_NAMES.data}” sheet was found. Export the workbook from Sound Proof and edit that file.`);
  return null;
}

function readChangeLog(XLSX, workbook) {
  const sheet = workbook.Sheets[SHEET_NAMES.changeLog];
  if (!sheet) return [];
  const grid = gridOf(XLSX, sheet);
  const headerIndex = grid.findIndex((row) => (row || []).map((cell) => String(cell ?? "").trim()).includes("change_type"));
  if (headerIndex < 0) return [];
  const keys = (grid[headerIndex] || []).map((cell) => String(cell ?? "").trim());
  const notes = [];
  for (const row of grid.slice(headerIndex + 1)) {
    const record = {};
    keys.forEach((key, index) => { if (key) record[key] = row?.[index] ?? null; });
    const note = String(record.note ?? "").trim();
    const type = String(record.change_type ?? "").trim();
    if (!note && !type) continue;
    if (type && !CHANGE_LOG_TYPES.includes(type.toUpperCase().trim())) continue;
    notes.push({
      manufacturer_id: String(record.manufacturer_id ?? "").trim(),
      product_id: String(record.product_id ?? "").trim(),
      model: String(record.model ?? "").trim(),
      change_type: type,
      note,
    });
  }
  return notes;
}

/**
 * @returns {object} { schemaVersion, fileName, rows, changeLog, errors }
 */
export async function readCanonicalWorkbook(file) {
  const XLSX = await loadSheetJs();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const errors = [];

  const markerText = [SHEET_NAMES.instructions, SHEET_NAMES.fields]
    .map((name) => textOfGrid(gridOf(XLSX, workbook.Sheets[name])))
    .join(" ");
  const marker = markerText.match(/speaker-database-schema-v\d+/)?.[0] || null;
  if (!marker) {
    errors.push("This workbook does not carry a Sound Proof Speaker Database schema marker, so it was not produced by the export and cannot be imported.");
    return { schemaVersion: null, fileName: file.name, rows: [], changeLog: [], errors };
  }
  if (marker !== CANONICAL_SCHEMA_VERSION) {
    errors.push(`This workbook was made with schema ${marker}, and Sound Proof reads ${CANONICAL_SCHEMA_VERSION}. Export a fresh workbook and edit that one.`);
    return { schemaVersion: marker, fileName: file.name, rows: [], changeLog: [], errors };
  }

  const dataSheet = locateDataSheet(XLSX, workbook, errors);
  if (!dataSheet) return { schemaVersion: marker, fileName: file.name, rows: [], changeLog: [], errors };

  const grid = gridOf(XLSX, dataSheet);
  const headerIndex = findHeaderRow(grid);
  const keys = (grid[headerIndex] || []).map((cell) => String(cell ?? "").trim());
  const missing = REQUIRED_COLUMNS.filter((column) => !keys.includes(column));
  if (missing.length) {
    errors.push(`The workbook is missing required column(s): ${missing.join(", ")}.`);
    return { schemaVersion: marker, fileName: file.name, rows: [], changeLog: [], errors };
  }

  const rows = [];
  for (let index = headerIndex + 1; index < grid.length; index += 1) {
    const values = grid[index] || [];
    const hasContent = values.some((value) => value !== null && value !== undefined && String(value).trim() !== "");
    if (!hasContent) continue;
    const cells = {};
    keys.forEach((key, position) => { if (key) cells[key] = values[position] ?? null; });
    rows.push({ rowNumber: index + 1, cells });
  }

  if (!rows.length) errors.push("The workbook contains no data rows.");

  return {
    schemaVersion: marker,
    fileName: file.name,
    rows,
    changeLog: readChangeLog(XLSX, workbook),
    errors,
  };
}