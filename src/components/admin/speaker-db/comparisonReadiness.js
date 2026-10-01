// comparisonReadiness.js
// ---------------------------------------------------------------------------
// ONE authority for the question the Products list must answer: can this
// competitor model be compared with an Artcoustic model on RP22 P12/P13, and
// how defendable is that comparison?
//
// Nothing here is a vague health score and nothing is stored. The classification
// is produced by pushing the specification through the SAME mapping and the SAME
// normalisation the RP22 Speaker Capability page uses, so the Products list can
// never disagree with the grade a dealer sees on that page.
//
//   A             Comparable            published measured capability data
//   B             Partially Comparable  calculated from published sensitivity,
//                                       impedance and a stated power authority
//   C             ADI Estimate          ADI estimate based on available
//                                       manufacturer data (partial data only)
//   INSUFFICIENT  Insufficient Data     missing sensitivity or impedance — no
//                                       defensible P12/P13 comparison exists
//
// The field list below IS the RP22 comparison field definition. These are the
// same fields the Artcoustic registry supplies for every Artcoustic row, so a
// competitor's completeness is measured against the reference data the engine
// actually consumes — not against a marketing specification sheet.
// ---------------------------------------------------------------------------

import { buildComparisonRow, resolvePowerAuthority } from "./model-first/rp22ComparisonPublish.js";
import { normalizeCompetitor } from "@/components/utils/spl/competitorNormalization.js";

const present = (value) =>
  value !== null && value !== undefined && value !== "" && value !== "unknown" && value !== "unspecified";

export const READINESS_LEVELS = {
  A: {
    confidence: "A",
    label: "Comparable",
    tone: "#213428",
    meaning: "Published measured capability data available — key capability fields present.",
  },
  B: {
    confidence: "B",
    label: "Partially Comparable",
    tone: "#9A6E00",
    meaning: "Calculated from published sensitivity, impedance and a stated power authority.",
  },
  C: {
    confidence: "C",
    label: "ADI Estimate",
    tone: "#9A6E00",
    meaning: "ADI estimate based on available manufacturer data — partial published data only.",
  },
  INSUFFICIENT: {
    confidence: "D",
    label: "Insufficient Data",
    tone: "#B23A3A",
    meaning: "Missing sensitivity or impedance — no defensible RP22 comparison is possible.",
  },
};

// Critical = required before a P12/P13 comparison is defensible.
// Useful  = improves the evidence but never blocks the comparison.
export const COMPARISON_FIELDS = [
  { key: "sensitivity_db", label: "Sensitivity", critical: true, resolve: (s) => present(s.sensitivity_db) },
  { key: "sensitivity_basis", label: "Sensitivity basis", critical: true, resolve: (s) => present(s.sensitivity_basis) },
  { key: "nominal_impedance_ohm", label: "Nominal impedance", critical: true, resolve: (s) => present(s.nominal_impedance_ohm) },
  {
    key: "power_authority",
    label: "Power authority or published max SPL",
    critical: true,
    resolve: (s) => resolvePowerAuthority(s).value !== null || present(s.max_continuous_spl_db),
  },
  {
    key: "frequency_response",
    label: "Frequency response / usable bandwidth",
    critical: true,
    resolve: (s) => present(s.frequency_response_low_hz) || present(s.frequency_response_high_hz),
  },
  { key: "measurement_space", label: "Measurement space", critical: true, resolve: (s) => present(s.measurement_space) },
  {
    key: "source_url",
    label: "Source URL",
    critical: true,
    resolve: (s, p) => present(p?.official_product_url) || present(s.datasheet_url),
  },
  { key: "source_date", label: "Source date", critical: true, resolve: (s) => present(s.source_date) },
  {
    key: "evidence_quality",
    label: "Evidence quality",
    critical: true,
    resolve: (s) => present(s.evidence_quality) && s.evidence_quality !== "Unknown",
  },
  { key: "max_continuous_spl_db", label: "Max continuous SPL", critical: false, resolve: (s) => present(s.max_continuous_spl_db) },
  { key: "max_peak_spl_db", label: "Max peak SPL", critical: false, resolve: (s) => present(s.max_peak_spl_db) },
  { key: "max_spl_basis", label: "Max SPL / power basis", critical: false, resolve: (s) => present(s.max_spl_basis) },
  {
    key: "dispersion",
    label: "Dispersion",
    critical: false,
    resolve: (s) => present(s.horizontal_dispersion_deg) || present(s.vertical_dispersion_deg),
  },
  { key: "thx_certification", label: "THX / certification", critical: false, resolve: (s) => present(s.thx_certification) },
  {
    key: "driver_configuration",
    label: "Driver configuration",
    critical: false,
    resolve: (s) => present(s.woofer_count) || present(s.woofer_size) || present(s.tweeter_description),
  },
  { key: "cabinet_type", label: "Cabinet type", critical: false, resolve: (s) => present(s.cabinet_type) },
];

