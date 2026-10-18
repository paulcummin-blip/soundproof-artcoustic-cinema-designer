// speakerLibraryDisplay.js
// ---------------------------------------------------------------------------
// Presentation of one library row for the Speaker Comparison Library table.
//
// Every cell says where its value came from and never fills a gap:
//   • a canonical specification is shown through the SAME wording the existing
//     readiness authority produces, so the table cannot disagree with the grade
//     the dealer sees on the RP22 comparison page;
//   • a legacy comparison record is shown from its own stored values;
//   • a figure the manufacturer never published stays blank, and an estimate that
//     the engine can derive is labelled as an estimate rather than as a
//     manufacturer maximum.
// ---------------------------------------------------------------------------

import {
  evidenceText,
  powerBasisText,
  sensitivityText,
  READINESS_LEVELS,
} from "@/components/admin/speaker-db/comparisonReadiness";
import { formatRetailPrice } from "@/components/spl/CompetitorPriceManager";

const DASH = "—";
const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

const LEGACY_LABELS = {
  A: READINESS_LEVELS.A,
  B: READINESS_LEVELS.B,
  C: READINESS_LEVELS.C,
  D: READINESS_LEVELS.INSUFFICIENT,
};

const numberText = (value, unit) => (hasValue(value) ? `${value}${unit}` : DASH);

/** Sensitivity as published, with the basis it was quoted on. */
export function sensitivityCell(row) {
  if (row.specification) return sensitivityText(row.specification);
  const value = row.record?.sensitivity_value_db;
  if (!hasValue(value)) return DASH;
  const basis = hasValue(row.record?.sensitivity_reference) ? row.record.sensitivity_reference : "basis not stated";
  return `${value} dB · ${basis}`;
}

/** Power handling, or the manufacturer's amplifier recommendation. */
export function powerCell(row) {
  if (row.specification) return powerBasisText(row.specification);
  const record = row.record || {};
  if (hasValue(record.continuous_power_w)) {
    return `${record.continuous_power_w} W · ${record.power_rating_type || "continuous"}`;
  }
  if (hasValue(record.recommended_amp_max_w)) {
    return `${record.recommended_amp_max_w} W · recommended amplifier max`;
  }
  return "No power or max SPL";
}

/**
 * The manufacturer's own maximum continuous SPL, if one is published.
 * When none is published but the engine can calculate a conditional estimate,
 * that is stated as an estimate — never shown as a manufacturer figure.
 */
export function maxSplCell(row) {
  const published = row.specification
    ? row.specification.max_continuous_spl_db
    : row.record?.published_max_continuous_spl_db_1m;
  if (hasValue(published)) return { text: numberText(published, " dB"), note: "" };
  const estimatePossible = row.readiness
    ? row.readiness.eligible === true
    : hasValue(row.record?.calculated_max_continuous_spl_db_1m);
  return { text: DASH, note: estimatePossible ? "Estimate only" : "" };
}

/** Evidence type: the class of the data behind the comparison, plus its words. */
export function evidenceCell(row) {
  if (row.readiness) {
    const { level } = row.readiness;
    return { label: level.label, text: evidenceText(row.readiness), tone: level.tone };
  }
  const stored = String(row.record?.data_confidence || "").toUpperCase();
  const level = LEGACY_LABELS[stored] || null;
  if (!level) {
    return { label: "No canonical record", text: hasValue(row.record?.spl_authority) ? row.record.spl_authority : "Not in the database", tone: "#625143" };
  }
  return { label: level.label, text: `${stored} · ${row.record?.spl_authority || "published record"}`, tone: level.tone };
}

/** Whether the designer can already see this speaker in the comparison. */
export function statusText(row) {
  if (row.inComparison) return "In the comparison";
  return row.readiness?.eligible === true ? "Ready to compare" : "Not enough data yet";
}

export function priceText(row) {
  return formatRetailPrice(row.price);
}

/** What the comparison will actually use as the power authority for this model. */
export function powerAuthorityText(row) {
  if (!row.specification) return "";
  return row.readiness?.powerAuthorityW
    ? `${row.readiness.powerAuthorityW} W · ${row.readiness.powerAuthority || "stated authority"}`
    : "";
}