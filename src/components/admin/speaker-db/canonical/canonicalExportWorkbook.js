// canonicalExportWorkbook.js
// ---------------------------------------------------------------------------
// Builds the editable, re-importable Speaker Database workbook.
//
// One row per product, carrying its current specification. Every value written
// is a stored canonical value — nothing is rounded, recalculated or derived, so
// exporting and importing an untouched workbook produces no changes at all.
//
// State Sound Proof owns — approval, publication, history depth — is kept out of
// the editable columns and appears on the read-only Reference sheet, where it
// cannot be mistaken for something the admin should edit. The Reference sheet
// states stored state only: it computes nothing, so the workbook can never
// disagree with the database it came from.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import {
  CANONICAL_SCHEMA_VERSION,
  CLEAR_TOKEN,
  COLUMNS,
  CHANGE_LOG_TYPES,
  SHEET_NAMES,
} from "./canonicalSchema.js";
import { loadSheetJs } from "./loadSheetJs.js";

function asArray(value) {
  return Array.isArray(value) ? value : value?.items || [];
}

export async function loadCanonicalData() {
  const [manufacturers, products, specifications] = await Promise.all([
    base44.entities.SpeakerManufacturer.list("-name", 1000),
    base44.entities.SpeakerProduct.list("-model", 1000),
    base44.entities.SpeakerSpecification.list("-created_date", 2000),
  ]);
  return {
    manufacturers: asArray(manufacturers),
    products: asArray(products),
    specifications: asArray(specifications),
  };
}

function currentSpecificationFor(product, specs) {
  if (product.current_specification_id) {
    const pointed = specs.find((spec) => spec.id === product.current_specification_id);
    if (pointed) return pointed;
  }
  return specs.find((spec) => spec.is_current === true)
    || specs.find((spec) => spec.product_id === product.id)
    || null;
}

function isoDate(value) {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}T/.test(text) ? text.slice(0, 10) : text;
}

function publicationStatus(spec) {
  if (spec?.rp22_published_competitor_id) {
    return `Published to RP22${spec.rp22_published_at ? ` (${isoDate(spec.rp22_published_at)})` : ""}`;
  }
  return "Not published";
}

/** The value written into one workbook cell. Blank means "not set", never "clear". */
function cellFor(column, { manufacturer, product, spec }) {
  const blank = "";

  switch (column.key) {
    case "manufacturer_id": return manufacturer?.id || blank;
    case "product_id": return product.id || blank;
    case "specification_id": return spec?.id || blank;
    case "is_current_specification": return spec ? (spec.is_current === true ? "TRUE" : "FALSE") : blank;
    case "approval_status": return spec?.approval_status || blank;
    case "publication_status": return publicationStatus(spec);
    case "retail_price":
    case "currency":
      return blank;
    default:
      break;
  }

  const target = column.target === "manufacturer" ? manufacturer : column.target === "product" ? product : spec;
  const raw = target?.[column.field];
  if (raw === null || raw === undefined || raw === "") return blank;
  if (column.type === "number") {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : String(raw);
  }
  if (column.type === "date") return isoDate(raw);
  return String(raw);
}

function sortedProducts(products) {
  return [...products].sort((a, b) => {
    const byManufacturer = String(a.manufacturer_name || "").localeCompare(String(b.manufacturer_name || ""));
    if (byManufacturer !== 0) return byManufacturer;
    return String(a.model || "").localeCompare(String(b.model || ""));
  });
}

const INSTRUCTIONS_NOTE_ROWS = [
  ["Sound Proof — Speaker Database export / import", ""],
  ["Schema version", CANONICAL_SCHEMA_VERSION],
  ["Covers", "SpeakerManufacturer → SpeakerProduct → SpeakerSpecification (the canonical database)"],
  ["", ""],
  ["HOW THIS WORKBOOK IS EDITED", ""],
  ["Blank cell", "LEAVE THE EXISTING VALUE UNCHANGED. This is the default and it is safe: an untouched workbook imports as zero changes."],
  [CLEAR_TOKEN, "Type this exactly, in capitals, to deliberately remove a value. It is the ONLY way a cell ever clears stored data."],
  ["New rows", "Leave manufacturer_id, product_id and specification_id blank to add a new manufacturer, product or specification."],
  ["Stable IDs", "Never edit manufacturer_id, product_id or specification_id. They are how an existing record is found, exactly."],
  ["A row with product_id", "Updates that exact product. An unknown ID is an error — it is never turned into a name match."],
  ["A row without product_id", "Is matched on manufacturer + model, and the import preview says so, because it is a name match."],
  ["", ""],
  ["HOW SOUND PROOF HANDLES AN IMPORT", ""],
  ["Nothing is written", "until you press Apply import, after a full field-level preview of every change."],
  ["Import never publishes", "to the RP22 Speaker Comparison. CompetitorSpeaker is a downstream representation, not this database."],
  ["New or changed data", "arrives as Awaiting Review. Unchanged approved specifications stay Approved."],
  ["Changing a specification", "creates a new version; the approved version is kept and marked Superseded. Approved history is never overwritten."],
  ["Approval and publication", "columns are read-only: Sound Proof manages them, and the import ignores them."],
  ["Every applied batch", "is recorded and can be rolled back. Rollback refuses any record published or edited since the import."],
  ["Retail price", "is read-only here — pricing is maintained in the Product Master / Price List."],
  ["Derived calculations", "are never editable. They are shown on the Reference (read-only) sheet for information only."],
  ["Change Log sheet", "is for your notes (ADD, UPDATE, REVIEW, SOURCE IMPROVED). Sound Proof still calculates its own diff on import."],
];

