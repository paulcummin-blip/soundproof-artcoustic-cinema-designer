// candidateReview.js
// ---------------------------------------------------------------------------
// Review-side view of a discovered candidate model.
//
// The readiness preview is produced by the SAME comparisonReadiness authority
// the Speaker Database → Products list uses (which itself runs the same mapping
// and normalisation as RP22 Speaker Capability), so a candidate's previewed
// A/B/C/D class is exactly the class the model will carry once it is added.
// Nothing here estimates a value: a field the official source does not state is
// reported as missing.
// ---------------------------------------------------------------------------

import { comparisonReadiness } from "./comparisonReadiness.js";

export const ROLE_LABELS = {
  LCR: "LCR",
  Surround: "Surround",
  Wide: "Wide",
  Height: "Height",
  Flexible: "Flexible",
  Both: "Both",
  Unknown: "Unknown",
};

/** Normalised key for duplicate detection (MP-150 / MP150 / mp 150 are one model). */
export function modelKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function candidateSpecification(candidate) {
  return { ...(candidate?.specification || {}) };
}

function identity(candidate, manufacturerName) {
  return {
    manufacturer_name: manufacturerName,
    model: candidate?.model || "",
    category: candidate?.product_category || "Other",
    official_product_url: candidate?.product_url || "",
    official_pdf_url: candidate?.datasheet_url || "",
  };
}

/** A/B/C/D standing of the candidate, measured against the RP22 comparison fields. */
export function candidateReadiness(candidate, manufacturerName) {
  return comparisonReadiness({
    product: identity(candidate, manufacturerName),
    specification: candidateSpecification(candidate),
  });
}

/** Compact badge wording for the candidate list. */
export function candidateBadgeLabel(readiness) {
  if (!readiness) return "—";
  if (readiness.confidence === "A") return "Comparable";
  if (readiness.confidence === "B") return "Calculated";
  if (readiness.confidence === "C") return "ADI estimate";
  return "Insufficient";
}

const show = (value, suffix = "") =>
  value === null || value === undefined || String(value).trim() === "" ? "—" : `${value}${suffix}`;

/** Published values as extracted — the columns the admin reviews before adding. */
export function candidateExtractRows(candidate) {
  const spec = candidateSpecification(candidate);
  const basis = spec.sensitivity_basis && spec.sensitivity_basis !== "unknown" ? ` @ ${spec.sensitivity_basis}` : "";
  const power = [
    spec.power_handling_continuous_w ? `${spec.power_handling_continuous_w} W continuous` : null,
    spec.aes_power_w ? `${spec.aes_power_w} W AES` : null,
    spec.recommended_amp_max_w ? `amp max ${spec.recommended_amp_max_w} W` : null,
  ].filter(Boolean).join(" · ");
  const response = spec.frequency_response_low_hz || spec.frequency_response_high_hz
    ? `${show(spec.frequency_response_low_hz)}–${show(spec.frequency_response_high_hz)} Hz${spec.frequency_response_tolerance ? ` (${spec.frequency_response_tolerance})` : ""}`
    : "—";

  const dispersion = [
    spec.horizontal_dispersion_deg ? `H ${spec.horizontal_dispersion_deg}°` : null,
    spec.vertical_dispersion_deg ? `V ${spec.vertical_dispersion_deg}°` : null,
  ].filter(Boolean).join(" · ") || "—";

  return {
    sensitivity: `${show(spec.sensitivity_db, " dB")}${spec.sensitivity_db ? basis : ""}`,
    impedance: show(spec.nominal_impedance_ohm, " Ω"),
    power: power || "—",
    maxSpl: show(spec.max_continuous_spl_db, " dB"),
    response,
    dispersion,
    sourceDate: show(spec.source_date),
    space: show(spec.measurement_space),
  };
}

/** The reported specification as merge entries, so nothing unsupported is written. */
export function candidateExtractionPayload(candidate, today) {
  const spec = candidateSpecification(candidate);
  const reported = Object.keys(spec)
    .filter((field) => spec[field] !== null && spec[field] !== undefined && String(spec[field]).trim() !== "")
    .map((field) => ({ field, value: spec[field] }));

  return {
    reported,
    source_type: candidate?.spec_source_type === "Official PDF" ? "Official PDF" : "Official Product Page",
    source_url: candidate?.document_url || candidate?.datasheet_url || candidate?.product_url || "",
    source_date: today,
  };
}

// --- Source indicator -------------------------------------------------------
// What discovery actually read for this model. A blank column must never be
// mistaken for a search that never happened: the review row says which official
// source was found — the product page, or the product sheet / datasheet /
// manual / installation guide behind it.
const DOCUMENT_LABELS = {
  "Product page": "Product page",
  "Product sheet": "Product sheet",
  Datasheet: "Datasheet",
  Manual: "Manual",
  "Installation guide": "Installation guide",
  Brochure: "Brochure",
  "Other document": "Document",
};

export function candidateSourceIndicator(candidate) {
  const documentUrl = candidate?.document_url || "";
  const documents = Array.isArray(candidate?.official_documents) ? candidate.official_documents : [];
  const firstDocument = documents[0] || null;
  const type = candidate?.document_type || (documentUrl ? "Other document" : "Product page");
  return {
    label: DOCUMENT_LABELS[type] || "Product page",
    documentUrl,
    documentLabel: DOCUMENT_LABELS[firstDocument?.document_type] || "Document",
    linkedDocumentUrl: !documentUrl && firstDocument ? firstDocument.url : "",
    hasDocument: Boolean(documentUrl) || documents.length > 0,
    documentCount: documents.length,
  };
}

/** Why a model is still ungradeable — what the search found, and nothing invented. */
export function candidateGapMessage(readiness, candidate) {
  if (!readiness || readiness.confidence !== "D") return "";
  return candidateSourceIndicator(candidate).hasDocument
    ? "Official source found, but critical engineering data not found"
    : "No official specification document found";
}