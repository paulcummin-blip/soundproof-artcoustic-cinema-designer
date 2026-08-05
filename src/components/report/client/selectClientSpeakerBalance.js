/**
 * selectClientSpeakerBalance
 * --------------------------
 * Pure selector for the Speaker Balance Across the Seats Visual Report page.
 *
 * Maps real-seat geometry + canonical P4/P6/P10 values from the engine's
 * perSeatRp22 structure via selectClientSeatCoverage.
 *
 * Uses original full-precision seatingPositions for drawing geometry.
 * Uses a strict coordinate parser that rejects null, undefined, empty
 * strings, whitespace-only strings, non-numeric strings, NaN, Infinity,
 * -Infinity, and empty nested position values. Genuine numeric zero is
 * accepted. Malformed seats are omitted, never drawn at x=0 or y=0.
 *
 * P10 is evaluated independently — not gated by P9 applicability.
 *
 * @param {Object} analysisResult   - from useRP22AnalysisEngine
 * @param {Array}  seatingPositions - original full-precision seat array
 * @param {Object} rsp              - effective RSP { x, y } or null
 * @returns {Object} { seats, rsp, hasAnyValid, hasValidP4, hasValidP6, hasValidP10 }
 */
import { selectClientSeatCoverage } from "./selectClientSeatCoverage";

/**
 * Strict coordinate parser.
 *
 * Rejects: null, undefined, empty string, whitespace-only string,
 *   non-numeric string, NaN, Infinity, -Infinity, empty nested values.
 * Accepts: genuine numeric zero (0, "0", 0.0).
 *
 * @returns {number|null} finite number or null if invalid
 */
function strictCoord(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    return n;
  }
  return null;
}

/**
 * Coordinate resolver — tries the top-level value first, then the nested fallback.
 *
 * Unlike `??` (nullish coalescing), this falls back whenever the top-level
 * value is *invalid* (empty string, whitespace, non-numeric text, NaN,
 * Infinity), not just when it is nullish. A genuine numeric zero in the
 * top-level value is valid and wins over a different nested value.
 *
 * @returns {number|null} finite number or null if neither source is valid
 */
export function resolveCoordinate(primaryValue, fallbackValue) {
  const primary = strictCoord(primaryValue);
  if (primary !== null) return primary;
  return strictCoord(fallbackValue);
}

function isValidLevel(level) {
  if (level === null || level === undefined) return false;
  const str = String(level).trim().toUpperCase();
  if (str === "N/A" || str === "—" || str === "-" || str === "FAIL") return false;
  const n = typeof level === "number" ? level : parseInt(str.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n >= 1 && n <= 4;
}

function isValidParam(param) {
  if (!param || typeof param !== "object") return false;
  if (!Number.isFinite(param.value)) return false;
  if (param.status !== "ok") return false;
  if (!isValidLevel(param.level)) return false;
  return true;
}

export function selectClientSpeakerBalance({ analysisResult, seatingPositions, rsp }) {
  const empty = { seats: [], rsp: null, hasAnyValid: false, hasValidP4: false, hasValidP6: false, hasValidP10: false };

  if (!analysisResult || !Array.isArray(seatingPositions)) return empty;

  // Filter seats with valid original coordinates using the resolver
  // (top-level value first, nested fallback if top-level is invalid)
  const validSeats = seatingPositions.filter((s) => {
    if (!s || s.id == null) return false;
    const x = resolveCoordinate(s.x, s.position?.x);
    const y = resolveCoordinate(s.y, s.position?.y);
    return x !== null && y !== null;
  });

  // Get normalised P4/P6/P10 from the canonical selector
  const coverage = selectClientSeatCoverage(analysisResult, validSeats);

  // Map to drawing entries using original full-precision coordinates
  const seats = coverage.map((entry) => {
    const originalSeat = validSeats.find((s) => s.id === entry.seatId);
    const x = resolveCoordinate(originalSeat.x, originalSeat.position?.x);
    const y = resolveCoordinate(originalSeat.y, originalSeat.position?.y);

    return {
      id: entry.seatId,
      x,
      y,
      p4: isValidParam(entry.p4) ? { level: entry.p4.level } : null,
      p6: isValidParam(entry.p6) ? { level: entry.p6.level } : null,
      p10: isValidParam(entry.p10) ? { level: entry.p10.level } : null,
    };
  });

  const hasValidP4 = seats.some((s) => s.p4 !== null);
  const hasValidP6 = seats.some((s) => s.p6 !== null);
  const hasValidP10 = seats.some((s) => s.p10 !== null);
  const hasAnyValid = hasValidP4 || hasValidP6 || hasValidP10;

  // RSP as reference marker only — no result badges
  let rspPoint = null;
  if (rsp) {
    const rx = strictCoord(rsp.x);
    const ry = strictCoord(rsp.y);
    if (rx !== null && ry !== null) {
      rspPoint = { x: rx, y: ry };
    }
  }

  return { seats, rsp: rspPoint, hasAnyValid, hasValidP4, hasValidP6, hasValidP10 };
}