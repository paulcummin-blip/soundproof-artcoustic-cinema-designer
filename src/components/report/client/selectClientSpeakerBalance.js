/**
 * selectClientSpeakerBalance
 * --------------------------
 * Pure selector for the Speaker Balance Across the Seats Visual Report page.
 *
 * Maps real-seat geometry + canonical P4/P6/P10 values from the engine's
 * perSeatRp22 structure via selectClientSeatCoverage.
 *
 * Uses original full-precision seatingPositions for drawing geometry.
 * Rejects seats with missing/non-finite original x or y coordinates —
 * malformed seats are NOT coerced to room origin.
 *
 * P10 is evaluated independently — not gated by P9 applicability.
 *
 * @param {Object} analysisResult   - from useRP22AnalysisEngine
 * @param {Array}  seatingPositions - original full-precision seat array
 * @param {Object} rsp              - effective RSP { x, y } or null
 * @returns {Object} { seats, rsp, hasAnyValid, hasValidP4, hasValidP6, hasValidP10 }
 */
import { selectClientSeatCoverage } from "./selectClientSeatCoverage";

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

  // Filter seats with valid original coordinates — reject non-finite, do not coerce to zero
  const validSeats = seatingPositions.filter((s) => {
    if (!s || s.id == null) return false;
    const x = Number(s.x ?? s.position?.x);
    const y = Number(s.y ?? s.position?.y);
    return Number.isFinite(x) && Number.isFinite(y);
  });

  // Get normalised P4/P6/P10 from the canonical selector
  const coverage = selectClientSeatCoverage(analysisResult, validSeats);

  // Map to drawing entries using original full-precision coordinates
  const seats = coverage.map((entry) => {
    const originalSeat = validSeats.find((s) => s.id === entry.seatId);
    const x = Number(originalSeat.x ?? originalSeat.position?.x);
    const y = Number(originalSeat.y ?? originalSeat.position?.y);

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
    const rx = Number(rsp.x);
    const ry = Number(rsp.y);
    if (Number.isFinite(rx) && Number.isFinite(ry)) {
      rspPoint = { x: rx, y: ry };
    }
  }

  return { seats, rsp: rspPoint, hasAnyValid, hasValidP4, hasValidP6, hasValidP10 };
}