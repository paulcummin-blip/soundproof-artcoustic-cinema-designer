/**
 * artcousticSystemDesignRating.js
 * --------------------------------
 * Pure rating authority/scoring adapter for the Artcoustic System Design Rating.
 *
 * Consumes already-calculated canonical Sound Proof results and existing
 * RP22 parameter thresholds, and converts them into:
 *   - Room Artcoustic System Design Rating
 *   - Individual seat Artcoustic System Design Ratings
 *   - Provisional / coverage state
 *
 * This is proprietary Sound Proof logic. It is NOT CEDIA RP22 or RP23.
 * The rating rewards exceptional L4 performance substantially more than
 * minimum L1 performance, and strongly penalises genuinely poor designs
 * that fall below every applicable RP22 performance level.
 *
 * Pure: no React, no UI, no database, no side effects.
 * Does NOT calculate acoustics — only interprets existing canonical results
 * against existing threshold definitions.
 */

import { RP22_CATALOG } from "@/components/data/rp22Catalog";
import { resolveParamThresholds } from "@/components/report/technical/roomParameterLevelAuthority";
import {
  levelP4_screenDelta,
  levelP5_surSpacing,
  levelP6_surDelta,
  levelP9_upperSpacing,
  levelP10_upperDelta,
  levelP16_screenFR,
  levelP17_wsFR,
  levelP20_lfConsistency,
} from "@/components/utils/rp22/levels";
import { rp23LevelForAngleDeg } from "@/components/utils/viewingAngleUtils";
import gradeP1Distance from "@/components/utils/rp22/p1LevelAuthority";
import { isAuthoritativeBassContract } from "@/components/room/bass/completedBassResultPersistence";

// ═══════════════════════════════════════════════════════════════
// Fixed V1 constants
// ═══════════════════════════════════════════════════════════════

/** Fixed V1 importance weights per parameter. */
export const PARAM_WEIGHTS = Object.freeze({
  p1: 6, p2: 7, p3: 3, p4: 5, p5: 6, p6: 5, p7: 4,
  p8: 2, p9: 5, p10: 5, p11: 4, p12: 8, p13: 7, p14: 9,
  p15: 3, p16: 5, p17: 5, p18: 7, p19: 9, p20: 9, p21: 3,
  screen: 7,
});

/** Sum of all configured importance weights (derived from PARAM_WEIGHTS). */
export const TOTAL_WEIGHT = Object.values(PARAM_WEIGHTS).reduce((a, b) => a + b, 0);

/** Configured reference maximum (TOTAL_WEIGHT × 12). Not used as a fixed denominator. */
export const MAX_REFERENCE_POINTS = TOTAL_WEIGHT * 12;

/** Performance multipliers per level. */
export const LEVEL_MULTIPLIERS = Object.freeze({
  L4: 12, L3: 8, L2: 4, L1: 2, FAIL: -5,
});

/** V1 excluded assumption metrics — applicable but unscoreable, always provisional. */
export const V1_EXCLUDED_PARAMS = Object.freeze(new Set(["p8", "p15", "p21"]));

/** Bass-authority parameters that require explicit publication verification to score. */
const BASS_PARAMS = new Set(["p14", "p18", "p19", "p20"]);

/** Weight bonus applied to SPL capability parameters when assessed against Recommended targets. */
const RECOMMENDED_WEIGHT_BONUS = 2;

/** Parameters eligible for the Recommended weight bonus (SPL capability params only). */
const RECOMMENDED_WEIGHTED_PARAMS = new Set(["p12", "p13", "p14"]);

/** Derive the effective weight for a parameter based on its assessment mode and scoring state.
 *  Base weight is used unless the parameter is P12/P13/P14, mode is "recommended",
 *  and the parameter is actively scored. */
function getEffectiveWeight(key, mode, state) {
  if (RECOMMENDED_WEIGHTED_PARAMS.has(key) && mode === "recommended" && state === "scored") {
    return PARAM_WEIGHTS[key] + RECOMMENDED_WEIGHT_BONUS;
  }
  return PARAM_WEIGHTS[key];
}

