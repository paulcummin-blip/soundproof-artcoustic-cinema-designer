/**
 * buildBassAuthority.js
 * --------------------------------
 * Layer 1 — Bass interpreted engineering sub-authority.
 * Returns P14, P18, P19, P20 with engineering interpretation.
 * Pure function. No GPT. No side effects.
 *
 * Inputs:
 *   completedBassAuthority    — from useCompletedBassAuthority
 *   completedBassPresentation  — from buildComplianceBassPresentation
 */

import { CONFIDENCE, withConfidence, notCalculated, SOURCE } from './confidence';

function isBassAvailable(completedBassAuthority, completedBassPresentation) {
  const contract = completedBassAuthority?.contract;
  const isAuthoritative = completedBassAuthority?.authoritative === true;
  const publicationVerified = completedBassPresentation?.publicationVerified === true;
  const hasParams = completedBassPresentation?.parameters;
  return !!(contract && isAuthoritative && publicationVerified && hasParams);
}

function buildP14Authority(presentation, authority) {
  const p14 = presentation?.parameters?.p14;
  if (!p14) return { ...notCalculated('P14 bass SPL capability not calculated.'), parameter_id: 14, parameter_key: 'p14' };

  const achievedDb = p14.achievedCapabilityDb;
  const targetDb = p14.requestedTargetDb;
  const level = p14.achievedLevel;
  const selectedLevel = p14.selectedLevel;
  const headroom = p14.headroomOrShortfallDb;
  const pass = p14.pass;

  let statement;
  if (pass === true) {
    statement = `Bass system achieves ${achievedDb != null ? achievedDb.toFixed(0) + ' dB SPL' : 'the target'} at the reference position${targetDb != null ? ' against a ' + targetDb.toFixed(0) + ' dB target' : ''}${headroom != null ? ` with ${headroom > 0 ? headroom.toFixed(0) + ' dB headroom' : Math.abs(headroom).toFixed(0) + ' dB shortfall'}` : ''}.`;
  } else if (pass === false) {
    statement = `Bass system achieves ${achievedDb != null ? achievedDb.toFixed(0) + ' dB SPL' : '—'} at the reference position, falling short of the ${targetDb != null ? targetDb.toFixed(0) + ' dB ' : ''}target${headroom != null ? ` by ${Math.abs(headroom).toFixed(0)} dB` : ''}.`;
  } else {
    statement = `Bass SPL capability: ${achievedDb != null ? achievedDb.toFixed(0) + ' dB' : 'not calculated'} at the reference position.`;
  }

  return {
    parameter_id: 14,
    parameter_key: 'p14',
    title: 'LFE / bass SPL capability at RSP',
    achieved_level: level || 'N/A',
    selected_level: selectedLevel || null,
    achieved_capability_db: achievedDb ?? null,
    requested_target_db: targetDb ?? null,
    headroom_or_shortfall_db: headroom ?? null,
    pass: pass,
    target_basis: p14.targetBasis || null,
    target_basis_label: p14.targetBasisLabel || null,
    engineering_meaning: statement,
    confidence: CONFIDENCE.MODEL_DEPENDENT,
    source: SOURCE.BASS_SIMULATION,
  };
}

function buildP18Authority(presentation) {
  const p18 = presentation?.parameters?.p18;
  if (!p18) return { ...notCalculated('P18 bass extension not calculated.'), parameter_id: 18, parameter_key: 'p18' };

  const designHz = p18.designHz;
  const qualified = p18.qualifiedAtSelectedP14Output !== false;
  const level = p18.level;

  let statement;
  if (Number.isFinite(designHz)) {
    statement = qualified
      ? `In-room bass extension reaches ${designHz.toFixed(0)} Hz (-3 dB point) at the selected P14 operating level, qualifying for ${level || 'the achieved'} performance level.`
      : `In-room bass extension reaches ${designHz.toFixed(0)} Hz (-3 dB point), but does not qualify at the selected P14 operating level.`;
  } else {
    statement = 'Bass extension not calculated.';
  }

  return {
    parameter_id: 18,
    parameter_key: 'p18',
    title: 'In-room bass extension (-3 dB)',
    achieved_level: level || 'N/A',
    design_hz: designHz ?? null,
    qualified_at_selected_p14: qualified,
    target_basis: p18.targetBasis || null,
    target_basis_label: p18.targetBasisLabel || null,
    engineering_meaning: statement,
    confidence: CONFIDENCE.MODEL_DEPENDENT,
    source: SOURCE.BASS_SIMULATION,
  };
}

