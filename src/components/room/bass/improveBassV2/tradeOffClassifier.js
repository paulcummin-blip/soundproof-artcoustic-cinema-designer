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
// Trade-offs are NOT hard rejections — they are DESIGNER CHOICES.
// The designer chooses which priority matters more for the project.
//
// HARD REJECTIONS remain for:
//   - P14/P18 level regression (checked by caller)
//   - Primary seat LEVEL regression (checked here + caller)
//   - Muted subs (checked by caller)
//   - Output failure (checked by caller)
//
// The same-level raw-regression guard (>= 1.0 dB worsening within the same
// displayed level) is NOT a hard rejection here — it is the TRADE-OFF SIGNAL.
// It is reclassified from the existing hasPrimarySeatRegression hard veto to
// a trade-off indicator when another parameter materially improves.
// ---------------------------------------------------------------------------

const MATERIAL_RAW_THRESHOLD_DB = 1.0;  // material raw improvement or worsening
const PRIMARY_RAW_WORSENING_THRESHOLD_DB = 1.0;  // same as materialityGate

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
 *
 * @param {object} candidateResult - candidate canonical result with perSeatP19/P20
 * @param {object} currentResult - current design result with perSeatP19/P20
 * @returns {{ regressed: boolean, seatId?: string, parameter?: string, currentLevel?: number, candidateLevel?: number }}
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
 * Find the worst primary-seat same-level raw worsening (trade-off signal).
 * Only checks seats where the displayed level is preserved but raw deviation worsens.
 *
 * @param {object} candidateResult
 * @param {object} currentResult
 * @returns {{ worsened: boolean, seatId?: string, parameter?: string, beforeRaw?: number, afterRaw?: number, delta?: number }}
 */
export function hasPrimarySeatRawWorsening(candidateResult, currentResult) {
  const candidateP19 = Array.isArray(candidateResult?.perSeatP19) ? candidateResult.perSeatP19 : [];
  const candidateP20 = Array.isArray(candidateResult?.perSeatP20) ? candidateResult.perSeatP20 : [];
  const currentP19Map = new Map((Array.isArray(currentResult?.perSeatP19) ? currentResult.perSeatP19 : []).map(s => [String(s.seatId), s]));
  const currentP20Map = new Map((Array.isArray(currentResult?.perSeatP20) ? currentResult.perSeatP20 : []).map(s => [String(s.seatId), s]));

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
  for (const seat of candidateP20) {
    if (!seat.isPrimary) continue;
    const currentSeat = currentP20Map.get(String(seat.seatId));
    if (!currentSeat) continue;
    const candidateLevel = numericLevel(seat.level);
    const currentLevel = numericLevel(currentSeat.level);
    if (candidateLevel !== currentLevel) continue;
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
 * Find the best primary-seat material improvement (level or raw).
 *
 * @param {object} candidateResult
 * @param {object} currentResult
 * @returns {{ improved: boolean, parameter?: string, seatId?: string, beforeLevel?: number, afterLevel?: number, beforeRaw?: number, afterRaw?: number, delta?: number, isLevelChange?: boolean }}
 */
function findBestPrimaryImprovement(candidateResult, currentResult) {
  const candidateP19 = Array.isArray(candidateResult?.perSeatP19) ? candidateResult.perSeatP19 : [];
  const candidateP20 = Array.isArray(candidateResult?.perSeatP20) ? candidateResult.perSeatP20 : [];
  const currentP19Map = new Map((Array.isArray(currentResult?.perSeatP19) ? currentResult.perSeatP19 : []).map(s => [String(s.seatId), s]));
  const currentP20Map = new Map((Array.isArray(currentResult?.perSeatP20) ? currentResult.perSeatP20 : []).map(s => [String(s.seatId), s]));

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
  for (const seat of candidateP20) {
    if (!seat.isPrimary) continue;
    const currentSeat = currentP20Map.get(String(seat.seatId));
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
      const rawDelta = curRaw - candRaw;
      if (rawDelta >= MATERIAL_RAW_THRESHOLD_DB && rawDelta > best.delta) {
        best = { improved: true, parameter: "P20", seatId: seat.seatId, beforeLevel: currentLevel, afterLevel: candidateLevel, beforeRaw: curRaw, afterRaw: candRaw, delta: rawDelta, isLevelChange: false };
      }
    }
  }
  return best;
}

/**
 * Classify a candidate as a verified trade-off.
 *
 * A trade-off requires:
 *   1. No primary seat LEVEL regression (hard safety — caller also checks)
 *   2. Material improvement in one parameter (P19 or P20)
 *   3. Material worsening in a DIFFERENT parameter (P19 or P20, same-level raw)
 *
 * @param {object} currentResult - baseline canonical result
 * @param {object} candidateResult - candidate canonical result
 * @returns {{ isTradeOff: boolean, improvement?: object, worsening?: object, neutralText?: string, rejectReason?: string }}
 */
export function classifyVerifiedTradeOff(currentResult, candidateResult) {
  if (!currentResult || !candidateResult) {
    return { isTradeOff: false, rejectReason: "Missing result data" };
  }

  // 1. Hard safety: no primary seat LEVEL regression
  const levelRegression = hasPrimarySeatLevelRegression(candidateResult, currentResult);
  if (levelRegression.regressed) {
    return { isTradeOff: false, rejectReason: `Primary seat ${levelRegression.seatId} ${levelRegression.parameter} level regression (L${levelRegression.currentLevel} → L${levelRegression.candidateLevel})` };
  }

  // 2. Find material improvement
  const improvement = findBestPrimaryImprovement(candidateResult, currentResult);
  if (!improvement.improved) {
    return { isTradeOff: false, rejectReason: "No material improvement in any parameter" };
  }

  // 3. Find material worsening in a DIFFERENT parameter
  const worsening = hasPrimarySeatRawWorsening(candidateResult, currentResult);
  if (!worsening.worsened) {
    return { isTradeOff: false, rejectReason: "No material worsening — this is a pure improvement, not a trade-off" };
  }
  if (worsening.parameter === improvement.parameter) {
    return { isTradeOff: false, rejectReason: "Improvement and worsening in the same parameter — not a trade-off" };
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
  const impParam = improvement.parameter;
  const worsenParam = worsening.parameter;

  // Map parameter to plain-language objective
  const objectiveLabel = (param) => param === "P19" ? "frequency response at the primary seat(s)" : "consistency between seats";
  const improvementLabel = (imp) => {
    if (imp.isLevelChange) {
      return `${impParam}: ${levelText(imp.beforeLevel)} → ${levelText(imp.afterLevel)}`;
    }
    return `${impParam}: ${imp.beforeRaw.toFixed(1)} → ${imp.afterRaw.toFixed(1)} dB`;
  };
  const worseningLabel = (w) => `${worsenParam}: ${w.beforeRaw.toFixed(1)} → ${w.afterRaw.toFixed(1)} dB`;

  return `Improves ${objectiveLabel(impParam)}, but reduces ${objectiveLabel(worsenParam)}. ` +
    `Choose based on whether the primary listening position or overall seating consistency is more important for this project. ` +
    `(${improvementLabel(improvement)}; ${worseningLabel(worsening)})`;
}

/**
 * Build the headline summary for a trade-off card.
 * Returns { improvesText, reducesText } in neutral language.
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