/** Build a concise seat-level distribution string for seat-scope contributions.
 *  If all applicable seats share the same level, returns that level (e.g. "L4").
 *  If seats have mixed levels, returns "3×L4 · 2×L3 · 1×L1".
 *  FAIL seats are included in the distribution as "FAIL".
 *  Returns null if no applicable seats. */
function buildSeatDistribution(seatAuthorities, seatIds) {
  const counts = {};
  let total = 0;
  for (const seatId of seatIds) {
    const sa = seatAuthorities?.[seatId];
    if (!sa || sa.state === "na") continue;
    if (sa.state === "provisional") continue;
    const lvl = sa.level || "FAIL";
    counts[lvl] = (counts[lvl] || 0) + 1;
    total += 1;
  }
  if (total === 0) return null;
  const keys = Object.keys(counts);
  if (keys.length === 1) return keys[0];
  // Order: L4, L3, L2, L1, FAIL
  const order = ["L4", "L3", "L2", "L1", "FAIL"];
  return order
    .filter((k) => counts[k])
    .map((k) => `${counts[k]}×${k}`)
    .join(" · ");
}

/** Parameter scope: "room" (single room result) or "seat" (per-seat results). */
export const PARAM_SCOPE = Object.freeze({
  p1: "seat", p2: "room", p3: "room", p4: "seat", p5: "seat",
  p6: "seat", p7: "room", p8: "room", p9: "seat", p10: "seat",
  p11: "room", p12: "room", p13: "room", p14: "room", p15: "room",
  p16: "seat", p17: "seat", p18: "room", p19: "seat", p20: "seat",
  p21: "room", screen: "seat",
});

const SCORABLE_KEYS = Object.keys(PARAM_WEIGHTS).filter((k) => !V1_EXCLUDED_PARAMS.has(k));

// ═══════════════════════════════════════════════════════════════
// Bass publication guard helper (reuses existing authority)
// ═══════════════════════════════════════════════════════════════

/**
 * Check whether a completed bass authority has canonical publication verified.
 * Reuses the existing isAuthoritativeBassContract guard — does NOT duplicate
 * bass maths or publication logic.
 *
 * @param {Object} completedBassAuthority - The persisted bass authority object
 * @returns {boolean}
 */
export function isBassPublicationVerified(completedBassAuthority) {
  const contract = completedBassAuthority?.contract || null;
  return isAuthoritativeBassContract(contract);
}

// ═══════════════════════════════════════════════════════════════
// Input normalization
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize a single parameter input to a standard state representation.
 *
 * Accepted input forms:
 *   null / undefined           → provisional (missing)
 *   "na"                       → genuine N/A (provisional if requireVerified)
 *   "provisional"              → explicit provisional
 *   number                     → scored (provisional if requireVerified)
 *   { na: true }               → genuine N/A (provisional if requireVerified && verified !== true)
 *   { provisional: true }      → explicit provisional
 *   { indeterminate: true }    → provisional (indeterminate)
 *   { verified: false }        → provisional (not verified)
 *   { rawValue: number }       → scored (provisional if requireVerified && verified !== true)
 *
 * @param {*} input - The parameter input value
 * @param {boolean} requireVerified - When true (bass params), verified must
 *   explicitly equal true to score or N/A; otherwise fail-closed to provisional.
 */
function normalizeInput(input, requireVerified = false) {
  if (input == null) return { state: "provisional", rawValue: null, reason: "missing" };
  if (input === "na") {
    if (requireVerified) return { state: "provisional", rawValue: null, reason: "not-verified" };
    return { state: "na", rawValue: null, reason: null };
  }
  if (input === "provisional") return { state: "provisional", rawValue: null, reason: "explicit-provisional" };
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return { state: "provisional", rawValue: null, reason: "non-finite" };
    if (requireVerified) return { state: "provisional", rawValue: null, reason: "not-verified" };
    return { state: "scored", rawValue: input, reason: null };
  }
  if (typeof input === "object") {
    // Bass fail-closed: verified must explicitly equal true for N/A or scored
    if (requireVerified && input.verified !== true) {
      return { state: "provisional", rawValue: null, reason: "not-verified" };
    }
    if (input.na === true) return { state: "na", rawValue: null, reason: null };
    if (input.provisional === true) return { state: "provisional", rawValue: null, reason: input.reason || "explicit-provisional" };
    if (input.indeterminate === true) return { state: "provisional", rawValue: null, reason: "indeterminate" };
    if (input.level === "indeterminate") return { state: "provisional", rawValue: null, reason: "indeterminate" };
    if (input.verified === false) return { state: "provisional", rawValue: null, reason: "not-verified" };
    if (Number.isFinite(input.rawValue)) return { state: "scored", rawValue: input.rawValue, reason: null };
    return { state: "provisional", rawValue: null, reason: "no-raw-value" };
  }
  return { state: "provisional", rawValue: null, reason: "unrecognized" };
}