function buildP19Authority(presentation, authority) {
  const p19 = presentation?.parameters?.p19;
  if (!p19) return { ...notCalculated('P19 bass smoothness not calculated.'), parameter_id: 19, parameter_key: 'p19' };

  const rawValue = p19.rawValue;
  const level = p19.level;

  let statement;
  if (Number.isFinite(rawValue)) {
    const deviation = Math.abs(rawValue).toFixed(0);
    statement = `Low-frequency response at the reference position deviates by ±${deviation} dB from the target curve below the room transition frequency, achieving ${level || '—'}.`;
  } else {
    statement = 'Bass smoothness not calculated.';
  }

  // Per-seat P19 results
  const perSeatResults = authority?.contract?.selectedCandidate?.perSeatP19Results;
  const perSeat = Array.isArray(perSeatResults)
    ? perSeatResults.map((s) => ({
        seat_id: s.seatId,
        variation_db_raw: Number.isFinite(s.variationDbRaw) ? Number(s.variationDbRaw) : null,
        level: s.level || null,
      }))
    : [];

  return {
    parameter_id: 19,
    parameter_key: 'p19',
    title: 'LF response vs target at RSP',
    achieved_level: level || 'N/A',
    raw_value: Number.isFinite(rawValue) ? Number(rawValue) : null,
    engineering_meaning: statement,
    per_seat: perSeat,
    confidence: CONFIDENCE.MODEL_DEPENDENT,
    source: SOURCE.BASS_SIMULATION,
  };
}

function buildP20Authority(presentation, authority) {
  const p20 = presentation?.parameters?.p20;
  if (!p20) return { ...notCalculated('P20 bass consistency not calculated.'), parameter_id: 20, parameter_key: 'p20' };

  const rawValue = p20.rawValue;
  const level = p20.level;

  let statement;
  if (Number.isFinite(rawValue)) {
    const deviation = Math.abs(rawValue).toFixed(0);
    statement = `Seat-to-seat bass consistency varies by ±${deviation} dB below the room transition frequency relative to the reference position, achieving ${level || '—'}.`;
  } else {
    statement = 'Bass consistency not calculated.';
  }

  // Per-seat P20 results
  const perSeatResults = presentation?.perSeatP20Results;
  const perSeat = Array.isArray(perSeatResults)
    ? perSeatResults.map((s) => ({
        seat_id: s.seatId,
        variation_db_raw: Number.isFinite(s.variationDbRaw) ? Number(s.variationDbRaw) : null,
        level: s.level || null,
      }))
    : [];

  return {
    parameter_id: 20,
    parameter_key: 'p20',
    title: 'Seat-to-seat LF consistency',
    achieved_level: level || 'N/A',
    raw_value: Number.isFinite(rawValue) ? Number(rawValue) : null,
    engineering_meaning: statement,
    per_seat: perSeat,
    confidence: CONFIDENCE.MODEL_DEPENDENT,
    source: SOURCE.BASS_SIMULATION,
  };
}

export function buildBassAuthority(completedBassAuthority, completedBassPresentation) {
  if (!isBassAvailable(completedBassAuthority, completedBassPresentation)) {
    return {
      available: false,
      p14: { ...notCalculated('P14 bass SPL capability not calculated.'), parameter_id: 14, parameter_key: 'p14' },
      p18: { ...notCalculated('P18 bass extension not calculated.'), parameter_id: 18, parameter_key: 'p18' },
      p19: { ...notCalculated('P19 bass smoothness not calculated.'), parameter_id: 19, parameter_key: 'p19' },
      p20: { ...notCalculated('P20 bass consistency not calculated.'), parameter_id: 20, parameter_key: 'p20' },
      subwoofer_strategy_summary: 'Bass analysis not available.',
      confidence: CONFIDENCE.NOT_CALCULATED,
    };
  }

  const p14 = buildP14Authority(completedBassPresentation, completedBassAuthority);
  const p18 = buildP18Authority(completedBassPresentation);
  const p19 = buildP19Authority(completedBassPresentation, completedBassAuthority);
  const p20 = buildP20Authority(completedBassPresentation, completedBassAuthority);

  // Build summary
  const subCount = completedBassAuthority?.contract?.selectedCandidate?.sources?.length || 0;
  const summary = subCount > 0
    ? `Bass analysis is authoritative based on ${subCount} subwoofer${subCount !== 1 ? 's' : ''} with calibrated gain, delay, and polarity settings.`
    : 'Bass analysis is authoritative.';

  return {
    available: true,
    p14,
    p18,
    p19,
    p20,
    subwoofer_strategy_summary: withConfidence(summary, CONFIDENCE.MODEL_DEPENDENT, SOURCE.BASS_SIMULATION).statement,
    confidence: CONFIDENCE.MODEL_DEPENDENT,
    source: SOURCE.BASS_SIMULATION,
  };
}