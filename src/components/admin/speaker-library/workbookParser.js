// workbookParser.js
// ---------------------------------------------------------------------------
// Reads an .xlsx/.xls/.csv workbook directly (SheetJS) and extracts real
// product rows from the grouped, irregular layout the RP22 comparison
// workbook uses.
//
// The real workbook is NOT one rectangular table. It is several blocks with
// different column layouts, separated by blank rows:
//
//   Block A — columns A:C  (Manufacturer, Product, Source URL); price in D
//             where present. Several brand groups (M&K, Ascendo, Monitor
//             Audio, Sonance, James Loudspeaker, Wisdom Audio, Triad,
//             Bowers & Wilkins …). A brand label starts a group and is then
//             left blank for following products, which carry the brand down.
//   Block B — columns E:I  (Model, Sensitivity, Max SPL at 1m, Recommended
//             amplifier power, UK price each). The KEF table. Manufacturer
//             is implicit ("KEF") and is read from a lone brand-label row
//             above the E:I header (or a cell beside it).
//   Brand-only rows — column A holds a manufacturer with no product. These
//             are collected as manufacturer names only; no fake product is
//             ever created.
//
// Parsing rules:
//   - The first header row is never treated as a speaker.
//   - A header row is detected by recognised field labels (manufacturer/model
//     or the KEF E:I labels). A header switches the active column layout.
//   - The manufacturer is carried DOWN within a brand group, but is reset on a
//     blank separator row so it never bleeds across blocks.
//   - When the active layout is the KEF E:I block and a row re-appears with a
//     manufacturer in column A, the parser switches back to the A:C layout —
//     so A:C blocks that do not repeat their header still parse correctly.
//   - Prose/note rows in the KEF column E are skipped.
//   - Non-breaking spaces are converted to normal spaces, repeated spaces are
//     collapsed, and surrounding spaces are trimmed. Punctuation in model
//     names is preserved.
//
// This parses the actual worksheet cells — it does not round-trip through an
// LLM extractor, which previously dropped every row and turned the header
// into a single "Brand / Product" speaker.
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
  recommendedamplifierpower: "power_w", recommendedpower: "power_w",
  recommendedamp: "power_w", recamplifierpower: "power_w", recpower: "power_w",
  maxspl: "max_spl_db", max_spl: "max_spl_db", maxspldb: "max_spl_db",
  maxsplat1m: "max_spl_db", maxspl1m: "max_spl_db", maxsplat: "max_spl_db",
  spl: "max_spl_db", maxlevel: "max_spl_db",
  price: "price", retailprice: "price", priceincvat: "price",
  retailincvat: "price", ukretail: "price", ukpriceeach: "price",
  ukprice: "price", priceeach: "price", retail: "price", cost: "price", gbp: "price",
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

// Default A:C layout (manufacturer, product, source, price) used before the
// first header and when an A:C block does not repeat its header.
const DEFAULT_AC_MAP = {
  manufacturer: 0, model: 1, source_url: 2, price: 3,
  sensitivity_db: undefined, sensitivity_reference: undefined,
  impedance_ohm: undefined, power_w: undefined, max_spl_db: undefined,
};

function readByMap(cells, map) {
  const out = {};
  for (const [field, idx] of Object.entries(map)) {
    out[field] = idx === undefined ? "" : cleanCell(cells[idx] ?? "");
  }
  return out;
}

// Find the manufacturer for an E:I ("KEF") block, which has no manufacturer
// column of its own. The brand is read from a lone brand-label row above the
// header, or from a cell sitting beside the header in columns A-D.
function findBlockBrand(headerCells, prevRows) {
  // 1. A brand sitting in columns A-D of the header row itself.
  const aToD = [0, 1, 2, 3]
    .map((i) => cleanCell(headerCells[i] ?? ""))
    .filter((v) => v && !normaliseLabel(v) && !/^https?:\/\//i.test(v));
  if (aToD.length === 1) return aToD[0];
  // 2. A previous row that is a lone brand label (exactly one non-empty cell).
  for (const prev of prevRows.slice(-3).reverse()) {
    const vals = (Array.isArray(prev) ? prev : []).map(cleanCell).filter((v) => v);
    if (vals.length === 1 && !normaliseLabel(vals[0]) && !/^https?:\/\//i.test(vals[0])) return vals[0];
  }
  return "";
}

// A non-model, prose-like value in the KEF column E (a note row) is skipped.
function looksLikeProse(value) {
  if (!value) return false;
  if (value.length > 60) return true;
  if (/[.;]\s|[.;]$/.test(value)) return true;
  return false;
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
  let mode = "AC"; // "AC" (A:C + D price) or "KEF" (E:I)
  let acColumnMap = DEFAULT_AC_MAP;
  let kefColumnMap = null;
  let lastManufacturer = "";
  let blockManufacturer = "";
  const prevRows = []; // recent raw rows, for KEF block-brand lookup

  for (const rawRow of matrix) {
    const cells = (Array.isArray(rawRow) ? rawRow : []).map(cleanCell);
    prevRows.push(rawRow);
    if (prevRows.length > 6) prevRows.shift();

    if (cells.every((c) => c === "")) {
      // Blank / separator row: reset the carried manufacturer so a brand never
      // bleeds across a clearly separated block.
      lastManufacturer = "";
      continue;
    }

    if (isHeaderRow(cells)) {
      const map = buildColumnMap(cells);
      const modelIdx = map.model;
      if (modelIdx !== undefined && modelIdx >= 4 && map.manufacturer === undefined) {
        // KEF-style E:I block: manufacturer is implicit.
        mode = "KEF";
        kefColumnMap = map;
        blockManufacturer = findBlockBrand(cells, prevRows.slice(0, -1));
        lastManufacturer = blockManufacturer;
        // The lone brand-label row above this header was just collected as a
        // brand-only entry; it is this block's manufacturer, not a brand with
        // no products, so remove it.
        if (blockManufacturer && brandOnly.length && brandOnly[brandOnly.length - 1] === blockManufacturer) {
          brandOnly.pop();
        }
      } else {
        // A:C block. Persist the column map so a later A:C block that does not
        // repeat its header still parses with the correct columns.
        mode = "AC";
        acColumnMap = {
          manufacturer: map.manufacturer ?? 0,
          model: map.model ?? 1,
          source_url: map.source_url ?? 2,
          price: map.price ?? 3,
          sensitivity_db: map.sensitivity_db,
          sensitivity_reference: map.sensitivity_reference,
          impedance_ohm: map.impedance_ohm,
          power_w: map.power_w,
          max_spl_db: map.max_spl_db,
        };
        if (map.manufacturer === undefined) lastManufacturer = "";
      }
      continue; // never treat a header as a speaker
    }

    // Auto-switch back to the A:C layout when a row re-appears with a
    // manufacturer in column A — KEF rows never have column A populated, so a
    // non-empty A marks the start of an A:C block even without a header.
    if (mode === "KEF" && cleanCell(cells[0]) !== "") {
      mode = "AC";
      lastManufacturer = "";
    }

    const columnMap = mode === "KEF" ? kefColumnMap : acColumnMap;
    const fields = readByMap(cells, columnMap || DEFAULT_AC_MAP);
    const model = cleanCell(fields.model);
    let manufacturer = cleanCell(fields.manufacturer);

    if (mode === "KEF") {
      manufacturer = blockManufacturer || manufacturer;
      if (!model || looksLikeProse(model)) continue; // note/prose row in E
    } else {
      if (manufacturer) lastManufacturer = manufacturer;
      else manufacturer = lastManufacturer; // blank cell continues the brand above
    }

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