// ═══════════════════════════════════════════════════════════════
// Threshold application helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Wrap an existing RP22 level mapper.
 * If the mapper returns a valid level (L4-L1), use it.
 * If the mapper returns N/A for a finite value and canFail is true, return FAIL.
 * If the mapper returns N/A for a finite value and canFail is false, return L1
 * (open-ended lowest band — should not normally happen for finite values).
 */
function applyMapper(rawValue, mapperFn, canFail) {
  const result = mapperFn(rawValue);
  if (result.ok && result.level && /^L[1-4]$/.test(result.level)) {
    return { level: result.level };
  }
  return { level: canFail ? "FAIL" : "L1" };
}

/**
 * Apply catalog thresholds directly.
 * Handles min (>=) and max/±max/allowed/min-lower-is-better (<=) directions.
 * If the lowest band (L1) is null (open-ended), returns L1 instead of FAIL.
 */
function applyCatalogThresholds(rawValue, thresholds, direction) {
  const { L1, L2, L3, L4 } = thresholds;
  if (direction === "min") {
    // Higher is better
    if (L4 != null && rawValue >= L4) return { level: "L4" };
    if (L3 != null && rawValue >= L3) return { level: "L3" };
    if (L2 != null && rawValue >= L2) return { level: "L2" };
    if (L1 != null && rawValue >= L1) return { level: "L1" };
    if (L1 != null) return { level: "FAIL" };
    return { level: "L1" }; // open-ended
  }
  // max, ±max, allowed, min(lower is better) — all use <= comparison
  if (L4 != null && rawValue <= L4) return { level: "L4" };
  if (L3 != null && rawValue <= L3) return { level: "L3" };
  if (L2 != null && rawValue <= L2) return { level: "L2" };
  if (L1 != null && rawValue <= L1) return { level: "L1" };
  if (L1 != null) return { level: "FAIL" };
  return { level: "L1" }; // open-ended
}

/**
 * Apply screen/viewing geometry thresholds.
 * Uses rp23LevelForAngleDeg. Below 33° or above 90° = FAIL.
 */
function applyScreenThresholds(angleDeg) {
  const level = rp23LevelForAngleDeg(angleDeg);
  if (level) return { level };
  return { level: "FAIL" };
}

// ═══════════════════════════════════════════════════════════════
// Per-parameter scoring functions
// ═══════════════════════════════════════════════════════════════

function scoreP1(rawValue) {
  const result = gradeP1Distance(rawValue);
  if (result.status === "no_data") return { level: null, provisional: true };
  return { level: result.level }; // gradeP1Distance handles FAIL for < 0.5m
}

function scoreP2(rawValue) {
  const cat = RP22_CATALOG["2"];
  return applyCatalogThresholds(rawValue, cat.levels, cat.direction);
}

function scoreP3(rawValue) {
  const cat = RP22_CATALOG["3"];
  return applyCatalogThresholds(rawValue, cat.levels, cat.direction);
}

function scoreP4(rawValue) {
  return applyMapper(rawValue, levelP4_screenDelta, true); // L1=6 bounded → can FAIL
}

function scoreP5(rawValue) {
  return applyMapper(rawValue, levelP5_surSpacing, false); // L1=null open-ended → no FAIL
}

function scoreP6(rawValue) {
  return applyMapper(rawValue, levelP6_surDelta, true); // L1=10 bounded → can FAIL
}

