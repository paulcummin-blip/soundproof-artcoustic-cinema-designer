/**
 * Passive selector for the RP23 Screen Size / Seating client visual.
 * Seat angle, level, scoped floors and explanatory counts come exclusively
 * from engineeringSummary.viewing. This file performs presentation layout
 * only and never re-grades RP23.
 */

function levelToKey(level) {
  return level ? String(level).toLowerCase() : "below-l1";
}

function levelToLabel(level) {
  return level || "Below L1";
}

function parseAspectRatio(arStr) {
  const str = (arStr || "16:9").toString();
  const parts = str.includes(":") ? str.split(":").map(Number) : [16, 9];
  const [arW, arH] = parts;
  return (Number.isFinite(arW) && Number.isFinite(arH) && arW > 0 && arH > 0)
    ? arW / arH
    : 16 / 9;
}

function computeProjectorLumens(screenWidthM, aspectRatio) {
  const width = Number(screenWidthM);
  if (!width || width <= 0) return null;
  const visibleHeightM = width / parseAspectRatio(aspectRatio);
  return Math.round(((108 * Math.PI * width * visibleHeightM) / 0.6) / 10) * 10;
}

function buildExplanation(seats) {
  if (!seats.length) return "";
  const l4Count = seats.filter((seat) => seat.level === "l4").length;
  const l3Count = seats.filter((seat) => seat.level === "l3").length;
  const belowCount = seats.filter((seat) => seat.level === "below-l1").length;
  if (l4Count === seats.length) return `All ${seats.length} seat${seats.length === 1 ? "" : "s"} are within the Level 4 viewing range.`;
  if (l4Count > 0 && belowCount === 0) return `${l4Count} of ${seats.length} seats are within the Level 4 viewing range; the remainder are within Level 3.`;
  if (l4Count > 0) return `${l4Count} of ${seats.length} seats are within the Level 4 viewing range; ${belowCount} are below Level 1.`;
  if (l3Count > 0 && belowCount === 0) return "All seats are within the Level 3 viewing range.";
  if (belowCount > 0) return `${belowCount} of ${seats.length} seat${belowCount === 1 ? "" : "s"} are below the Level 1 viewing range.`;
  return "";
}

export function selectClientScreenSeating({
  seatingPositions,
  screenFrontPlaneM,
  screenWidthM,
  aspectRatio,
  engineeringSummary,
}) {
  const viewing = engineeringSummary?.viewing;
  if (!Array.isArray(seatingPositions) || !viewing?.available) {
    return { seats: [], zones: [], hasAny: false, explanation: "", projectorLumens: null };
  }

  const authorityBySeatId = new Map(
    (viewing.per_seat || []).map((result) => [String(result?.seat_id), result]),
  );
  const frontY = Number(screenFrontPlaneM) || 0.2;
  const seats = seatingPositions.map((seat) => {
    const authority = authorityBySeatId.get(String(seat?.id));
    if (!authority || !Number.isFinite(Number(authority.horizontal_angle_deg))) return null;
    const x = Number(seat?.x);
    const y = Number(seat?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const level = authority.rp23_level || null;
    return {
      id: seat.id,
      x,
      y,
      distanceM: Math.max(0, y - frontY),
      angleDeg: Number(authority.horizontal_angle_deg),
      level: levelToKey(level),
      levelLabel: levelToLabel(level),
      formatted: `${Number(authority.horizontal_angle_deg).toFixed(1)}°`,
      isPrimary: authority.priority === "primary",
    };
  }).filter(Boolean);

  return {
    seats,
    // RP23 zone bands were previously re-derived by re-running the grading
    // function inside the report. They are intentionally omitted: only the
    // canonical published seat results are visualised.
    zones: [],
    hasAny: seats.length > 0,
    explanation: buildExplanation(seats),
    projectorLumens: computeProjectorLumens(screenWidthM, aspectRatio),
  };
}
