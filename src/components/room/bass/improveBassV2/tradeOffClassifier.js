// tradeOffClassifier.js
// ---------------------------------------------------------------------------
// Classifies canonically verified candidates as VERIFIED TRADE-OFFS when they
// materially improve one important objective while materially worsening another.
//
// A VERIFIED TRADE-OFF requires ALL of:
//   - P14 preserved (output pass, meets target — checked by caller)
//   - P18 preserved (no level regression — checked by caller)
//   - No primary seat LEVEL regression (P19 or P20) — hard safety
//   - No muted subs — hard safety (checked by caller)
//   - Material improvement in one objective (P19 or P20: level OR raw >= 1.0 dB)
//   - Material worsening in another objective (P19 or P20: same-level raw >= 1.0 dB)
//
// P19 = frequency response at the PRIMARY seat(s) — assessed on primary seats only.
// P20 = seat-to-seat consistency — assessed on the WORST seat across ALL seats,
//       not just primary, because P20 is a project-level consistency metric.
//
// Trade-offs are NOT hard rejections — they are DESIGNER CHOICES.
// The designer chooses which priority matters more for the project.
//
// HARD REJECTIONS remain for:
//   - P14/P18 level regression (checked by caller)
//   - Primary seat LEVEL regression (checked here + caller)
//   - Muted subs (checked by caller)
//   - Output failure (checked by caller)
//
// MATERIALITY: both the improvement and the worsening must be >= 1.0 dB
// (for same-level raw) or >= 1 level (for level changes). A 0.1 dB movement
// in either direction does NOT create a trade-off.
// ---------------------------------------------------------------------------

import { countFailingSeats } from "./zeroFailOptimiser.js";

const MATERIAL_RAW_THRESHOLD_DB = 1.0;  // material raw improvement or worsening
const PRIMARY_RAW_WORSENING_THRESHOLD_DB = 1.0;  // same as materialityGate
const SOUND_SPEED_M_PER_MS = 0.343;  // 343 m/s → m per ms

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function levelText(level) {
  const n = numericLevel(level);
  return n > 0 ? `L${n}` : "FAIL";
}

/**
 * Check for primary seat LEVEL regression only (hard safety).
 * Does NOT check same-level raw worsening — that is a trade-off signal.
 */
export function hasPrimarySeatLevelRegression(candidateResult, currentResult) {
  const candidateP19 = Array.isArray(candidateResult?.perSeatP19) ? candidateResult.perSeatP19 : [];
  const candidateP20 = Array.isArray(candidateResult?.perSeatP20) ? candidateResult.perSeatP20 : [];
  const currentP19Map = new Map((Array.isArray(currentResult?.perSeatP19) ? currentResult.perSeatP19 : []).map(s => [String(s.seatId), s]));
  const currentP20Map = new Map((Array.isArray(currentResult?.perSeatP20) ? currentResult.perSeatP20 : []).map(s => [String(s.seatId), s]));

  for (const seat of candidateP19) {
    if (!seat.isPrimary) continue;
    const currentSeat = currentP19Map.get(String(seat.seatId));
    if (!currentSeat) continue;
    const candidateLevel = numericLevel(seat.level);
    const currentLevel = numericLevel(currentSeat.level);
    if (candidateLevel < currentLevel) {
      return { regressed: true, seatId: seat.seatId, parameter: "P19", currentLevel, candidateLevel };
    }
  }
  for (const seat of candidateP20) {
    if (!seat.isPrimary) continue;
    const currentSeat = currentP20Map.get(String(seat.seatId));
    if (!currentSeat) continue;
    const candidateLevel = numericLevel(seat.level);
    const currentLevel = numericLevel(currentSeat.level);
    if (candidateLevel < currentLevel) {
      return { regressed: true, seatId: seat.seatId, parameter: "P20", currentLevel, candidateLevel };
    }
  }
  return { regressed: false };
}

/**
 * Find the best P19 primary-seat material improvement (level or raw).
 * P19 is a primary-seat metric — only primary seats are assessed.
 */