function scoreP7(rawValue) {
  const cat = RP22_CATALOG["7"];
  return applyCatalogThresholds(rawValue, cat.levels, cat.direction); // ±max, L1=10 bounded → can FAIL
}

function scoreP9(rawValue) {
  return applyMapper(rawValue, levelP9_upperSpacing, false); // open-ended → no FAIL
}

function scoreP10(rawValue) {
  return applyMapper(rawValue, levelP10_upperDelta, true); // L1=12 bounded → can FAIL
}

function scoreP11(input) {
  if (input == null) return { level: null, provisional: true, reason: "missing" };
  if (input.indeterminate === true || input.level === "indeterminate") {
    return { level: null, provisional: true, reason: "indeterminate" };
  }
  if (input.level === "L4") return { level: "L4" };
  if (input.level === "L1") return { level: "L1" };
  return { level: null, provisional: true, reason: "unrecognized-level" };
}

function scoreP12(rawValue, mode) {
  const thresholds = resolveParamThresholds({ id: 12 }, mode || "minimum", null, null);
  return applyCatalogThresholds(rawValue, thresholds, "min");
}

function scoreP13(rawValue, mode) {
  const thresholds = resolveParamThresholds({ id: 13 }, null, mode || "minimum", null);
  return applyCatalogThresholds(rawValue, thresholds, "min");
}

function scoreP14(rawValue, mode) {
  const thresholds = resolveParamThresholds({ id: 14 }, null, null, mode || "minimum");
  return applyCatalogThresholds(rawValue, thresholds, "min");
}

function scoreP16(rawValue) {
  return applyMapper(rawValue, levelP16_screenFR, true); // L1=5 bounded → can FAIL
}

function scoreP17(rawValue) {
  return applyMapper(rawValue, levelP17_wsFR, false); // L1=null open-ended → no FAIL
}

function scoreP18(rawValue) {
  const cat = RP22_CATALOG["18"];
  return applyCatalogThresholds(rawValue, cat.levels, cat.direction); // lower Hz better, L1=30 bounded → can FAIL
}

function scoreP19(rawValue) {
  const cat = RP22_CATALOG["19"];
  return applyCatalogThresholds(rawValue, cat.levels, cat.direction); // ±max, L1=5 bounded → can FAIL
}

function scoreP20(rawValue) {
  return applyMapper(rawValue, levelP20_lfConsistency, false); // open-ended → no FAIL
}

function scoreScreen(angleDeg) {
  return applyScreenThresholds(angleDeg);
}

// ═══════════════════════════════════════════════════════════════
// Authority building
// ═══════════════════════════════════════════════════════════════

function multiplierForLevel(level) {
  if (level == null) return null;
  return LEVEL_MULTIPLIERS[level] ?? null;
}

/**
 * Score a single room-scope parameter.
 * @returns {{ state: string, level: string|null, multiplier: number|null, reason: string|null }}
 */
function scoreRoomParam(key, input) {
  if (V1_EXCLUDED_PARAMS.has(key)) {
    return { state: "provisional", level: null, multiplier: null, reason: "v1-excluded" };
  }

  // P11 has a special input format (computeP11Compliance result)
  if (key === "p11") {
    const result = scoreP11(input);
    if (result.provisional) {
      return { state: "provisional", level: null, multiplier: null, reason: result.reason };
    }
    return { state: "scored", level: result.level, multiplier: multiplierForLevel(result.level), reason: null };
  }

  const norm = normalizeInput(input, BASS_PARAMS.has(key));
  if (norm.state === "na") return { state: "na", level: null, multiplier: null, reason: null };
  if (norm.state === "provisional") {
    return { state: "provisional", level: null, multiplier: null, reason: norm.reason };
  }

  const mode = typeof input === "object" && input ? input.mode : null;
  let scored;

  switch (key) {
    case "p2": scored = scoreP2(norm.rawValue); break;
    case "p3": scored = scoreP3(norm.rawValue); break;
    case "p7": scored = scoreP7(norm.rawValue); break;
    case "p12": scored = scoreP12(norm.rawValue, mode); break;
    case "p13": scored = scoreP13(norm.rawValue, mode); break;
    case "p14": scored = scoreP14(norm.rawValue, mode); break;
    case "p18": scored = scoreP18(norm.rawValue); break;
    default: return { state: "provisional", level: null, multiplier: null, reason: "unknown-room-param" };
  }

  return { state: "scored", level: scored.level, multiplier: multiplierForLevel(scored.level), reason: null };
}

