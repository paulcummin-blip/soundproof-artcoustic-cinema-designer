/**
 * CAD Overlay Export Readiness
 * -----------------------------
 * Content-level readiness gate for CAD (DXF/SVG) exports. Prevents the CAD
 * export button from enabling until all CAD-required project data has
 * populated AppState — independent of the report-level hydration/bass/
 * recommendation status gate (exportDisabled).
 *
 * A valid DXF needs: room dimensions, speakers with x/y positions, seating
 * with x/y positions, and subwoofer positions where the design contains subs.
 * Room elements and projector are optional (a room may legitimately have
 * none) and do not block readiness.
 *
 * Units: metres (app-space). No CAD geometry is computed here.
 */

/**
 * @param {object}  opts
 * @param {object}  opts.roomDims        - { widthM, lengthM, heightM }
 * @param {Array}   opts.placedSpeakers  - speakerSystem.placedSpeakers
 * @param {Array}   opts.seatingPositions- seatingPositions
 * @param {object}  opts.frontSubsCfg    - { count, positions: [{x,y}] }
 * @param {object}  opts.rearSubsCfg     - { count, positions: [{x,y}] }
 * @returns {boolean} true when all CAD-required data is present
 */
export function isCadExportReady({
  roomDims,
  placedSpeakers,
  seatingPositions,
  frontSubsCfg,
  rearSubsCfg,
}) {
  // 1) Room dimensions
  const w = Number(roomDims?.widthM);
  const l = Number(roomDims?.lengthM);
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(l) || l <= 0) return false;

  // 2) Speakers with valid x/y positions
  const speakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const hasValidSpeaker = speakers.some(
    (s) => Number.isFinite(s?.position?.x) && Number.isFinite(s?.position?.y)
  );
  if (!hasValidSpeaker) return false;

  // 3) Seating with valid x/y positions
  const seats = Array.isArray(seatingPositions) ? seatingPositions : [];
  const hasValidSeat = seats.some(
    (s) => Number.isFinite(s?.x) && Number.isFinite(s?.y)
  );
  if (!hasValidSeat) return false;

  // 4) Subwoofer positions where the design contains subs
  const hasValidSubPositions = (cfg) => {
    if (!cfg || Number(cfg.count) <= 0) return true; // no subs in design → no requirement
    const positions = Array.isArray(cfg?.positions) ? cfg.positions : [];
    return positions.some(
      (p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)
    );
  };
  if (!hasValidSubPositions(frontSubsCfg)) return false;
  if (!hasValidSubPositions(rearSubsCfg)) return false;

  return true;
}