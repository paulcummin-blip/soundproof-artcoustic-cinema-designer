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
import {
  CONFIDENCE_LABELS,
  SOURCE_TYPE_LABELS,
  hostOfUrl,
  trustedSecondarySource,
} from "@/components/utils/spl/trustedSecondarySources.js";

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
export function candidateBadgeLabel(readiness, sourceType = null) {
  if (!readiness) return "—";
  if (readiness.confidence === "A") return "Comparable";
  if (readiness.confidence === "B") return "Calculated";
  if (readiness.confidence === "C") return sourceType?.trusted ? "Trusted secondary" : "ADI estimate";
  return "Insufficient";
}

/** The A/B/C/D wording the review list shows for a candidate. */
export function candidateConfidenceLabel(readiness) {
  if (!readiness || readiness.confidence === "D") return CONFIDENCE_LABELS.D;
  if (readiness.confidence === "A") return CONFIDENCE_LABELS.A;
  if (readiness.confidence === "B") return CONFIDENCE_LABELS.B;
  return CONFIDENCE_LABELS.C;
}

/**
 * The ADI assumption this candidate carries, in full, or "" when its published
 * values stand on their own. A manufacturer that publishes an "in room" response
 * and never states the measurement space is normalised on Sound Proof's standard
 * installed / half-space convention — stated as an assumption at confidence C,
 * never presented as a confirmed published basis.
 */
export function candidateAssumptionNote(readiness) {
  return readiness?.spaceAssumption?.applied ? readiness.spaceAssumption.note : "";
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

// --- Source type and trusted secondary proposals -----------------------------
// Where a candidate's values came from, said plainly: official manufacturer,
// official document, trusted secondary distributor, admin-approved secondary or
// insufficient.
export function candidateSourceType(candidate) {
  const trusted = candidate?.trusted_secondary;
  const trustedUrl = trusted?.url || "";
  if (trustedUrl || trusted?.host) {
    const source = trustedSecondarySource(trustedUrl) || trustedSecondarySource(trusted?.host);
    return {
      key: "TRUSTED_SECONDARY",
      label: SOURCE_TYPE_LABELS.TRUSTED_SECONDARY,
      host: source?.host || hostOfUrl(trustedUrl || trusted?.host),
      sourceName: source?.name || trusted?.source_name || "",
      url: trustedUrl,
      trusted: true,
    };
  }
  const documentUrl = candidate?.document_url || "";
  if (documentUrl) {
    return { key: "OFFICIAL_DOCUMENT", label: SOURCE_TYPE_LABELS.OFFICIAL_DOCUMENT, host: hostOfUrl(documentUrl), sourceName: "", url: documentUrl, trusted: false };
  }
  const productUrl = candidate?.product_url || "";
  if (productUrl) {
    return { key: "OFFICIAL_PAGE", label: SOURCE_TYPE_LABELS.OFFICIAL_PAGE, host: hostOfUrl(productUrl), sourceName: "", url: productUrl, trusted: false };
  }
  return { key: "INSUFFICIENT", label: SOURCE_TYPE_LABELS.INSUFFICIENT, host: "", sourceName: "", url: "", trusted: false };
}

const TRUSTED_FIELD_LABELS = {
  sensitivity_db: "Sensitivity", sensitivity_basis: "Basis",
  nominal_impedance_ohm: "Nominal impedance", minimum_impedance_ohm: "Minimum impedance",
  recommended_amp_min_w: "Amp min", recommended_amp_max_w: "Amp max",
  power_handling_continuous_w: "Continuous power", aes_power_w: "AES power",
  max_continuous_spl_db: "Max SPL", max_spl_basis: "Max SPL basis",
  frequency_response_low_hz: "LF", frequency_response_high_hz: "HF",
  frequency_response_tolerance: "Tolerance", measurement_space: "Measurement space",
  horizontal_dispersion_deg: "H dispersion", vertical_dispersion_deg: "V dispersion",
};

/**
 * The trusted-secondary values discovery proposed for a model whose official
 * sources carried no engineering data. Nothing here is stored: the admin opens
 * the document, reads the sentences and accepts it explicitly.
 */
export function candidateTrustedProposal(candidate) {
  const trusted = candidate?.trusted_secondary;
  if (!trusted || !trusted.url) return null;
  const source = trustedSecondarySource(trusted.url) || trustedSecondarySource(trusted.host);
  return {
    sourceName: source?.name || trusted.source_name || "",
    host: source?.host || hostOfUrl(trusted.host || trusted.url),
    url: trusted.url,
    documentType: trusted.document_type || "",
    sourceQuote: trusted.source_quote || "",
    specification: trusted.specification || {},
  };
}

/** "Sensitivity 93 dB · Nominal impedance 8 Ω · Amp max 1000 W" for the proposal. */
export function trustedProposalSummary(proposal) {
  if (!proposal) return "";
  return Object.entries(proposal.specification || {})
    .filter(([field, value]) => TRUSTED_FIELD_LABELS[field] && value !== null && value !== undefined && String(value).trim() !== "")
    .map(([field, value]) => `${TRUSTED_FIELD_LABELS[field]} ${value}`)
    .join(" · ");
}

// --- Per-value source sentences ---------------------------------------------
// Discovery stores the exact sentence each value was read from. They travel with
// the record so a reviewer can always trace a figure back to the manufacturer's
// own words, months after the page was read.
const SNIPPET_FIELD_LABELS = {
  sensitivity_db: "Sensitivity",
  sensitivity_basis: "Sensitivity basis",
  nominal_impedance_ohm: "Nominal impedance",
  minimum_impedance_ohm: "Minimum impedance",
  recommended_amp_min_w: "Recommended amplifier minimum",
  recommended_amp_max_w: "Recommended amplifier maximum",
  frequency_response_low_hz: "Frequency response (low)",
  frequency_response_high_hz: "Frequency response (high)",
  measurement_space: "Measurement space",
  horizontal_dispersion_deg: "Horizontal dispersion",
  vertical_dispersion_deg: "Vertical dispersion",
  height_mm: "Height",
  width_mm: "Width",
  depth_mm: "Depth",
  weight_kg: "Weight",
  woofer_count: "Low frequency drivers",
  woofer_size: "Driver size",
  cabinet_type: "Enclosure",
  tweeter_description: "High frequency driver",
};

/** The stored source sentences, one row per field, in field-label form. */
export function candidateSnippetRows(candidate) {
  const snippets = candidate?.source_snippets || {};
  return Object.entries(snippets).map(([field, quote]) => ({
    field,
    label: SNIPPET_FIELD_LABELS[field] || field,
    quote: String(quote || ""),
  }));
}

/**
 * The source sentences as the note stored against the product's source record —
 * the evidence trail for every value that was written.
 */
export function candidateSourceNote(candidate) {
  const rows = candidateSnippetRows(candidate).filter((row) => row.quote);
  if (rows.length === 0) return "";
  return [
    `Per-value source sentences read from ${candidate?.product_url || "the official manufacturer page"}:`,
    ...rows.map((row) => `${row.label}: “${row.quote}”`),
  ].join("\n");
}