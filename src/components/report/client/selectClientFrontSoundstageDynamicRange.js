/**
 * selectClientFrontSoundstageDynamicRange
 * ---------------------------------------
 * Pure selector for the Front Soundstage Dynamic Capability client Visual Report.
 *
 * RP22 Parameter 12 is a ROOM parameter, measured at the Reference Seating
 * Position (RSP). This selector does NOT compute per-seat SPL. It reads only
 * the canonical P12 authority and the RSP screen-channel SPL values.
 *
 * Authority:
 *   - analysisResult.gradedParameters.primary[12]  → RP22 level + minimum capability
 *   - allSeatSplMetrics.get("mlp").spl.screen.{FL,FC,FR} → individual channel SPL
 *
 * Seat geometry (id, x, y) is returned for drawing only — it carries no SPL
 * or level data, because P12 does not vary by seat.
 *
 * Returns:
 *   {
 *     seats: [{ id, x, y }],                 // geometry only, for drawing
 *     rsp,
 *     fl: { value, formatted } | null,
 *     fc: { value, formatted } | null,
 *     fr: { value, formatted } | null,
 *     minimum: { value, formatted } | null,  // from gradedParameters.primary[12]
 *     level: string | null,                  // e.g. "L3"
 *     hasAny: boolean
 *   }
 */

function ceilDb(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const c = Math.ceil(n); // whole dB, matches engine P12 rounding
  return { value: c, formatted: `${c} dB` };
}

function normalizeSeatGeometry(seat) {
  if (!seat) return null;
  const x = Number(seat.x ?? seat.position?.x);
  const y = Number(seat.y ?? seat.position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { id: seat.id || `seat-${x.toFixed(2)}-${y.toFixed(2)}`, x, y };
}

export function selectClientFrontSoundstageDynamicRange({
  analysisResult,
  allSeatSplMetrics,
  seatingPositions,
  rsp,
}) {
  // Seat geometry for drawing only (no SPL/level)
  const seats = (Array.isArray(seatingPositions) ? seatingPositions : [])
    .map(normalizeSeatGeometry)
    .filter(Boolean);

  // RSP screen-channel SPL values (canonical authority)
  let fl = null;
  let fc = null;
  let fr = null;
  if (allSeatSplMetrics && typeof allSeatSplMetrics.get === "function") {
    const entry = allSeatSplMetrics.get("mlp");
    const screen = entry?.spl?.screen;
    if (screen) {
      const flRaw = Number.isFinite(screen.FL?.value) ? Number(screen.FL.value)
        : (Number.isFinite(screen.L?.value) ? Number(screen.L.value) : null);
      const fcRaw = Number.isFinite(screen.FC?.value) ? Number(screen.FC.value)
        : (Number.isFinite(screen.C?.value) ? Number(screen.C.value) : null);
      const frRaw = Number.isFinite(screen.FR?.value) ? Number(screen.FR.value)
        : (Number.isFinite(screen.R?.value) ? Number(screen.R.value) : null);
      if (flRaw !== null) fl = ceilDb(flRaw);
      if (fcRaw !== null) fc = ceilDb(fcRaw);
      if (frRaw !== null) fr = ceilDb(frRaw);
    }
  }

  // Canonical P12 authority (room-scope)
  const p12 = analysisResult?.gradedParameters?.primary?.[12] ?? null;
  const level = p12?.level ?? null;
  let minimum = null;
  if (p12 && Number.isFinite(p12.value)) {
    minimum = { value: p12.value, formatted: p12.formatted || `${p12.value} dB` };
  }

  const hasAny = !!(fl || fc || fr) || !!(minimum && level);

  return { seats, rsp, fl, fc, fr, minimum, level, hasAny };
}

export default selectClientFrontSoundstageDynamicRange;