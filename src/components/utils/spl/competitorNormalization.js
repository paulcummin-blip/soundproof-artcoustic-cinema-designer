// Competitors are translated to Sound Proof's existing half-space convention.
// Always derive from raw manufacturer fields; cached derived values are not inputs.
//
// Sensitivity and Max SPL measurement bases are resolved INDEPENDENTLY:
//   Full Space  → +6 dB once (full_space_published_converted)
//   Half Space  → 0 dB       (half_space_published)
//   blank/Unknown/unstated → assume Half Space, 0 dB (half_space_assumed)
// Unknown basis never blocks grading — it grades using the half-space assumption.
import {
  TRUSTED_EVIDENCE_LABEL,
  TRUSTED_SECONDARY_BASIS,
  trustedSecondarySource,
} from './trustedSecondarySources.js';

export const FULL_TO_HALF_SPACE_DB = 6;

function num(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Sensitivity basis — the reference the manufacturer quoted sensitivity against.
// Sources write the same reference many ways ("2.83V1m", "2.83V/1m",
// "2.83 V / 1 m", "2.83V @ 1m", "2.83 volts/1m") and they all mean 2.83 V at 1 m.
// Anything that is not a recognised reference returns null, so the row is
// reported as needing confirmation rather than being assumed to be 1 W.
export function parseSensitivityBasis(raw) {
  const compact = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/@/g, '/')
    .replace(/per/g, '/')
    .replace(/volts?/g, 'v')
    .replace(/watts?/g, 'w')
    .replace(/,/g, '.');
  if (!compact) return null;
  if (/^2\.83v/.test(compact)) return '2.83V/1m';
  if (/^1w/.test(compact)) return '1W/1m';
  return null;
}

// Resolve a single measurement-basis declaration to { correctionDb, provenance }.
function resolveSpaceBasis(rawBasis) {
  const normalized = String(rawBasis ?? '').trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  if (normalized === 'full space' || normalized === 'full') {
    return { correctionDb: FULL_TO_HALF_SPACE_DB, provenance: 'full_space_published_converted' };
  }
  if (normalized === 'half space' || normalized === 'half') {
    return { correctionDb: 0, provenance: 'half_space_published' };
  }
  // blank / Unknown / unstated → explicit unknown/assumed state (Half Space, 0 dB)
  return { correctionDb: 0, provenance: 'half_space_assumed' };
}

// Parse manufacturer recommended amplifier range strings like "200-1400", "150–600", "50 to 225".
// Returns { min, max } in watts. The upper value is the relevant maximum ceiling.
export function parseRecommendedAmpRange(raw) {
  if (raw === null || raw === undefined) return { min: null, max: null };
  const s = String(raw).trim();
  if (s === '') return { min: null, max: null };
  // Single number
  const single = Number(s);
  if (Number.isFinite(single) && single > 0) return { min: null, max: single };
  // Range: "200-1400", "200 – 1400", "200—1400", "200 to 1400"
  const rangeMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?)/i);
  if (rangeMatch) {
    const lo = Number(rangeMatch[1]);
    const hi = Number(rangeMatch[2]);
    if (Number.isFinite(lo) && Number.isFinite(hi) && hi > 0) {
      return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
    }
  }
  // Fallback: extract first number as max
  const numMatch = s.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const n = Number(numMatch[1]);
    if (Number.isFinite(n) && n > 0) return { min: null, max: n };
  }
  return { min: null, max: null };
}

