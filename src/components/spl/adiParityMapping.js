// adiParityMapping.js
// ---------------------------------------------------------------------------
// Pure, dependency-free helpers that turn an ADI source extraction into a
// per-field proposal for the P12/P13 parity comparison. Extracted from
// adiSourceExtraction so the parity discipline (peak-vs-continuous SPL, power
// category distinction, source-label retention) is unit-testable without the
// base44/AuthContext chain.
//
// Nothing here re-implements the source read (that is extractModelSpecification)
// and nothing here changes the P12/P13 engine. It only maps the extracted
// evidence onto the same field basis the comparison uses, without converting
// one category into another.
// ---------------------------------------------------------------------------

import {
  SENSITIVITY_REFERENCES,
  MEASUREMENT_SPACES,
  SPL_BASES,
} from "@/components/spl/comparisonFieldOptions";

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== "";

export const FIELD_LABEL = {
  sensitivity_db: "Sensitivity (dB)",
  sensitivity_reference: "Sensitivity reference",
  impedance_ohm: "Nominal impedance (Ω)",
  power_w: "Recommended amplifier max (W)",
  power_w_min: "Recommended amplifier min (W)",
  max_spl_db: "Max continuous SPL (dB)",
  max_spl_basis: "Max SPL basis",
  measurement_space: "Measurement space",
};

export const PROPOSAL_FIELDS = [
  "sensitivity_db",
  "sensitivity_reference",
  "impedance_ohm",
  "power_w",
  "power_w_min",
  "max_spl_db",
  "max_spl_basis",
  "measurement_space",
];

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
  // Peak/short-term SPL is NEVER collapsed to continuous — a "maximum SPL"
  // figure is useful evidence but is not automatically continuous capability.
  if (s === "peak") return "peak";
  if (["aes", "iec", "continuous"].includes(s)) return "continuous";
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

/**
 * Turn the extraction result into a map of formKey → { value, status, quote, basis, category }.
 * Continuous-basis power ratings (continuous / long-term IEC / rated IEC / AES)
 * are all legitimate continuous speaker ratings — they are preferred in
 * priority order, and the specific category the manufacturer used is retained
 * so the review can show it. They are never converted; only the correct field
 * is selected. A recommended amplifier maximum is a separate, weaker basis.
 * Peak SPL basis is kept distinct from continuous.
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
    // §6: a peak / short-term SPL figure is useful evidence but is NOT continuous
    // capability. When the source labels the basis peak, do not propose the SPL
    // value as max_spl_db (continuous) — leave the continuous field blank so the
    // data status reflects the uncertainty. The peak basis is still surfaced as
    // the max_spl_basis row so the admin can see the source said "peak".
    if (formKey === "max_spl_db" && mapMaxSplBasis(byField.max_spl_basis?.value) === "peak") {
      continue;
    }
    found[formKey] = val;
    info[formKey] = {
      value: val,
      rawValue: byField[specKey].value,
      status: byField[specKey].status,
      quote: byField[specKey].quote,
    };
  }
  const CONTINUOUS_SOURCES = [
    { field: "power_handling_continuous_w", label: "Continuous" },
    { field: "long_term_iec_power_w", label: "Long-term IEC" },
    { field: "rated_iec_power_w", label: "Rated IEC" },
    { field: "aes_power_w", label: "AES" },
  ];
  const continuous = CONTINUOUS_SOURCES.find((src) => byField[src.field]);
  if (continuous) {
    const entry = byField[continuous.field];
    found.power_w = entry.value;
    found.power_basis = "continuous";
    info.power_w = {
      value: entry.value,
      rawValue: entry.value,
      status: entry.status,
      quote: entry.quote,
      basis: "continuous",
      category: continuous.label,
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
      category: "Recommended amplifier max",
    };
    // Preserve the recommended amplifier range minimum when the source states
    // it, so both endpoints of a range like "500W – 1,000W" are proposed.
    if (byField.recommended_amp_min_w) {
      found.power_w_min = byField.recommended_amp_min_w.value;
      info.power_w_min = {
        value: byField.recommended_amp_min_w.value,
        rawValue: byField.recommended_amp_min_w.value,
        status: byField.recommended_amp_min_w.status,
        quote: byField.recommended_amp_min_w.quote,
        basis: "amplifier",
        category: "Recommended amplifier min",
      };
    }
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

export { mapMaxSplBasis };