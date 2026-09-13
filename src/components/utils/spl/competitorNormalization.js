// Competitors are translated to Sound Proof's existing half-space convention.
// Always derive from raw manufacturer fields; cached derived values are not inputs.
export const FULL_TO_HALF_SPACE_DB = 6;

function num(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeCompetitor(record) {
  const rawSpace = String(record.measurement_space_basis ?? '').trim();
  const space = rawSpace.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  const spaceDb = space === 'full space' ? FULL_TO_HALF_SPACE_DB : space === 'half space' ? 0 : null;
  const sensitivity = num(record.sensitivity_value_db);
  const reference = String(record.sensitivity_reference ?? '').toLowerCase().replace(/\s+/g, '');
  const impedance = num(record.sensitivity_impedance_used_ohm) ?? num(record.rated_impedance_ohm);
  const isWatts = ['1w/1m', '1w@1m'].includes(reference);
  const isVolts = ['2.83v/1m', '2,83v/1m', '2.83v@1m'].includes(reference);
  const voltageDb = isWatts ? 0 : isVolts && impedance > 0 ? -10 * Math.log10(2.83 ** 2 / impedance) : null;
  const oneW = sensitivity !== null && voltageDb !== null ? sensitivity + voltageDb : null;
  const halfSensitivity = oneW !== null && spaceDb !== null ? oneW + spaceDb : null;
  const rawPower = num(record.continuous_power_w);
  const power = rawPower > 0 ? rawPower : null;
  const rawContinuous = num(record.published_max_continuous_spl_db_1m);
  const rawPeak = num(record.published_max_peak_spl_db_1m);
  const continuous = rawContinuous !== null && spaceDb !== null ? rawContinuous + spaceDb : null;
  const peak = rawPeak !== null && spaceDb !== null ? rawPeak + spaceDb : null;
  const rawCalculated = oneW !== null && power !== null ? oneW + 10 * Math.log10(power) : null;
  const calculated = halfSensitivity !== null && power !== null ? halfSensitivity + 10 * Math.log10(power) : null;
  const warnings = [
    spaceDb === null ? 'Measurement basis needs confirmation: enter Full Space or Half Space' : null,
    sensitivity === null ? 'Missing sensitivity' : null,
    voltageDb === null ? 'Sensitivity reference or impedance needs confirmation' : null,
    power === null ? 'Missing continuous/RMS/AES power' : null,
  ].filter(Boolean);
  const eligible = warnings.length === 0;
  return {
    ...record,
    normalized_sensitivity_db_1w_1m: oneW,
    voltage_to_1w_correction_db: voltageDb,
    measurement_basis_status: spaceDb === null ? 'Needs confirmation' : 'Confirmed by source field',
    space_correction_db: spaceDb,
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