export function normalizeCompetitor(record) {
  // Sensitivity basis (independent) — falls back to legacy measurement_space_basis
  const sensitivityBasisRaw = record.sensitivity_measurement_basis ?? record.measurement_space_basis;
  const sensitivityBasis = resolveSpaceBasis(sensitivityBasisRaw);

  // Max SPL basis (independent) — falls back to legacy measurement_space_basis
  const maxSplBasisRaw = record.max_spl_measurement_basis ?? record.measurement_space_basis;
  const maxSplBasis = resolveSpaceBasis(maxSplBasisRaw);

  const sensitivity = num(record.sensitivity_value_db);
  const impedance = num(record.sensitivity_impedance_used_ohm) ?? num(record.rated_impedance_ohm);
  const reference = parseSensitivityBasis(record.sensitivity_reference);
  const isWatts = reference === '1W/1m';
  const isVolts = reference === '2.83V/1m';
  // 2.83 V into a non-8 Ω load is not 1 W, so convert once, from the published
  // figure and the impedance the manufacturer quoted it at:
  //   sensitivity_1w = sensitivity_2.83V - 10·log10(2.83² / impedance)
  // (90 dB @ 2.83V/1m into 4 Ω → 86.99 dB @ 1W/1m.)
  const voltageDb = isWatts ? 0 : isVolts && impedance > 0 ? -10 * Math.log10(2.83 ** 2 / impedance) : null;

  // 1 W normalisation in the raw published space (space correction applied separately)
  const oneW = sensitivity !== null && voltageDb !== null ? sensitivity + voltageDb : null;
  // Half-space sensitivity: apply sensitivity space correction once
  const halfSensitivity = oneW !== null ? oneW + sensitivityBasis.correctionDb : null;

  const rawContinuous = num(record.published_max_continuous_spl_db_1m);
  const rawPeak = num(record.published_max_peak_spl_db_1m);

  // Recommended amplifier range — prefer dedicated min/max fields, fall back to legacy single value
  const recAmpMin = num(record.recommended_amp_min_w);
  const recAmpMax = num(record.recommended_amp_max_w) ?? num(record.recommended_amplifier_power_w);

  // Power authority. A published continuous/AES-style rating is preferred. Many
  // manufacturers publish only a recommended amplifier range, so in that case the
  // recommended amplifier maximum is the stated authority. Nothing is inferred and
  // nothing is invented: an absent figure stays absent and the row stays ungradeable.
  const publishedRating = num(record.continuous_power_w);
  const ratingLabel = String(record.power_rating_type ?? '').trim();
  const powerFromRating = publishedRating > 0 ? publishedRating : null;
  const powerFromAmpRecommendation = recAmpMax > 0 ? recAmpMax : null;
  const power = powerFromRating ?? powerFromAmpRecommendation;
  const powerIsPublishedRating = powerFromRating !== null;
  const powerAuthority = powerIsPublishedRating
    ? (ratingLabel || 'Continuous')
    : powerFromAmpRecommendation !== null ? 'Manufacturer recommended amplifier maximum' : null;

  // Published SPL values get the max-SPL space correction applied once (independently)
  const continuous = rawContinuous !== null ? rawContinuous + maxSplBasis.correctionDb : null;
  const peak = rawPeak !== null ? rawPeak + maxSplBasis.correctionDb : null;

  // Calculated capability uses the sensitivity space correction (already in halfSensitivity)
  const rawCalculated = oneW !== null && power !== null ? oneW + 10 * Math.log10(power) : null;
  const calculated = halfSensitivity !== null && power !== null ? halfSensitivity + 10 * Math.log10(power) : null;

  // Gradeable when either a published continuous SPL exists, or the capability can
  // be calculated from sensitivity plus a stated power authority. A row with
  // neither a power rating nor a recommended amplifier maximum — and no published
  // SPL — stays ungradeable rather than being estimated.
  const warnings = [
    sensitivity === null && continuous === null ? 'Missing sensitivity' : null,
    voltageDb === null && continuous === null ? 'Sensitivity reference or impedance needs confirmation' : null,
    power === null && continuous === null
      ? 'Missing continuous/AES power and recommended amplifier maximum'
      : null,
  ].filter(Boolean);

  const eligible = warnings.length === 0;

  // Data confidence classification:
  // A — published continuous SPL + confirmed space basis
  // B — calculated continuous SPL from confirmed sensitivity/power/basis
  // C — partial/inferred (basis assumed)
  // INSUFFICIENT — cannot make reliable RP22 comparison
  const hasConfirmedBasis = sensitivityBasis.provenance !== 'half_space_assumed' && maxSplBasis.provenance !== 'half_space_assumed';
  let dataConfidence;
  if (!eligible) {
    dataConfidence = 'INSUFFICIENT';
  } else if (continuous !== null && hasConfirmedBasis) {
    dataConfidence = 'A';
  } else if (calculated !== null && hasConfirmedBasis) {
    dataConfidence = 'B';
  } else {
    dataConfidence = 'C';
  }
  // Capability resting on a recommended amplifier maximum is sound engineering but
  // is not a published power rating, so it can never reach confidence A.
  if (!powerIsPublishedRating && dataConfidence === 'A') dataConfidence = 'B';

  // Admin-approved secondary evidence — a manufacturer document copied by a
  // third-party host. It is usable for comparison but is never published measured
  // manufacturer evidence, so A and B are held at C. A source sitting on the
  // manufacturer's own CDN or archive is not capped.
  const secondaryEvidence = record.secondary_evidence && typeof record.secondary_evidence === 'object'
    ? record.secondary_evidence
    : null;
  const secondaryCapped = Boolean(secondaryEvidence) && secondaryEvidence.is_official !== true;
  if (secondaryCapped && (dataConfidence === 'A' || dataConfidence === 'B')) dataConfidence = 'C';

  // A trusted secondary distributor (Habitech, CAVD, Pulse Cinemas, AWE Europe)
  // is secondary evidence like any other: usable for a P12/P13 estimate, always
  // labelled "Trusted secondary evidence", and never allowed to appear as A.
  const trustedSource = secondaryEvidence
    ? (trustedSecondarySource(secondaryEvidence.host) || trustedSecondarySource(secondaryEvidence.url))
    : null;
  const trustedSecondary = Boolean(trustedSource);

  // How the capability figure was obtained, and the quality of the evidence
  // behind the power authority it rests on.
  let capabilityBasis = continuous !== null ? 'Published' : 'Calculated';
  let evidenceQuality = powerIsPublishedRating
    ? 'Manufacturer Published'
    : power === null ? 'Unknown' : 'Manufacturer Calculated';

  if (secondaryCapped) {
    capabilityBasis = secondaryEvidence.basis
      || (trustedSecondary
        ? (continuous !== null ? TRUSTED_SECONDARY_BASIS.CALCULATED : TRUSTED_SECONDARY_BASIS.ESTIMATE)
        : (continuous !== null ? 'Calculated from secondary published data' : 'ADI estimate from secondary manufacturer document'));
    evidenceQuality = trustedSecondary ? TRUSTED_EVIDENCE_LABEL : 'Secondary Evidence';
  }

  return {
    ...record,
    normalized_sensitivity_db_1w_1m: oneW,
    voltage_to_1w_correction_db: voltageDb,
    sensitivity_space_correction_db: sensitivityBasis.correctionDb,
    sensitivity_space_provenance: sensitivityBasis.provenance,
    max_spl_space_correction_db: maxSplBasis.correctionDb,
    max_spl_space_provenance: maxSplBasis.provenance,
    // Legacy single-field alias (max of the two independent corrections; both are 0 or 6)
    space_correction_db: Math.max(sensitivityBasis.correctionDb, maxSplBasis.correctionDb),
    measurement_basis_status: 'Resolved',
    halfspace_sensitivity_db_1w_1m: halfSensitivity,
    normalized_continuous_power_w: powerFromRating,
    recommended_amp_min_w: recAmpMin,
    recommended_amp_max_w: recAmpMax,
    calculated_max_continuous_spl_db_1m: rawCalculated,
    halfspace_published_max_continuous_spl_db_1m: continuous,
    halfspace_published_max_peak_spl_db_1m: peak,
    halfspace_calculated_max_continuous_spl_db_1m: calculated,
    spl_authority: !eligible ? 'Incomplete' : continuous !== null ? 'Published continuous SPL' : 'Calculated from sensitivity + power',
    data_confidence: dataConfidence,
    // Power authority behind the capability figure (published rating, or the
    // manufacturer's recommended amplifier maximum) and how it was obtained.
    power_authority: powerAuthority,
    power_authority_w: power,
    capability_basis: eligible ? capabilityBasis : null,
    evidence_quality: evidenceQuality,
    // Secondary evidence travels with the row so the reader can label it and say
    // why the confidence was held where it is.
    evidence_source: secondaryEvidence ? 'secondary' : 'official',
    secondary_evidence: secondaryEvidence,
    secondary_evidence_url: secondaryEvidence?.url || '',
    secondary_trusted: trustedSecondary,
    secondary_source_name: trustedSource?.name || '',
    confidence_cap_reason: secondaryCapped ? (secondaryEvidence.confidence_cap_reason || '') : '',
    p12_p13_eligible: eligible,
    normalization_warnings: warnings,
  };
}

export function competitorMetaForComparison(record) {
  const n = normalizeCompetitor(record);
  if (!n.p12_p13_eligible) return null;
  return {
    id: `competitor:${record.id}`,
    model: `${record.manufacturer} ${record.model}`,
    sensitivity_db_1w_1m: n.halfspace_sensitivity_db_1w_1m,
    // The stated power authority — published rating preferred, recommended
    // amplifier maximum otherwise. Never an inferred figure.
    power_handling_w: n.power_authority_w,
    max_spl_cont_db_1m_halfspace: n.halfspace_published_max_continuous_spl_db_1m ?? n.halfspace_calculated_max_continuous_spl_db_1m,
    recommended_amp_max_w: n.recommended_amp_max_w,
    isLineSource: false,
  };
}