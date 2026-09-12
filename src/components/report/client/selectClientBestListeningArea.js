/**
 * selectClientBestListeningArea
 * -----------------------------
 * Pure selector for the Best Listening Area Visual Report page.
 *
 * Maps real-seat geometry + canonical P4/P6/P10 values from the engine's
 * perSeatRp22 structure via selectClientSeatCoverage, then applies a
 * worst-applicable-level rule to produce one combined client category per seat.
 *
 * Authority:
 *   P4:  analysisResult.perSeatRp22[seat.id].rp22[4]
 *   P6:  analysisResult.perSeatRp22[seat.id].rp22[6]
 *   P10: analysisResult.perSeatRp22[seat.id].rp22[10]
 *
 * No interpolation, no regrading, no local SPL recomputation.
 * The "primary" category (L3/L4) is a report presentation category only — it
 * does NOT alter or overwrite any seat's stored isPrimary property.
 */
import { selectClientSeatCoverage } from "./selectClientSeatCoverage";
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
 * Check whether a status string is equivalent to "ok".
 */
function isOkStatus(status) {
  return String(status ?? "").trim().toLowerCase() === "ok";
}

/**
 * Check whether a status string is equivalent to "fail".
 */
function isFailStatus(status) {
  return String(status ?? "").trim().toLowerCase() === "fail";
}

/**
 * Check whether a normalised seat param is an applicable canonical result.
 *
 * L1–L4 RESULT: Accept when level normalises to L1–L4, status is equivalent
 * to "ok", value is finite, and applicable is not explicitly false.
 *
 * EXPLICIT FAIL RESULT: Accept when level explicitly normalises to "FAIL",
 * status is equivalent to "ok" or "fail", and applicable is not explicitly
 * false. A finite numeric value is NOT required for FAIL.
 *
 * Rejects: missing object, no_data, error, unavailable, N/A, dash,
 * applicable === false, and status "fail" without an explicit FAIL level.
 */
function isApplicableParam(param) {
  if (!param || typeof param !== "object") return false;
  if (param.applicable === false) return false;

  const level = normalizeLevel(param.level);

  // Explicit FAIL: accept with status "ok" or "fail", no finite value required
  if (level === "FAIL") {
    return isOkStatus(param.status) || isFailStatus(param.status);
  }

  // L1–L4: require status "ok" and a finite value
  if (level !== null) {
    if (!isOkStatus(param.status)) return false;
    if (!Number.isFinite(param.value)) return false;
    return true;
  }

  // Reject everything else (no_data, error, N/A, dash, unavailable, etc.)
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
    return {
      key: "not_assessed",
      category: "Not assessed",
      wording: "No assessed result for this seat.",
    };
  }
  if (level === "FAIL") {
    return {
      key: "improvement",
      category: "Does not achieve Level 1",
      wording: "Lowest achieved level across P4, P6 and P10 does not achieve Level 1.",
    };
  }
  if (level === "L1") {
    return {
      key: "acceptable",
      category: "Level 1",
      wording: "Lowest achieved level across P4, P6 and P10 is Level 1.",
    };
  }
  if (level === "L2") {
    return {
      key: "good",
      category: "Level 2",
      wording: "Lowest achieved level across P4, P6 and P10 is Level 2.",
    };
  }
  // L3 or L4
  return {
    key: "primary",
    category: "Level 3 or 4",
    wording: "Lowest achieved level across P4, P6 and P10 is Level 3 or 4.",
  };
}

export function selectClientBestListeningArea({ analysisResult, seatingPositions, rsp }) {
  const empty = { seats: [], rsp: null, counts: {}, hasAny: false, hasPrimary: false, explanation: "" };

  if (!analysisResult || !Array.isArray(seatingPositions)) return empty;

  // Filter seats with valid original coordinates using the strict resolver
  const validSeats = seatingPositions.filter((s) => {
    if (!s || s.id == null) return false;
    const x = resolveCoordinate(s.x, s.position?.x);
    const y = resolveCoordinate(s.y, s.position?.y);
    return x !== null && y !== null;
  });

  // Get normalised P4/P6/P10 from the canonical selector
  const coverage = selectClientSeatCoverage(analysisResult, validSeats);

  // Map to client category entries using original full-precision coordinates
  const seats = coverage.map((entry) => {
    const originalSeat = validSeats.find((s) => s.id === entry.seatId);
    const x = resolveCoordinate(originalSeat.x, originalSeat.position?.x);
    const y = resolveCoordinate(originalSeat.y, originalSeat.position?.y);

    const applicableLevels = [];
    if (isApplicableParam(entry.p4)) applicableLevels.push(normalizeLevel(entry.p4.level));
    if (isApplicableParam(entry.p6)) applicableLevels.push(normalizeLevel(entry.p6.level));
    if (isApplicableParam(entry.p10)) applicableLevels.push(normalizeLevel(entry.p10.level));

    const worst = worstApplicableLevel(applicableLevels);
    const cat = categoryForLevel(worst);

    return {
      id: entry.seatId,
      x,
      y,
      isPrimary: !!originalSeat?.isPrimary,
      categoryKey: cat.key,
      category: cat.category,
      wording: cat.wording,
      worstLevel: worst,
      p4Level: isApplicableParam(entry.p4) ? normalizeLevel(entry.p4.level) : null,
      p6Level: isApplicableParam(entry.p6) ? normalizeLevel(entry.p6.level) : null,
      p10Level: isApplicableParam(entry.p10) ? normalizeLevel(entry.p10.level) : null,
    };
  });

  // Counts per category key
  const counts = {};
  for (const seat of seats) {
    counts[seat.categoryKey] = (counts[seat.categoryKey] || 0) + 1;
  }

  // RSP as reference marker only — no classification attached
  let rspPoint = null;
  if (rsp) {
    const rx = Number(rsp.x);
    const ry = Number(rsp.y);
    if (Number.isFinite(rx) && Number.isFinite(ry)) {
      rspPoint = { x: rx, y: ry };
    }
  }

  const hasPrimary = (counts.primary || 0) > 0;
  const hasAny = seats.length > 0;
  const hasAnyValidResult = seats.some((s) => s.worstLevel !== null);

  const primaryCount = counts.primary || 0;
  const explanation = !hasAny
    ? ""
    : hasPrimary
      ? `${primaryCount === 1 ? "One seat" : `${primaryCount} seats`} achieve the highest level across P4, P6 and P10. Remaining seats are shaded by their lowest achieved level.`
      : "Seats are shaded by their lowest achieved level across RP22 Parameters 4, 6 and 10.";

  return { seats, rsp: rspPoint, counts, hasAny, hasAnyValidResult, hasPrimary, explanation };
}