export function findBestP19Improvement(candidateResult, currentResult) {
  const candidateP19 = Array.isArray(candidateResult?.perSeatP19) ? candidateResult.perSeatP19 : [];
  const currentP19Map = new Map((Array.isArray(currentResult?.perSeatP19) ? currentResult.perSeatP19 : []).map(s => [String(s.seatId), s]));

  let best = { improved: false, delta: 0 };

  for (const seat of candidateP19) {
    if (!seat.isPrimary) continue;
    const currentSeat = currentP19Map.get(String(seat.seatId));
    if (!currentSeat) continue;
    const candidateLevel = numericLevel(seat.level);
    const currentLevel = numericLevel(currentSeat.level);
    if (candidateLevel > currentLevel) {
      const delta = candidateLevel - currentLevel;
      if (delta > best.delta) {
        best = { improved: true, parameter: "P19", seatId: seat.seatId, beforeLevel: currentLevel, afterLevel: candidateLevel, isLevelChange: true, delta };
      }
    } else if (candidateLevel === currentLevel) {
      const candRaw = Math.abs(Number(seat.variationDbRaw) || 0);
      const curRaw = Math.abs(Number(currentSeat.variationDbRaw) || 0);
      const rawDelta = curRaw - candRaw; // positive = improvement
      if (rawDelta >= MATERIAL_RAW_THRESHOLD_DB && rawDelta > best.delta) {
        best = { improved: true, parameter: "P19", seatId: seat.seatId, beforeLevel: currentLevel, afterLevel: candidateLevel, beforeRaw: curRaw, afterRaw: candRaw, delta: rawDelta, isLevelChange: false };
      }
    }
  }
  return best;
}

/**
 * Find the best P20 worst-seat material improvement (level or raw).
 * P20 is a seat-consistency metric — assessed on the WORST seat across ALL seats.
 */
export function findBestP20Improvement(candidateResult, currentResult) {
  const candidateP20 = Array.isArray(candidateResult?.perSeatP20) ? candidateResult.perSeatP20 : [];
  const currentP20Map = new Map((Array.isArray(currentResult?.perSeatP20) ? currentResult.perSeatP20 : []).map(s => [String(s.seatId), s]));

  const REF_IDS = new Set(["rsp", "mlp", "synthetic-rsp", "synthetic_rsp"]);

  let best = { improved: false, delta: 0 };

  for (const seat of candidateP20) {
    const id = String(seat.seatId || "");
    if (REF_IDS.has(id.toLowerCase())) continue;
    const currentSeat = currentP20Map.get(id);
    if (!currentSeat) continue;
    const candidateLevel = numericLevel(seat.level);
    const currentLevel = numericLevel(currentSeat.level);
    if (candidateLevel > currentLevel) {
      const delta = candidateLevel - currentLevel;
      if (delta > best.delta) {
        best = { improved: true, parameter: "P20", seatId: seat.seatId, beforeLevel: currentLevel, afterLevel: candidateLevel, isLevelChange: true, delta };
      }
    } else if (candidateLevel === currentLevel) {
      const candRaw = Math.abs(Number(seat.variationDbRaw) || 0);
      const curRaw = Math.abs(Number(currentSeat.variationDbRaw) || 0);
      const rawDelta = curRaw - candRaw; // positive = improvement
      if (rawDelta >= MATERIAL_RAW_THRESHOLD_DB && rawDelta > best.delta) {
        best = { improved: true, parameter: "P20", seatId: seat.seatId, beforeLevel: currentLevel, afterLevel: candidateLevel, beforeRaw: curRaw, afterRaw: candRaw, delta: rawDelta, isLevelChange: false };
      }
    }
  }
  return best;
}

/**
 * Find the best material improvement across P19 (primary) and P20 (worst seat).
 */
function findBestImprovement(candidateResult, currentResult) {
  const p19 = findBestP19Improvement(candidateResult, currentResult);
  const p20 = findBestP20Improvement(candidateResult, currentResult);
  if (p19.improved && p20.improved) {
    // Return the one with the larger delta (level change counts as 10 per level)
    const p19Score = p19.isLevelChange ? p19.delta * 10 : p19.delta;
    const p20Score = p20.isLevelChange ? p20.delta * 10 : p20.delta;
    return p19Score >= p20Score ? p19 : p20;
  }
  return p19.improved ? p19 : p20;
}

