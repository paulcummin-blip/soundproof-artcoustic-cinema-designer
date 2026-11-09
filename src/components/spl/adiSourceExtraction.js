// adiSourceExtraction.js
// ---------------------------------------------------------------------------
// Shared, pure helpers for reading a manufacturer source with ADI and turning
// the extraction into a per-field proposal. Used by both the single-row
// ReadWithAdiDialog and the batch Read all incomplete queue, so the two paths
// can never drift apart in how they decode an extraction or default decisions.
//
// The actual source read is the existing extractModelSpecification backend
// function (admin-only, reads the page or PDF verbatim, no general knowledge).
// Nothing here re-implements that read.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";
import {
  formFromRow,
  SENSITIVITY_REFERENCES,
  MEASUREMENT_SPACES,
  SPL_BASES,
} from "@/components/admin/speaker-library/saveSpeakerComparison";

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== "";

/** The source URL a comparison candidate carries, preferring source_url then datasheet_url. */
export const sourceUrlOf = (candidate) =>
  candidate?.record?.source_url
  || candidate?.sourceUrl
  || candidate?.record?.datasheet_url
  || candidate?.datasheetUrl
  || "";

// Same minimal row shape the Edit form expects, built from a comparison
// candidate. Kept here so the single-row and batch paths build it identically.
export function candidateToFormRow(candidate) {
  return {
    key: candidate?.id,
    rowId: candidate?.priceRecordId || null,
    productId: candidate?.productId || null,
    specificationId: candidate?.specificationId || null,
    manufacturer: candidate?.manufacturer || "",
    model: candidate?.model || "",
    price: candidate?.record?.retail_price_inc_vat ?? null,
    record: candidate?.record || null,
    specification: null,
    product: null,
  };
}

const SPEC_TO_FORM = {
  sensitivity_db: "sensitivity_db",
  sensitivity_basis: "sensitivity_reference",
  nominal_impedance_ohm: "impedance_ohm",
  max_continuous_spl_db: "max_spl_db",
  max_spl_basis: "max_spl_basis",
  measurement_space: "measurement_space",
};

function mapMaxSplBasis(v) {
  const s = String(v || "").toLowerCase();
  if (["aes", "iec", "continuous", "peak"].includes(s)) return "continuous";
  if (s === "calculated") return "calculated";
  return "manufacturer unspecified";
}

function mapMeasurementSpace(v) {
  const s = String(v || "").toLowerCase();
  if (s === "free-space" || s === "half-space") return s;
  return "unspecified";
}

function labelOf(optionList, value) {
  const found = optionList.find((o) => o.value === value);
  return found ? found.label : (hasValue(value) ? String(value) : "—");
}

export const FIELD_LABEL = {
  sensitivity_db: "Sensitivity (dB)",
  sensitivity_reference: "Sensitivity reference",
  impedance_ohm: "Nominal impedance (Ω)",
  power_w: "Power (W)",
  max_spl_db: "Max continuous SPL (dB)",
  max_spl_basis: "Max SPL basis",
  measurement_space: "Measurement space",
};

export const PROPOSAL_FIELDS = [
  "sensitivity_db",
  "sensitivity_reference",
  "impedance_ohm",
  "power_w",
  "max_spl_db",
  "max_spl_basis",
  "measurement_space",
];

/**
 * Turn the extraction result into a map of formKey → { value, status, quote, basis }.
 * Power is resolved from power_handling_continuous_w (preferred) or
 * recommended_amp_max_w, with its basis remembered.
 */
export function extractionToFound(raw) {
  const byField = {};
  for (const item of [...(raw?.reported || []), ...(raw?.ambiguous || [])]) {
    if (!item || !item.field) continue;
    byField[item.field] = {
      value: item.value,
      status: item.status,
      quote: String(item.raw_text || "").trim(),
    };
  }
  const found = {};
  const info = {};
  for (const [specKey, formKey] of Object.entries(SPEC_TO_FORM)) {
    if (!byField[specKey]) continue;
    let val = byField[specKey].value;
    if (formKey === "max_spl_basis") val = mapMaxSplBasis(val);
    if (formKey === "measurement_space") val = mapMeasurementSpace(val);
    found[formKey] = val;
    info[formKey] = {
      value: val,
      rawValue: byField[specKey].value,
      status: byField[specKey].status,
      quote: byField[specKey].quote,
    };
  }
  if (byField.power_handling_continuous_w) {
    found.power_w = byField.power_handling_continuous_w.value;
    found.power_basis = "continuous";
    info.power_w = {
      value: byField.power_handling_continuous_w.value,
      rawValue: byField.power_handling_continuous_w.value,
      status: byField.power_handling_continuous_w.status,
      quote: byField.power_handling_continuous_w.quote,
      basis: "continuous",
    };
  } else if (byField.recommended_amp_max_w) {
    found.power_w = byField.recommended_amp_max_w.value;
    found.power_basis = "amplifier";
    info.power_w = {
      value: byField.recommended_amp_max_w.value,
      rawValue: byField.recommended_amp_max_w.value,
      status: byField.recommended_amp_max_w.status,
      quote: byField.recommended_amp_max_w.quote,
      basis: "amplifier",
    };
  }
  return { found, info };
}

export function displayValue(formKey, value) {
  if (!hasValue(value)) return "—";
  if (formKey === "sensitivity_reference") return labelOf(SENSITIVITY_REFERENCES, value);
  if (formKey === "measurement_space") return labelOf(MEASUREMENT_SPACES, value);
  if (formKey === "max_spl_basis") return labelOf(SPL_BASES, value);
  if (formKey === "power_w") return `${value}`;
  return String(value);
}

/** Build the current form values for a candidate (prefilled from its record). */
export function currentFormFor(candidate) {
  return candidate ? formFromRow(candidateToFormRow(candidate)) : {};
}

/**
 * Default decisions: accept a reported value only when the current field is
 * blank (a new field). Never default-accept ambiguous evidence and never
 * default-overwrite an existing value.
 */
export function decideDefaults(currentForm, info) {
  const initial = {};
  for (const key of PROPOSAL_FIELDS) {
    const f = info[key];
    if (!f) continue;
    initial[key] = !hasValue(currentForm[key]) && f.status === "reported";
  }
  return initial;
}

/** Whether a proposal field is a conflicting existing value (current non-blank). */
export function isConflict(currentForm, key, info) {
  return Boolean(info[key]) && hasValue(currentForm[key]);
}

/** Read one candidate's source via the existing extractModelSpecification function. */
export async function readSourceExtraction(candidate) {
  const sourceUrl = sourceUrlOf(candidate);
  const res = await base44.functions.invoke("extractModelSpecification", {
    manufacturerName: candidate.manufacturer,
    model: candidate.model,
    sourceUrl,
    sourceType: "Official Product Page",
  });
  const data = res?.data ?? res;
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Build the audit evidence object stored on the specification. */
export function buildSourceEvidence(raw, acceptedKeys, info) {
  const fields = {};
  for (const key of acceptedKeys) {
    const f = info[key];
    if (!f) continue;
    fields[key] = { quote: f.quote || "", status: f.status || "reported", basis: f.basis || null };
  }
  return {
    source_url: raw?.source_url || "",
    source_date: raw?.source_date || "",
    fields,
  };
}