/**
 * Score a single seat-scope parameter for a single seat.
 * @returns {{ state: string, level: string|null, multiplier: number|null, reason: string|null }}
 */
function scoreSeatParam(key, input) {
  const norm = normalizeInput(input, BASS_PARAMS.has(key));
  if (norm.state === "na") return { state: "na", level: null, multiplier: null, reason: null };
  if (norm.state === "provisional") {
    return { state: "provisional", level: null, multiplier: null, reason: norm.reason };
  }

  let scored;
  switch (key) {
    case "p1": scored = scoreP1(norm.rawValue); break;
    case "p4": scored = scoreP4(norm.rawValue); break;
    case "p5": scored = scoreP5(norm.rawValue); break;
    case "p6": scored = scoreP6(norm.rawValue); break;
    case "p9": scored = scoreP9(norm.rawValue); break;
    case "p10": scored = scoreP10(norm.rawValue); break;
    case "p16": scored = scoreP16(norm.rawValue); break;
    case "p17": scored = scoreP17(norm.rawValue); break;
    case "p19": scored = scoreP19(norm.rawValue); break;
    case "p20": scored = scoreP20(norm.rawValue); break;
    case "screen": scored = scoreScreen(norm.rawValue); break;
    default: return { state: "provisional", level: null, multiplier: null, reason: "unknown-seat-param" };
  }

  if (scored.provisional) {
    return { state: "provisional", level: null, multiplier: null, reason: "no-data" };
  }
  return { state: "scored", level: scored.level, multiplier: multiplierForLevel(scored.level), reason: null };
}

/**
 * Build the full authority map from raw inputs.
 *
 * @param {Object} input
 * @param {Array} input.seats - Array of seat objects with `id` property
 * @param {Object} [input.p1] - Seat-scope: { [seatId]: number|object|null }
 * @param {Object} [input.p2] - Room-scope: { rawValue: number, mode?: string } | null
 * @param {Object} [input.p3] - Room-scope: { rawValue: number } | null
 * @param {Object} [input.p4] - Seat-scope
 * @param {Object} [input.p5] - Seat-scope
 * @param {Object} [input.p6] - Seat-scope
 * @param {Object} [input.p7] - Room-scope: { rawValue: number } | { na: true } | null
 * @param {Object} [input.p9] - Seat-scope (na for no adjacent uppers)
 * @param {Object} [input.p10] - Seat-scope
 * @param {Object} [input.p11] - Room-scope: { outsideCount, level, indeterminate } | null
 * @param {Object} [input.p12] - Room-scope: { rawValue: number, mode?: string } | null
 * @param {Object} [input.p13] - Room-scope: { rawValue: number, mode?: string } | null
 * @param {Object} [input.p14] - Room-scope: { rawValue: number, verified: boolean, mode?: string } | null
 * @param {Object} [input.p16] - Seat-scope
 * @param {Object} [input.p17] - Seat-scope
 * @param {Object} [input.p18] - Room-scope: { rawValue: number, verified: boolean } | { na: true } | null
 * @param {Object} [input.p19] - Seat-scope: { [seatId]: { rawValue: number, verified: boolean } | null }
 * @param {Object} [input.p20] - Seat-scope (na for single-seat)
 * @param {Object} [input.screen] - Seat-scope: { [seatId]: number|null }
 * @returns {{ parameters: Object, seatIds: string[], excludedParams: string[] }}
 */