/**
 * Find P19 primary-seat same-level raw worsening (trade-off signal).
 * Only checks seats where the displayed level is preserved but raw deviation worsens.
 */
export function findP19Worsening(candidateResult, currentResult) {
  const candidateP19 = Array.isArray(candidateResult?.perSeatP19) ? candidateResult.perSeatP19 : [];
  const currentP19Map = new Map((Array.isArray(currentResult?.perSeatP19) ? currentResult.perSeatP19 : []).map(s => [String(s.seatId), s]));

  let worst = { worsened: false, delta: 0 };

  for (const seat of candidateP19) {
    if (!seat.isPrimary) continue;
    const currentSeat = currentP19Map.get(String(seat.seatId));
    if (!currentSeat) continue;
    const candidateLevel = numericLevel(seat.level);
    const currentLevel = numericLevel(currentSeat.level);
    if (candidateLevel !== currentLevel) continue; // only same-level
    const candRaw = Math.abs(Number(seat.variationDbRaw) || 0);
    const curRaw = Math.abs(Number(currentSeat.variationDbRaw) || 0);
    const delta = candRaw - curRaw;
    if (delta > worst.delta) {
      worst = { worsened: delta > PRIMARY_RAW_WORSENING_THRESHOLD_DB, seatId: seat.seatId, parameter: "P19", beforeRaw: curRaw, afterRaw: candRaw, delta };
    }
  }
  return worst;
}

/**
 * Find P20 worst-seat same-level raw worsening (trade-off signal).
 * Checks ALL seats (not just primary) because P20 is a seat-consistency metric.
 */
export function findP20Worsening(candidateResult, currentResult) {
  const candidateP20 = Array.isArray(candidateResult?.perSeatP20) ? candidateResult.perSeatP20 : [];
  const currentP20Map = new Map((Array.isArray(currentResult?.perSeatP20) ? currentResult.perSeatP20 : []).map(s => [String(s.seatId), s]));

  const REF_IDS = new Set(["rsp", "mlp", "synthetic-rsp", "synthetic_rsp"]);

  let worst = { worsened: false, delta: 0 };

  for (const seat of candidateP20) {
    const id = String(seat.seatId || "");
    if (REF_IDS.has(id.toLowerCase())) continue;
    const currentSeat = currentP20Map.get(id);
    if (!currentSeat) continue;
    const candidateLevel = numericLevel(seat.level);
    const currentLevel = numericLevel(currentSeat.level);
    if (candidateLevel !== currentLevel) continue; // only same-level
    const candRaw = Math.abs(Number(seat.variationDbRaw) || 0);
    const curRaw = Math.abs(Number(currentSeat.variationDbRaw) || 0);
    const delta = candRaw - curRaw;
    if (delta > worst.delta) {
      worst = { worsened: delta > PRIMARY_RAW_WORSENING_THRESHOLD_DB, seatId: seat.seatId, parameter: "P20", beforeRaw: curRaw, afterRaw: candRaw, delta };
    }
  }
  return worst;
}

/**
 * Find material worsening in a specific parameter.
 */
function findWorseningFor(parameter, candidateResult, currentResult) {
  if (parameter === "P19") return findP19Worsening(candidateResult, currentResult);
  if (parameter === "P20") return findP20Worsening(candidateResult, currentResult);
  return { worsened: false };
}

/**
 * Classify a candidate as a verified trade-off.
 *
 * A trade-off requires:
 *   1. No primary seat LEVEL regression (hard safety — caller also checks)
 *   2. Material improvement in one parameter (P19 primary or P20 worst-seat)
 *   3. Material worsening in a DIFFERENT parameter (same-level raw >= 1.0 dB)
 *
 * @param {object} currentResult - baseline canonical result
 * @param {object} candidateResult - candidate canonical result
 * @returns {{ isTradeOff: boolean, improvement?: object, worsening?: object, neutralText?: string, rejectReason?: string }}
 */
