/**
 * selectClientTimbreConsistency
 * -----------------------------
 * Pure selector for the Timbre Consistency Visual Report page.
 *
 * Maps real-seat geometry + canonical P16/P17 values from the engine's
 * perSeatRp22 structure, then applies a worst-applicable-level rule to
 * produce one combined client category per seat.
 *
 * Authority:
 *   P16: analysisResult.perSeatRp22[seat.id].rp22[16]
 *   P17: analysisResult.perSeatRp22[seat.id].rp22[17]
 *
 * No interpolation, no regrading, no local recomputation.
 * Reads perSeatRp22 directly — does not depend on selectClientSeatCoverage.
 *
 * Excludes: synthetic mlp, malformed seats, missing seat IDs.
 */
import { resolveCoordinate } from "./selectClientSpeakerBalance";

// Severity order from best to worst: L4, L3, L2, L1, FAIL
// "Worst applicable" = the one closest to FAIL in this order (lowest rank).
const LEVEL_RANK = { L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0 };

/**
 * Normalise a raw level value to "L1"–"L4", "FAIL", or null.
 * Handles numeric (1–4), string ("L3", "FAIL", "N/A", "—"), and null.
 */
function normalizeLevel(level) {
  if (level === null || level === undefined) return null;
  const str = String(level).trim().toUpperCase();
  if (str === "FAIL") return "FAIL";
  if (str === "N/A" || str === "—" || str === "-") return null;
  const n = typeof level === "number" ? level : parseInt(str.replace(/[^0-9]/g, ""), 10);
  if (Number.isFinite(n) && n >= 1 && n <= 4) return `L${n}`;
  return null;
}

/**
 * Resolve the numeric value from a param object.
 * Supports both `value` and `valueDb` field conventions.
 * @returns {number|null} finite number or null
 */
function resolveValue(param) {
  if (!param || typeof param !== "object") return null;
  const v = param.value != null ? param.value : param.valueDb != null ? param.valueDb : null;
  return Number.isFinite(v) ? v : null;
}

/**
 * Check whether a status is absent or equivalent to "ok".
 * Used for L1–L4 acceptance.
 */
function isAbsentOrOkStatus(status) {
  if (status === null || status === undefined) return true;
  const s = String(status).trim().toLowerCase();
  return s === "" || s === "ok";
}

/**
 * Check whether a status is absent, "ok", or "fail".
 * Used for explicit FAIL acceptance.
 */
function isFailAcceptableStatus(status) {
  if (status === null || status === undefined) return true;
  const s = String(status).trim().toLowerCase();
  return s === "" || s === "ok" || s === "fail";
}

/**
 * Check whether a normalised seat param is an applicable canonical result.
 *
 * L1–L4 RESULT: Accept when level normalises to L1–L4, status is absent or
 * equivalent to "ok", value is finite, and applicable is not explicitly false.
 *
 * EXPLICIT FAIL RESULT: Accept when level explicitly normalises to "FAIL",
 * status is absent, "ok", or "fail", and applicable is not explicitly false.
 * A finite numeric value is NOT required for FAIL.
 *
 * Rejects: missing object, no_data, error, unavailable, N/A, dash,
 * applicable === false, malformed levels, and status "fail" without FAIL level.
 */
function isApplicableParam(param) {
  if (!param || typeof param !== "object") return false;
  if (param.applicable === false) return false;

  const level = normalizeLevel(param.level);

  // Explicit FAIL: accept with status absent/ok/fail, no finite value required
  if (level === "FAIL") {
    return isFailAcceptableStatus(param.status);
  }

  // L1–L4: require status absent/ok and a finite value
  if (level !== null) {
    if (!isAbsentOrOkStatus(param.status)) return false;
    if (resolveValue(param) === null) return false;
    return true;
  }

  // Reject everything else (no_data, error, N/A, dash, unavailable, malformed)
  return false;
}

/**
 * Worst applicable level — the one with the lowest performance.
 * FAIL beats L1 beats L2 beats L3 beats L4.
 */
function worstApplicableLevel(levels) {
  if (levels.length === 0) return null;
  let worst = levels[0];
  for (const lvl of levels) {
    if (LEVEL_RANK[lvl] < LEVEL_RANK[worst]) worst = lvl;
  }
  return worst;
}

/**
 * Map a worst-applicable level to a client presentation category.
 */
function categoryForLevel(level) {
  if (level === null) {
    return { key: "not_assessed", label: "Not assessed" };
  }
  if (level === "FAIL") {
    return { key: "improvement", label: "Improvement recommended" };
  }
  if (level === "L1") {
    return { key: "acceptable", label: "Acceptable" };
  }
  if (level === "L2") {
    return { key: "consistent", label: "Consistent" };
  }
  if (level === "L3") {
    return { key: "very_consistent", label: "Very consistent" };
  }
  // L4
  return { key: "highly_consistent", label: "Highly consistent" };
}

/**
 * Normalise a raw perSeatRp22 param into a compact result object.
 */
function normalizeParam(raw) {
  if (!raw) return null;
  return {
    level: raw.level ?? null,
    value: resolveValue(raw),
    status: raw.status ?? null,
    applicable: raw.applicable ?? null,
    formatted: raw.formatted ?? null,
  };
}

/**
 * Pure selector for the Timbre Consistency client page.
 *
 * @param {Object} analysisResult   - from useRP22AnalysisEngine
 * @param {Array}  seatingPositions - original full-precision seat array
 * @returns {Object} { seats, counts, hasAnyValidResult }
 */
export function selectClientTimbreConsistency({ analysisResult, seatingPositions }) {
  const empty = { seats: [], counts: {}, hasAnyValidResult: false };

  if (!analysisResult || !Array.isArray(seatingPositions)) return empty;

  const perSeat = analysisResult.perSeatRp22 || {};

  // Filter seats with valid original coordinates using the strict resolver.
  // Exclude: synthetic mlp, malformed seats, missing seat IDs.
  const validSeats = seatingPositions.filter((s) => {
    if (!s || s.id == null) return false;
    if (s.id === "mlp") return false;
    const x = resolveCoordinate(s.x, s.position?.x);
    const y = resolveCoordinate(s.y, s.position?.y);
    return x !== null && y !== null;
  });

  const seats = validSeats.map((seat) => {
    const seatData = perSeat[seat.id];
    const rp22 = seatData?.rp22 || {};
    const rawP16 = normalizeParam(rp22[16]);
    const rawP17 = normalizeParam(rp22[17]);

    const x = resolveCoordinate(seat.x, seat.position?.x);
    const y = resolveCoordinate(seat.y, seat.position?.y);

    const applicableLevels = [];
    if (isApplicableParam(rawP16)) applicableLevels.push(normalizeLevel(rawP16.level));
    if (isApplicableParam(rawP17)) applicableLevels.push(normalizeLevel(rawP17.level));

    const worst = worstApplicableLevel(applicableLevels);
    const cat = categoryForLevel(worst);

    return {
      id: seat.id,
      x,
      y,
      p16: rawP16,
      p17: rawP17,
      worstLevel: worst,
      categoryKey: cat.key,
      categoryLabel: cat.label,
    };
  });

  // Counts per category key
  const counts = {};
  for (const seat of seats) {
    counts[seat.categoryKey] = (counts[seat.categoryKey] || 0) + 1;
  }

  const hasAnyValidResult = seats.some((s) => s.worstLevel !== null);

  return { seats, counts, hasAnyValidResult };
}