export function buildArtcousticDesignRatingAuthority(input) {
  const seats = Array.isArray(input?.seats) ? input.seats : [];
  const seatIds = seats.map((s) => s.id).filter(Boolean);

  const parameters = {};

  for (const key of Object.keys(PARAM_WEIGHTS)) {
    const weight = PARAM_WEIGHTS[key];
    const scope = PARAM_SCOPE[key];
    const paramInput = input?.[key];

    if (V1_EXCLUDED_PARAMS.has(key)) {
      parameters[key] = {
        key, weight, scope,
        state: "provisional",
        level: null,
        multiplier: null,
        reason: "v1-excluded",
        seats: null,
      };
      continue;
    }

    if (scope === "room") {
      const scored = scoreRoomParam(key, paramInput);
      const mode = typeof paramInput === "object" && paramInput ? paramInput.mode : null;
      const effectiveWeight = getEffectiveWeight(key, mode, scored.state);
      parameters[key] = {
        key, weight, effectiveWeight, scope,
        state: scored.state,
        level: scored.level,
        multiplier: scored.multiplier,
        reason: scored.reason,
        seats: null,
        mode: mode,
      };
    } else {
      // seat-scope
      const seatAuthorities = {};
      let allNa = true;
      let anyProvisional = false;

      for (const seatId of seatIds) {
        const seatInput = paramInput?.[seatId];
        const seatAuth = scoreSeatParam(key, seatInput);
        seatAuthorities[seatId] = seatAuth;
        if (seatAuth.state !== "na") allNa = false;
        if (seatAuth.state === "provisional") anyProvisional = true;
      }

      const paramState = allNa ? "na" : anyProvisional ? "provisional" : "scored";

      parameters[key] = {
        key, weight, scope,
        state: paramState,
        level: null,
        multiplier: null,
        reason: paramState === "provisional" ? "seat-provisional" : null,
        seats: seatAuthorities,
      };
    }
  }

  return {
    parameters,
    seatIds,
    excludedParams: Array.from(V1_EXCLUDED_PARAMS),
  };
}

// ═══════════════════════════════════════════════════════════════
// Rating calculations
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate the room Artcoustic System Design Rating.
 *
 * Room-scope: use the room result once.
 * Seat-scope: every applicable physical seat must have a definitive result.
 *   If any applicable seat is provisional/missing, exclude the WHOLE parameter
 *   from numerator and denominator, and mark the room rating provisional.
 *   If complete, average the seat multipliers.
 *
 * metric contribution = average multiplier × weight
 * maximum metric contribution = 12 × weight
 *
 * @param {Object} authority - Authority map from buildArtcousticDesignRatingAuthority
 * @returns {{ status, rawPercentage, displayPercentage, actualPoints, maximumAvailablePoints, applicableWeight, assessedWeight, coveragePercent, hasProvisional }}
 */
export function calculateRoomDesignRating(authority) {
  let actualPoints = 0;
  let maximumAvailablePoints = 0;
  let applicableWeight = 0;
  let assessedWeight = 0;
  let hasProvisional = false;
  const contributions = [];

  for (const key of Object.keys(PARAM_WEIGHTS)) {
    const param = authority?.parameters?.[key];
    if (!param) continue;

    const weight = param.effectiveWeight ?? PARAM_WEIGHTS[key];

    // V1-excluded: excluded from both numerator and denominator
    if (V1_EXCLUDED_PARAMS.has(key)) {
      hasProvisional = true; // diagnostic only — does not affect status
      continue;
    }

    if (param.state === "na") continue; // N/A excluded from both

    if (param.state === "provisional") {
      hasProvisional = true; // diagnostic only — does not affect status
      continue; // not assessed — excluded from both
    }

    // param.state === "scored"
    let multiplier;
    let resultLevel;
    let mode = null;

    if (param.scope === "room") {
      multiplier = param.multiplier;
      resultLevel = param.level;
      // Extract mode from the original input stored on the authority parameter
      mode = param.mode || null;
    } else {
      // seat-scope: average multipliers across applicable seats
      const seatIds = authority?.seatIds || [];
      const seatValues = Object.values(param.seats || {});
      const applicableSeats = seatValues.filter((s) => s.state !== "na");
      if (applicableSeats.length === 0) continue;
      if (applicableSeats.some((s) => s.state === "provisional")) {
        hasProvisional = true; // diagnostic only
        continue;
      }
      const sum = applicableSeats.reduce((acc, s) => acc + (s.multiplier ?? 0), 0);
      multiplier = sum / applicableSeats.length;
      resultLevel = buildSeatDistribution(param.seats, seatIds);
    }

    const earnedPoints = multiplier * weight;
    const maximumPoints = 12 * weight;

    actualPoints += earnedPoints;
    maximumAvailablePoints += maximumPoints;
    applicableWeight += weight;
    assessedWeight += weight;

    contributions.push({
      key,
      parameter: key === "screen" ? "screen" : Number(key.replace("p", "")),
      scope: param.scope,
      effectiveWeight: weight,
      resultLevel,
      multiplier,
      earnedPoints,
      maximumPoints,
      mode,
    });
  }

  const rawPercentage = maximumAvailablePoints > 0
    ? (actualPoints / maximumAvailablePoints) * 100
    : null;
  const displayPercentage = rawPercentage != null ? Math.max(0, rawPercentage) : null;
  const coveragePercent = applicableWeight > 0
    ? (assessedWeight / applicableWeight) * 100
    : 0;

  const status = maximumAvailablePoints === 0
    ? "NOT_ASSESSED"
    : "COMPLETE";

  return {
    status,
    rawPercentage,
    displayPercentage,
    actualPoints,
    maximumAvailablePoints,
    applicableWeight,
    assessedWeight,
    coveragePercent,
    hasProvisional,
    contributions,
  };
}