/**
 * The comparison standing of one specification.
 * @param {object} params { product, specification }
 * @returns {object} level, confidence, missing field lists, completeness and the
 *   evidence trail (power authority, capability basis, evidence quality).
 */
export function comparisonReadiness({ product, specification }) {
  const spec = specification || {};
  const presentKeys = [];
  const missingCritical = [];
  const missingUseful = [];

  for (const field of COMPARISON_FIELDS) {
    if (field.resolve(spec, product)) presentKeys.push(field.key);
    else if (field.critical) missingCritical.push(field);
    else missingUseful.push(field);
  }

  const mapped = buildComparisonRow({
    product,
    specification: spec,
    manufacturerName: product?.manufacturer_name || "",
  });
  // The same ADI sensitivity-basis treatment the RP22 candidate list applies, so
  // this list can never report a different class from the grade a dealer sees.
  const { row: comparisonRow, assumed: sensitivityBasisAssumed } = applySensitivityBasisAssumption(mapped);
  const normalized = normalizeCompetitor(comparisonRow);
  const level = READINESS_LEVELS[normalized.data_confidence] || READINESS_LEVELS.INSUFFICIENT;

  return {
    level,
    confidence: level.confidence,
    label: level.label,
    tone: level.tone,
    meaning: level.meaning,
    eligible: normalized.p12_p13_eligible === true,
    missingCriticalLabels: missingCritical.map((f) => f.label),
    missingUsefulLabels: missingUseful.map((f) => f.label),
    presentCount: presentKeys.length,
    totalCount: COMPARISON_FIELDS.length,
    sensitivityBasisAssumed,
    powerAuthority: normalized.power_authority,
    powerAuthorityW: normalized.power_authority_w,
    capabilityBasis: normalized.capability_basis,
    evidenceQuality: normalized.evidence_quality,
    secondaryEvidence: normalized.secondary_evidence || null,
    secondaryCapped: normalized.evidence_source === "secondary" && normalized.secondary_evidence?.is_official !== true,
    secondaryTrusted: normalized.secondary_trusted === true,
    secondarySourceName: normalized.secondary_source_name || "",
    splAuthority: normalized.spl_authority,
    warnings: normalized.normalization_warnings || [],
  };
}

/** Sensitivity as published, with the basis it was quoted on. */
export function sensitivityText(specification) {
  const spec = specification || {};
  if (!present(spec.sensitivity_db)) return "—";
  const basis = present(spec.sensitivity_basis) ? spec.sensitivity_basis : "basis not stated";
  return `${spec.sensitivity_db} dB · ${basis}`;
}

/** The power figure the comparison is allowed to use, and where it came from. */
export function powerBasisText(specification) {
  const spec = specification || {};
  const power = resolvePowerAuthority(spec);
  if (power.value !== null) {
    return power.source === "power_rating"
      ? `${power.value} W · ${power.label}`
      : `${power.value} W · recommended amplifier max`;
  }
  if (present(spec.max_continuous_spl_db)) return `${spec.max_continuous_spl_db} dB · published max SPL`;
  return "No power or max SPL";
}

/** Where the numbers come from — shown in the Evidence column. */
export function evidenceText(readiness) {
  if (!readiness) return "—";
  if (readiness.secondaryCapped) {
    return readiness.secondaryTrusted
      ? `${readiness.confidence} · trusted secondary evidence`
      : `${readiness.confidence} · secondary evidence`;
  }
  if (readiness.confidence === "A") return "A · published capability";
  if (readiness.confidence === "B") return "B · calculated";
  if (readiness.confidence === "C") return "C · ADI estimate";
  return "D · insufficient";
}