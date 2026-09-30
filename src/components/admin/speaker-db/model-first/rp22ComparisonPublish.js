// rp22ComparisonPublish.js
// ---------------------------------------------------------------------------
// The single bridge between the Speaker Database (review database) and the
// RP22 Speaker Capability comparison library.
//
// One direction only: an APPROVED SpeakerSpecification is mapped into a
// CompetitorSpeaker row. Nothing else writes database-sourced comparison rows,
// and the mapping never invents a value — a blank specification field stays
// blank in the comparison row so the RP22 reader can grade it honestly.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";

// Fields without which the RP22 comparison cannot grade P12/P13 for the model.
export const RP22_CRITICAL_FIELDS = [
  { key: "sensitivity_db", label: "Sensitivity (dB)" },
  { key: "sensitivity_basis", label: "Sensitivity basis" },
  { key: "nominal_impedance_ohm", label: "Nominal impedance" },
  { key: "power", label: "Continuous power handling" },
  { key: "max_spl", label: "Max continuous SPL (published or calculable)" },
  { key: "max_spl_basis", label: "Max SPL basis" },
  { key: "measurement_space", label: "Measurement space" },
];

// Published values that improve the comparison but never block it.
const ADVISORY_FIELD_KEYS = [
  "minimum_impedance_ohm",
  "recommended_amp_min_w",
  "recommended_amp_max_w",
  "max_peak_spl_db",
  "horizontal_dispersion_deg",
  "vertical_dispersion_deg",
  "frequency_response_low_hz",
  "frequency_response_high_hz",
];

const SPACE_TO_BASIS = {
  "half-space": "Half Space",
  "free-space": "Full Space",
};

function present(value) {
  return value !== null && value !== undefined && value !== "" && value !== "unknown" && value !== "unspecified";
}

// The continuous power figure the comparison uses, and where it came from.
export function resolveContinuousPower(spec) {
  if (!spec) return { value: null, label: "" };
  if (present(spec.power_handling_continuous_w)) return { value: spec.power_handling_continuous_w, label: "Continuous" };
  if (present(spec.long_term_iec_power_w)) return { value: spec.long_term_iec_power_w, label: "Long term IEC" };
  if (present(spec.rated_iec_power_w)) return { value: spec.rated_iec_power_w, label: "Rated IEC" };
  if (present(spec.aes_power_w)) return { value: spec.aes_power_w, label: "AES" };
  return { value: null, label: "" };
}

export function resolvePeakPower(spec) {
  if (!spec) return null;
  if (present(spec.power_handling_peak_w)) return spec.power_handling_peak_w;
  if (present(spec.peak_power_w)) return spec.peak_power_w;
  return null;
}

/**
 * What the model still needs before its P12/P13 comparison is trustworthy.
 * @returns {object} { critical: [{key,label}], advisory: [label], ready: boolean }
 */
export function findRp22Gaps(specification) {
  const spec = specification || {};
  const critical = [];

  for (const field of RP22_CRITICAL_FIELDS) {
    if (field.key === "power") {
      if (resolveContinuousPower(spec).value === null) critical.push(field);
      continue;
    }
    if (field.key === "max_spl") {
      const published = present(spec.max_continuous_spl_db);
      const calculable = present(spec.sensitivity_db) && resolveContinuousPower(spec).value !== null;
      if (!published && !calculable) critical.push(field);
      continue;
    }
    if (field.key === "sensitivity_basis") {
      if (!present(spec.sensitivity_basis)) critical.push(field);
      continue;
    }
    if (field.key === "max_spl_basis") {
      if (!present(spec.max_spl_basis)) critical.push(field);
      continue;
    }
    if (field.key === "measurement_space") {
      if (!present(spec.measurement_space)) critical.push(field);
      continue;
    }
    if (!present(spec[field.key])) critical.push(field);
  }

  const advisory = ADVISORY_FIELD_KEYS.filter((key) => !present(spec[key]));

  return { critical, advisory, ready: critical.length === 0 };
}

/**
 * Map an approved specification into a comparison row.
 * Fields the mapping does not own (retail price, open-back flag, import batch,
 * spreadsheet provenance) are never written here.
 */
