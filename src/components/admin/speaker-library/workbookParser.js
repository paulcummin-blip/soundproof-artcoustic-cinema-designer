// workbookParser.js
// ---------------------------------------------------------------------------
// Reads an .xlsx/.xls/.csv workbook directly (SheetJS) and extracts real
// product rows from the grouped, irregular layout the RP22 comparison
// workbook uses: a header row, grouped manufacturer/product rows with blank
// manufacturer cells that continue the manufacturer above, a separate KEF
// block (its own header, possibly different columns), notes, pricing and
// brand-only rows. The first header row is never treated as a speaker.
//
// This parses the actual worksheet cells — it does not round-trip through an
// LLM extractor, which is what previously dropped every row and turned the
// header into a single "Brand / Product" speaker.
// ---------------------------------------------------------------------------

import * as XLSX from "xlsx";

const cleanCell = (v) => {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
};

// Header label → row field. Mirrors the aliases parsePasted understands so the
// same preview/Add-all path handles pasted and workbook rows alike.
const HEADER_ALIASES = {
  brand: "manufacturer", manufacturer: "manufacturer", make: "manufacturer", company: "manufacturer",
  product: "model", model: "model", name: "model", speaker: "model",
  productname: "model", modelname: "model", productmodel: "model",
  sensitivity: "sensitivity_db", sensitivitydb: "sensitivity_db", sens: "sensitivity_db",
  sensitivitybasis: "sensitivity_reference", basis: "sensitivity_reference",
  reference: "sensitivity_reference",
  impedance: "impedance_ohm", impedanceohm: "impedance_ohm",
  nominalimpedance: "impedance_ohm", ohms: "impedance_ohm",
  power: "power_w", continuouspower: "power_w", powerw: "power_w",
  amp: "power_w", amplifier: "power_w",
  maxspl: "max_spl_db", max_spl: "max_spl_db", maxspldb: "max_spl_db",
  spl: "max_spl_db", maxlevel: "max_spl_db",
  price: "price", retailprice: "price", priceincvat: "price",
  ukretail: "price", retail: "price", cost: "price", gbp: "price",
  url: "source_url", sourceurl: "source_url", source: "source_url",
  link: "source_url", websource: "source_url", website: "source_url",
};

const normaliseLabel = (raw) => {
  const clean = String(raw || "").trim().toLowerCase().replace(/[\s_\-()/.]+/g, "");
  return HEADER_ALIASES[clean] || null;
};

// A row is treated as a header only when at least two of its cells map to known
// field labels AND one of them is manufacturer or model. The manufacturer/model
// guard stops note rows ("See price list…") from being misread as a header and
// overwriting the real column map.
function isHeaderRow(cells) {
  const fields = new Set();
  for (const c of cells) {
    const f = normaliseLabel(cleanCell(c));
    if (f) fields.add(f);
  }
  if (fields.size < 2) return false;
  return fields.has("manufacturer") || fields.has("model");
}

function buildColumnMap(cells) {
  const map = {};
  cells.forEach((c, i) => {
    const f = normaliseLabel(cleanCell(c));
    if (f && map[f] === undefined) map[f] = i;
  });
  return map;
}

// Fallback before the first header is found — the common left-to-right layout.
const DEFAULT_MAP = {
  manufacturer: 0, model: 1, source_url: 2, sensitivity_db: 3,
  sensitivity_reference: 4, impedance_ohm: 5, power_w: 6, max_spl_db: 7, price: 8,
};

function readByMap(cells, map) {
  const out = {};
  for (const [field, idx] of Object.entries(map)) {
    out[field] = cleanCell(cells[idx] ?? "");
  }
  return out;
}

/**
 * Read a workbook File and return the product rows extracted from Sheet1.
 * @returns {Promise<{ rows: Array, brandOnly: Array<string> }>}
 */
export async function parseWorkbookFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { rows: [], brandOnly: [] };
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  return extractProductRows(matrix);
}

function extractProductRows(matrix) {
  const rows = [];
  const brandOnly = [];
  let columnMap = null;
  let lastManufacturer = "";

  for (const rawRow of matrix) {
    const cells = (Array.isArray(rawRow) ? rawRow : []).map(cleanCell);
    if (cells.every((c) => c === "")) continue; // blank / separator rows

    if (isHeaderRow(cells)) {
      const newMap = buildColumnMap(cells);
      // If a new block does not carry its own manufacturer column, drop the
      // carried-down manufacturer so the previous block's brand does not bleed
      // into it. Blocks that carry their own manufacturer are unaffected.
      if (newMap.manufacturer === undefined) lastManufacturer = "";
      columnMap = newMap;
      continue; // never treat a header as a speaker
    }

    const fields = readByMap(cells, columnMap || DEFAULT_MAP);
    let manufacturer = cleanCell(fields.manufacturer);
    const model = cleanCell(fields.model);
    if (manufacturer) lastManufacturer = manufacturer;
    else manufacturer = lastManufacturer; // blank cell continues the manufacturer above

    if (!manufacturer && !model) continue; // notes with no brand/product
    if (!model) {
      if (manufacturer) brandOnly.push(manufacturer); // brand-only — no dummy product
      continue;
    }
    if (!manufacturer) continue; // product with no brand and nothing carried — skip

    rows.push({
      manufacturer,
      model,
      source_url: cleanCell(fields.source_url),
      sensitivity_db: cleanCell(fields.sensitivity_db),
      sensitivity_reference: cleanCell(fields.sensitivity_reference),
      impedance_ohm: cleanCell(fields.impedance_ohm),
      power_w: cleanCell(fields.power_w),
      max_spl_db: cleanCell(fields.max_spl_db),
      price: cleanCell(fields.price),
    });
  }
  return { rows, brandOnly };
}