/**
 * Calculate an individual seat's Artcoustic System Design Rating.
 *
 * Room-scope: use the common room result. If room authority is provisional,
 *   that seat rating is provisional.
 * Seat-scope: use that seat's result. If seat-specific authority is provisional,
 *   that seat rating is provisional.
 * Screen: use that seat's viewing-angle result.
 *
 * No seat ranking. No best/worst labels.
 *
 * @param {Object} authority - Authority map from buildArtcousticDesignRatingAuthority
 * @param {string} seatId - Seat identifier
 * @returns {{ seatId, status, rawPercentage, displayPercentage, actualPoints, maximumAvailablePoints, applicableWeight, assessedWeight, coveragePercent, hasProvisional }}
 */
export function calculateSeatDesignRating(authority, seatId) {
  let actualPoints = 0;
  let maximumAvailablePoints = 0;
  let applicableWeight = 0;
  let assessedWeight = 0;
  let hasProvisional = false;

  for (const key of Object.keys(PARAM_WEIGHTS)) {
    const param = authority?.parameters?.[key];
    if (!param) continue;

    const weight = param.effectiveWeight ?? PARAM_WEIGHTS[key];

    // V1-excluded: excluded from both numerator and denominator
    if (V1_EXCLUDED_PARAMS.has(key)) {
      hasProvisional = true; // diagnostic only — does not affect status
      continue;
    }

    if (param.scope === "room") {
      if (param.state === "na") continue;
      if (param.state === "provisional") {
        hasProvisional = true; // diagnostic only
        continue;
      }
      actualPoints += (param.multiplier ?? 0) * weight;
      maximumAvailablePoints += 12 * weight;
      applicableWeight += weight;
      assessedWeight += weight;
    } else {
      // seat-scope
      const seatAuth = param.seats?.[seatId];
      if (!seatAuth || seatAuth.state === "na") continue;
      if (seatAuth.state === "provisional") {
        hasProvisional = true; // diagnostic only
        continue;
      }
      actualPoints += (seatAuth.multiplier ?? 0) * weight;
      maximumAvailablePoints += 12 * weight;
      applicableWeight += weight;
      assessedWeight += weight;
    }
  }

  const rawPercentage = maximumAvailablePoints > 0
    ? (actualPoints / maximumAvailablePoints) * 100
    : null;
  const displayPercentage = rawPercentage != null ? Math.max(0, rawPercentage) : null;
  const coveragePercent = applicableWeight > 0
    ? (assessedWeight / applicableWeight) * 100
    : 0;

  const status = maximumAvailablePoints === 0
    ? "NOT_ASSESSED"
    : "COMPLETE";

  return {
    seatId,
    status,
    rawPercentage,
    displayPercentage,
    actualPoints,
    maximumAvailablePoints,
    applicableWeight,
    assessedWeight,
    coveragePercent,
    hasProvisional,
  };
}