export function buildComparisonRow({ product, specification, manufacturerName }) {
  const spec = specification || {};
  const product_ = product || {};
  const power = resolveContinuousPower(spec);
  const space = SPACE_TO_BASIS[spec.measurement_space] || "";
  const low = present(spec.frequency_response_low_hz) ? spec.frequency_response_low_hz : null;
  const high = present(spec.frequency_response_high_hz) ? spec.frequency_response_high_hz : null;
  const tolerance = spec.frequency_response_tolerance || "";

  const frequencyRange = low !== null || high !== null
    ? `${low !== null ? low : "—"}–${high !== null ? high : "—"} Hz${tolerance ? ` (${tolerance})` : ""}`
    : "";

  const toleranceSaysSix = String(tolerance).replace(/\s+/g, "").includes("6");

  return {
    manufacturer: manufacturerName || product_.manufacturer_name || "",
    model: product_.model || "",
    product_type: product_.category || "",
    rated_impedance_ohm: present(spec.nominal_impedance_ohm) ? spec.nominal_impedance_ohm : null,
    minimum_impedance_ohm: present(spec.minimum_impedance_ohm) ? spec.minimum_impedance_ohm : null,
    sensitivity_value_db: present(spec.sensitivity_db) ? spec.sensitivity_db : null,
    sensitivity_reference: present(spec.sensitivity_basis) ? spec.sensitivity_basis : "",
    sensitivity_impedance_used_ohm: present(spec.nominal_impedance_ohm) ? spec.nominal_impedance_ohm : null,
    continuous_power_w: power.value,
    power_rating_type: power.label,
    peak_power_w: resolvePeakPower(spec),
    published_max_continuous_spl_db_1m: present(spec.max_continuous_spl_db) ? spec.max_continuous_spl_db : null,
    published_max_peak_spl_db_1m: present(spec.max_peak_spl_db) ? spec.max_peak_spl_db : null,
    max_spl_test_conditions: present(spec.max_spl_basis) ? spec.max_spl_basis : "",
    frequency_range: frequencyRange,
    usable_lf_minus6db_hz: toleranceSaysSix && low !== null ? low : null,
    horizontal_coverage_deg: present(spec.horizontal_dispersion_deg) ? spec.horizontal_dispersion_deg : null,
    vertical_coverage_deg: present(spec.vertical_dispersion_deg) ? spec.vertical_dispersion_deg : null,
    recommended_amp_min_w: present(spec.recommended_amp_min_w) ? spec.recommended_amp_min_w : null,
    recommended_amp_max_w: present(spec.recommended_amp_max_w) ? spec.recommended_amp_max_w : null,
    source_url: product_.official_product_url || spec.source_date && product_.official_product_url || product_.official_product_url || "",
    datasheet_url: spec.datasheet_url || product_.official_pdf_url || "",
    date_checked: spec.source_date || new Date().toISOString().split("T")[0],
    notes: spec.notes || "",
    // Independent basis declarations — the reader derives normalised values from these.
    measurement_space_basis: space,
    sensitivity_measurement_basis: space,
    max_spl_measurement_basis: space,
    data_confidence: spec.confidence || "",
    spl_authority: spec.evidence_quality || "",
    active: true,
    // Publish provenance
    source_product_id: product_.id || null,
    source_specification_id: spec.id || null,
    publish_source: "speaker_database",
    published: true,
    published_at: new Date().toISOString(),
    approval_status: spec.approval_status || "",
    source_confidence: spec.confidence || "",
    source_evidence_quality: spec.evidence_quality || "",
    spec_version_label: spec.version_label || "",
  };
}

/**
 * Create or UPDATE the comparison row for this manufacturer + model.
 * An existing row keeps its identity (its id, retail price and manual fields);
 * a second publish never creates a duplicate.
 */
export async function publishSpecificationToRp22({ product, specification, manufacturerName, actorName }) {
  const record = buildComparisonRow({ product, specification, manufacturerName });
  const manufacturerKey = String(record.manufacturer || "").trim().toLowerCase();
  const modelKey = String(record.model || "").trim().toLowerCase();

  const page = await base44.entities.CompetitorSpeaker.filter({ model: record.model }, { limit: 50 });
  const candidates = Array.isArray(page?.items) ? page.items : Array.isArray(page) ? page : [];
  const existing = candidates.find(
    (row) => String(row.manufacturer || "").trim().toLowerCase() === manufacturerKey
      && String(row.model || "").trim().toLowerCase() === modelKey,
  );

  let competitorId;
  let created;
  if (existing) {
    // Retail price and spreadsheet-owned fields are deliberately left untouched.
    await base44.entities.CompetitorSpeaker.update(existing.id, record);
    competitorId = existing.id;
    created = false;
  } else {
    const createdRow = await base44.entities.CompetitorSpeaker.create(record);
    competitorId = createdRow?.id || null;
    created = true;
  }

  const publishedAt = record.published_at;
  await base44.entities.SpeakerSpecification.update(specification.id, {
    rp22_published_competitor_id: competitorId,
    rp22_published_at: publishedAt,
  });

  await base44.entities.SpeakerChangeHistory.create({
    product_id: product.id,
    field_changed: "rp22_publish",
    old_value: existing ? existing.id : "",
    new_value: competitorId || "",
    source: actorName || "Manual Edit",
    change_type: created ? "Created" : "Updated",
    change_reason: "Administrative",
  });

  return { competitorId, created, record };
}