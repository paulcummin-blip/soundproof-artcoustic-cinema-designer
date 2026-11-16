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
  power_w_amp: "Recommended amplifier max (W)",
  power_w_min: "Recommended amplifier min (W)",
  frequency_response_low_hz: "Frequency response low (Hz)",
  frequency_response_high_hz: "Frequency response high (Hz)",
  frequency_response_tolerance_db: "Frequency response tolerance (dB)",
  max_spl_db: "Max continuous SPL (dB)",
  max_peak_spl_db: "Max peak SPL (dB)",
  max_spl_basis: "Max SPL basis",
  measurement_space: "Measurement space",
};

export const PROPOSAL_FIELDS = [
  "sensitivity_db",
  "sensitivity_reference",
  "impedance_ohm",
  "power_w",
  "power_w_amp",
  "power_w_min",
  "frequency_response_low_hz",
  "frequency_response_high_hz",
  "frequency_response_tolerance_db",
  "max_spl_db",
  "max_peak_spl_db",
  "max_spl_basis",
  "measurement_space",
];

const SPEC_TO_FORM = {
  sensitivity_db: "sensitivity_db",
  sensitivity_basis: "sensitivity_reference",
  nominal_impedance_ohm: "impedance_ohm",
  frequency_response_low_hz: "frequency_response_low_hz",
  frequency_response_high_hz: "frequency_response_high_hz",
  frequency_response_tolerance_db: "frequency_response_tolerance_db",
  max_continuous_spl_db: "max_spl_db",
  max_peak_spl_db: "max_peak_spl_db",
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
  // The backend separates items into reported/ambiguous arrays but does not
  // stamp a status field on each item — the status is implicit from which
  // array it came from. Set it explicitly so downstream checks
  // (status === "reported") work correctly.
  for (const item of (raw?.reported || [])) {
    if (!item || !item.field) continue;
    byField[item.field] = {
      value: item.value,
      status: "reported",
      quote: String(item.raw_text || "").trim(),
    };
  }
  for (const item of (raw?.ambiguous || [])) {
    if (!item || !item.field) continue;
    if (byField[item.field]) continue; // reported takes precedence
    byField[item.field] = {
      value: item.value,
      status: "ambiguous",
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
    { field: "power_handling_continuous_w", label: "Manufacturer Power Handling" },
    { field: "long_term_iec_power_w", label: "Long-term IEC" },
    { field: "rated_iec_power_w", label: "Rated IEC" },
    { field: "aes_power_w", label: "AES" },
  ];
  // Every manufacturer-published power specification is surfaced independently
  // as an advisory row (info.power_advisories) so none disappears from the
  // review, even when a higher-priority authority is selected for the P12/P13
  // calculation. The calculation authority hierarchy below selects the value
  // the engine uses (continuous > recommended amplifier max), but the other
  // categories remain visible with their source quotations.
  const ALL_POWER_SOURCES = [
    ...CONTINUOUS_SOURCES,
    { field: "recommended_amp_min_w", label: "Recommended amplifier min" },
    { field: "recommended_amp_max_w", label: "Recommended amplifier max" },
    { field: "program_power_w", label: "Programme power" },
    { field: "peak_power_w", label: "Peak power" },
    { field: "power_handling_peak_w", label: "Power handling peak" },
  ];
  info.power_advisories = [];
  for (const src of ALL_POWER_SOURCES) {
    const entry = byField[src.field];
    if (!entry) continue;
    info.power_advisories.push({
      field: src.field,
      value: entry.value,
      status: entry.status,
      quote: entry.quote,
      category: src.label,
    });
  }
  if (info.power_advisories.length === 0) delete info.power_advisories;

  // Only a REPORTED continuous-source rating is classified as continuous power.
  // An ambiguous "Power handling" figure is surfaced separately as an advisory
  // (info.power_handling_note) preserving the manufacturer wording — it is NOT
  // proposed as continuous or amplifier power, so no basis is invented.
  const continuous = CONTINUOUS_SOURCES.find(
    (src) => byField[src.field] && byField[src.field].status === "reported",
  );
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
  }
  // Recommended amplifier maximum is an independent authority — it is ALWAYS
  // surfaced when reported, even when a continuous rating also exists, so the
  // admin sees every published power figure. The calculation hierarchy prefers
  // continuous for the P12/P13 value (set above), but the recommended amplifier
  // range never disappears from the review.
  if (byField.recommended_amp_max_w && byField.recommended_amp_max_w.status === "reported") {
    if (!found.power_w) {
      found.power_w = byField.recommended_amp_max_w.value;
      found.power_basis = "amplifier";
    }
    info.power_w_amp = {
      value: byField.recommended_amp_max_w.value,
      rawValue: byField.recommended_amp_max_w.value,
      status: byField.recommended_amp_max_w.status,
      quote: byField.recommended_amp_max_w.quote,
      basis: "amplifier",
      category: "Recommended amplifier max",
    };
    if (byField.recommended_amp_min_w) {
      info.power_w_min = {
        value: byField.recommended_amp_min_w.value,
        rawValue: byField.recommended_amp_min_w.value,
        status: byField.recommended_amp_min_w.status,
        quote: byField.recommended_amp_min_w.quote,
        basis: "amplifier",
        category: "Recommended amplifier min",
      };
      // Only set found.power_w_min when no continuous power was selected —
      // otherwise it remains an advisory-only row.
      if (!found.power_w_min) found.power_w_min = byField.recommended_amp_min_w.value;
    }
  }
  // Advisory: a "Power handling" figure the manufacturer stated without a
  // continuous/RMS/IEC/AES/peak/recommended-amplifier qualifier. The wording is
  // preserved but NO basis is invented — it is not proposed as continuous or
  // amplifier power. The direct published-continuous-SPL route remains the
  // authority when a continuous SPL exists.
  const ambiguousPower = CONTINUOUS_SOURCES.find(
    (src) => byField[src.field] && byField[src.field].status === "ambiguous",
  );
  if (ambiguousPower && !found.power_w) {
    const entry = byField[ambiguousPower.field];
    info.power_handling_note = {
      value: entry.value,
      quote: entry.quote,
      category: "Power handling (basis not stated)",
    };
  }
  // Surface any P12/P13 concepts the LLM noticed in the source but could not
  // map to a field, so the admin sees "Potential field not mapped" warnings
  // rather than a silently dropped specification row.
  const unmapped = Array.isArray(raw?.potential_unmapped) ? raw.potential_unmapped : [];
  if (unmapped.length > 0) {
    info.potential_unmapped = unmapped.map((u) => ({
      concept: String(u?.concept || "").trim(),
      quote: String(u?.raw_text || "").trim(),
    })).filter((u) => u.concept || u.quote);
  }
  return { found, info };
}

export function displayValue(formKey, value) {
  if (!hasValue(value)) return "—";
  if (formKey === "sensitivity_reference") return labelOf(SENSITIVITY_REFERENCES, value);
  if (formKey === "measurement_space") return labelOf(MEASUREMENT_SPACES, value);
  if (formKey === "max_spl_basis") return labelOf(SPL_BASES, value);
  if (formKey === "power_w" || formKey === "power_w_amp" || formKey === "max_peak_spl_db") return `${value}`;
  if (formKey === "frequency_response_low_hz") return `${value} Hz`;
  if (formKey === "frequency_response_high_hz") {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1000) return `${(n / 1000).toLocaleString("en-GB")} kHz`;
    return `${value} Hz`;
  }
  if (formKey === "frequency_response_tolerance_db") return `±${value} dB`;
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