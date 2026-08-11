// src/components/utils/rp22/p10RspNormalisation.js
// Pure helper for RP22 Parameter 10 — upper speaker SPL spread normalised to RSP.
//
// Canonical RP22 definition: each upper channel is normalised against that same
// channel at the effective RSP *before* computing the spread.
//
//   normalisedDelta = seatChannelSpl − rspChannelSpl
//   p10Spread      = max(normalisedDelta values) − min(normalisedDelta values)
//
// Authority rules:
//   - Match seat and RSP values by canonical upper-channel role.
//   - Include only channels with finite SPL at both the seat and the RSP.
//   - Do not substitute another channel when an RSP value is missing.
//   - Preserve existing insufficient-data behaviour (< 2 valid channels → null).
//   - P10 is independent from P9 and P6.

import { resolveRp22DesignValue } from "./resolveRp22DesignValue";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Canonical upper channels per RP22 spec (exactly these six)
export const P10_UPPER_ROLES = ['TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR'];

// P10 thresholds (unchanged):
// L4 ≤ 2 dB, L3 ≤ 5 dB, L2 ≤ 8 dB, L1 > 8 dB
function gradeP10(spreadDb) {
  if (!isNum(spreadDb)) return '—';
  if (spreadDb <= 2) return 4;
  if (spreadDb <= 5) return 3;
  if (spreadDb <= 8) return 2;
  return 1;
}

/**
 * Compute P10 spread normalised to RSP.
 *
 * @param {Object} seatUppers - { TFL: { value }, TFR: { value }, ... }
 * @param {Object} rspUppers  - { TFL: { value }, TFR: { value }, ... }
 * @returns {Object|null} { spread, deltaRounded, level, formatted, rolesUsed, normalisedDeltas }
 *                        or null when fewer than 2 channels have finite SPL at both.
 */
export function computeP10RspNormalisedSpread(seatUppers, rspUppers) {
  if (!seatUppers || !rspUppers) return null;

  const normalisedDeltas = [];
  const rolesUsed = [];

  for (const role of P10_UPPER_ROLES) {
    const seatVal = seatUppers[role]?.value;
    const rspVal  = rspUppers[role]?.value;
    // Include only channels with finite SPL at both the seat and RSP
    if (isNum(seatVal) && isNum(rspVal)) {
      normalisedDeltas.push(seatVal - rspVal);
      rolesUsed.push(role);
    }
  }

  // Preserve existing insufficient-data behaviour
  if (normalisedDeltas.length < 2) return null;

  const maxNorm = Math.max(...normalisedDeltas);
  const minNorm = Math.min(...normalisedDeltas);
  const spread = maxNorm - minNorm;

  // Sound Proof 1 dB design floor — favourable whole-dB quantisation for
  // ordinary dB difference parameters (Group A).
  const deltaRounded = resolveRp22DesignValue(10, spread);
  const level = gradeP10(deltaRounded);

  return {
    spread,
    deltaRounded,
    level,
    formatted: `±${deltaRounded} dB`,
    rolesUsed,
    normalisedDeltas,
  };
}