export function buildCanonicalSheets(data) {
  const products = sortedProducts(asArray(data.products));
  const specifications = asArray(data.specifications);
  const manufacturerById = new Map(asArray(data.manufacturers).map((record) => [record.id, record]));

  const rowsForProducts = products.map((product) => {
    const spec = currentSpecificationFor(product, specifications.filter((item) => item.product_id === product.id));
    const manufacturer = manufacturerById.get(product.manufacturer_id) || null;
    return { product, spec, manufacturer };
  });

  const dataRows = [
    COLUMNS.map((column) => column.key),
    ...rowsForProducts.map((context) => COLUMNS.map((column) => cellFor(column, context))),
  ];

  const fieldRows = [
    ["Column", "Group", "Type", "Editing", "Meaning"],
    ...COLUMNS.map((column) => [
      column.key,
      column.group,
      column.type === "select" && column.options ? `select: ${column.options.join(" | ")}` : column.type,
      column.editable ? "Editable" : "Read-only (ignored by import)",
      column.note,
    ]),
    ["", "", "", "", ""],
    [CLEAR_TOKEN, "—", "token", "Editable", "In any editable cell: removes the stored value. A blank cell never removes anything."],
    [SHEET_NAMES.reference, "—", "sheet", "Read-only", "Derived Sound Proof values and RP22 publication state. Exported for information; never read back by the import."],
    [SHEET_NAMES.changeLog, "—", "sheet", "Notes", `Free-text notes: ${CHANGE_LOG_TYPES.join(", ")}. Notes are shown in the preview and never write data.`],
  ];

  const changeLogRows = [
    ["manufacturer_id", "product_id", "model", "change_type", "note"],
    ...rowsForProducts.map((context) => [
      context.manufacturer?.id || "",
      context.product.id || "",
      context.product.model || "",
      "",
      "",
    ]),
  ];

  const historyCountByProduct = new Map();
  for (const spec of specifications) {
    historyCountByProduct.set(spec.product_id, (historyCountByProduct.get(spec.product_id) || 0) + 1);
  }

  const referenceRows = [
    ["manufacturer_id", "product_id", "model", "specification_id", "is_current_specification", "approval_status", "published_to_rp22", "published_at", "comparison_row_id", "specification_versions_held", "secondary_evidence_url"],
    ...rowsForProducts.map((context) => [
      context.manufacturer?.id || "",
      context.product.id || "",
      context.product.model || "",
      context.spec?.id || "",
      context.spec ? (context.spec.is_current === true ? "TRUE" : "FALSE") : "",
      context.spec?.approval_status || "",
      context.spec?.rp22_published_competitor_id ? "Yes" : "No",
      context.spec?.rp22_published_at ? isoDate(context.spec.rp22_published_at) : "",
      context.spec?.rp22_published_competitor_id || "",
      historyCountByProduct.get(context.product.id) || 0,
      context.spec?.secondary_evidence?.url || "",
    ]),
  ];

  const width = (count, wide) => Array.from({ length: count }, (_, index) => ({ wch: index === 0 ? 26 : wide }));

  return [
    { name: SHEET_NAMES.data, rows: dataRows, cols: width(COLUMNS.length, 20) },
    { name: SHEET_NAMES.instructions, rows: INSTRUCTIONS_NOTE_ROWS, cols: [{ wch: 30 }, { wch: 120 }] },
    { name: SHEET_NAMES.fields, rows: fieldRows, cols: [{ wch: 30 }, { wch: 14 }, { wch: 30 }, { wch: 26 }, { wch: 80 }] },
    { name: SHEET_NAMES.changeLog, rows: changeLogRows, cols: [{ wch: 38 }, { wch: 38 }, { wch: 22 }, { wch: 18 }, { wch: 60 }] },
    { name: SHEET_NAMES.reference, rows: referenceRows, cols: width(11, 24) },
  ];
}

export async function downloadCanonicalWorkbook() {
  const XLSX = await loadSheetJs();
  const data = await loadCanonicalData();
  const sheets = buildCanonicalSheets(data);

  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    worksheet["!cols"] = sheet.cols;
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `sound-proof-speaker-database-${stamp}.xlsx`;
  XLSX.writeFile(workbook, fileName);

  return {
    fileName,
    products: data.products.length,
    manufacturers: data.manufacturers.length,
    specifications: data.specifications.length,
  };
}