export function classifyVerifiedTradeOff(currentResult, candidateResult) {
  if (!currentResult || !candidateResult) {
    return { isTradeOff: false, rejectReason: "Missing result data" };
  }

  // Zero-fail-first: fail-count reduction is a material improvement, not a
  // trade-off. The blanket primary-seat regression veto has been removed.
  if (countFailingSeats(candidateResult) < countFailingSeats(currentResult)) {
    return { isTradeOff: false, rejectReason: "Failing-seat count reduced \u2014 material improvement" };
  }

  // 1. (Removed) Blanket primary-seat LEVEL regression veto.
  //    The zero-fail-first policy allows trading a strong primary seat to
  //    eliminate FAILs elsewhere. Primary-seat regressions are no longer a
  //    blanket hard-safety rejection.

  // 2. Find material improvement
  const improvement = findBestImprovement(candidateResult, currentResult);
  if (!improvement.improved) {
    return { isTradeOff: false, rejectReason: "No material improvement in any parameter" };
  }

  // 3. Find material worsening in a DIFFERENT parameter
  const worseningParameter = improvement.parameter === "P19" ? "P20" : "P19";
  const worsening = findWorseningFor(worseningParameter, candidateResult, currentResult);
  if (!worsening.worsened) {
    return { isTradeOff: false, rejectReason: "No material worsening — this is a pure improvement, not a trade-off" };
  }

  // 4. Build neutral presentation
  const neutralText = buildNeutralTradeOffText(improvement, worsening);

  return {
    isTradeOff: true,
    improvement,
    worsening,
    neutralText,
  };
}

/**
 * Build neutral, non-judgemental trade-off presentation text.
 * Never uses: "better", "worse", "recommended", "poor choice".
 */
function buildNeutralTradeOffText(improvement, worsening) {
  const objectiveLabel = (param) => param === "P19" ? "frequency response at the primary seat(s)" : "consistency between seats";
  const improvementLabel = (imp) => {
    if (imp.isLevelChange) {
      return `${levelText(imp.beforeLevel)} → ${levelText(imp.afterLevel)}`;
    }
    return `${imp.beforeRaw.toFixed(1)} → ${imp.afterRaw.toFixed(1)} dB`;
  };
  const worseningLabel = (w) => `${w.beforeRaw.toFixed(1)} → ${w.afterRaw.toFixed(1)} dB`;

  return `Improves ${objectiveLabel(improvement.parameter)}, but reduces ${objectiveLabel(worsening.parameter)}. ` +
    `Choose based on whether the primary listening position or overall seating consistency is more important for this project. ` +
    `(${improvementLabel(improvement)}; ${worseningLabel(worsening)})`;
}

/**
 * Build the headline summary for a trade-off card.
 * Returns { improvesLabel, improvesText, reducesLabel, reducesText } in neutral language.
 */
export function buildTradeOffSummary(improvement, worsening) {
  const objectiveLabel = (param) => param === "P19" ? "Primary response" : "Seat consistency";
  const improvementText = (imp) => {
    if (imp.isLevelChange) {
      return `${levelText(imp.beforeLevel)} → ${levelText(imp.afterLevel)}`;
    }
    return `${imp.beforeRaw.toFixed(1)} → ${imp.afterRaw.toFixed(1)} dB`;
  };
  return {
    improvesLabel: objectiveLabel(improvement.parameter),
    improvesText: improvementText(improvement),
    reducesLabel: objectiveLabel(worsening.parameter),
    reducesText: `${worsening.beforeRaw.toFixed(1)} → ${worsening.afterRaw.toFixed(1)} dB`,
  };
}

/**
 * Compute the acoustic path-length equivalent for a delay in milliseconds.
 * Speed of sound ≈ 343 m/s → 1 ms = 0.343 m = 34.3 cm.
 *
 * @param {number} delayMs - delay in milliseconds
 * @returns {number} path length in centimeters
 */
export function delayToPathLengthCm(delayMs) {
  return Math.round(Math.abs(Number(delayMs) || 0) * SOUND_SPEED_M_PER_MS * 100);
}