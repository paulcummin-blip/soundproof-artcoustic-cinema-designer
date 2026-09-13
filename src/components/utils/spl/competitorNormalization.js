// Competitors are translated to Sound Proof's existing half-space convention.
// Always derive from raw manufacturer fields; cached derived values are not inputs.
//
// Sensitivity and Max SPL measurement bases are resolved INDEPENDENTLY:
//   Full Space  → +6 dB once (full_space_published_converted)
//   Half Space  → 0 dB       (half_space_published)
//   blank/Unknown/unstated → assume Half Space, 0 dB (half_space_assumed)
// Unknown basis never blocks grading — it grades using the half-space assumption.
export const FULL_TO_HALF_SPACE_DB = 6;

function num(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Resolve a single measurement-basis declaration to { correctionDb, provenance }.
function resolveSpaceBasis(rawBasis) {
  const normalized = String(rawBasis ?? '').trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  if (normalized === 'full space') {
    return { correctionDb: FULL_TO_HALF_SPACE_DB, provenance: 'full_space_published_converted' };
  }
  if (normalized === 'half space') {
    return { correctionDb: 0, provenance: 'half_space_published' };
  }
  // blank / Unknown / unstated → assume Half Space, 0 dB
  return { correctionDb: 0, provenance: 'half_space_assumed' };
}

export function normalizeCompetitor(record) {
  // Sensitivity basis (independent) — falls back to legacy measurement_space_basis
  const sensitivityBasisRaw = record.sensitivity_measurement_basis ?? record.measurement_space_basis;
  const sensitivityBasis = resolveSpaceBasis(sensitivityBasisRaw);

  // Max SPL basis (independent) — falls back to legacy measurement_space_basis
  const maxSplBasisRaw = record.max_spl_measurement_basis ?? record.measurement_space_basis;
  const maxSplBasis = resolveSpaceBasis(maxSplBasisRaw);

  const sensitivity = num(record.sensitivity_value_db);
  const reference = String(record.sensitivity_reference ?? '').toLowerCase().replace(/\s+/g, '');
  const impedance = num(record.sensitivity_impedance_used_ohm) ?? num(record.rated_impedance_ohm);
  const isWatts = ['1w/1m', '1w@1m'].includes(reference);
  const isVolts = ['2.83v/1m', '2,83v/1m', '2.83v@1m'].includes(reference);
  const voltageDb = isWatts ? 0 : isVolts && impedance > 0 ? -10 * Math.log10(2.83 ** 2 / impedance) : null;

  // 1 W normalisation in the raw published space (space correction applied separately)
  const oneW = sensitivity !== null && voltageDb !== null ? sensitivity + voltageDb : null;
  // Half-space sensitivity: apply sensitivity space correction once
  const halfSensitivity = oneW !== null ? oneW + sensitivityBasis.correctionDb : null;

  const rawPower = num(record.continuous_power_w);
  const power = rawPower > 0 ? rawPower : null;
  const rawContinuous = num(record.published_max_continuous_spl_db_1m);
  const rawPeak = num(record.published_max_peak_spl_db_1m);

  // Published SPL values get the max-SPL space correction applied once (independently)
  const continuous = rawContinuous !== null ? rawContinuous + maxSplBasis.correctionDb : null;
  const peak = rawPeak !== null ? rawPeak + maxSplBasis.correctionDb : null;

  // Calculated capability uses the sensitivity space correction (already in halfSensitivity)
  const rawCalculated = oneW !== null && power !== null ? oneW + 10 * Math.log10(power) : null;
  const calculated = halfSensitivity !== null && power !== null ? halfSensitivity + 10 * Math.log10(power) : null;

  const warnings = [
    sensitivity === null ? 'Missing sensitivity' : null,
    voltageDb === null ? 'Sensitivity reference or impedance needs confirmation' : null,
    power === null ? 'Missing continuous/RMS/AES power' : null,
  ].filter(Boolean);

  const eligible = warnings.length === 0;

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
    normalized_continuous_power_w: power,
    calculated_max_continuous_spl_db_1m: rawCalculated,
    halfspace_published_max_continuous_spl_db_1m: continuous,
    halfspace_published_max_peak_spl_db_1m: peak,
    halfspace_calculated_max_continuous_spl_db_1m: calculated,
    spl_authority: !eligible ? 'Incomplete' : continuous !== null ? 'Published continuous SPL' : 'Calculated from sensitivity + power',
    data_confidence: !eligible ? 'Low' : continuous !== null ? 'High' : 'Medium',
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
    power_handling_w: n.normalized_continuous_power_w,
    max_spl_cont_db_1m_halfspace: n.halfspace_published_max_continuous_spl_db_1m ?? n.halfspace_calculated_max_continuous_spl_db_1m,
    isLineSource: false,
  };
}