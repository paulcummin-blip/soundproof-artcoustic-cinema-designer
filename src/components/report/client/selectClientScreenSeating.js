/**
 * selectClientScreenSeating
 * -------------------------
 * Pure selector for the RP23 Screen Size / Seating client visual.
 *
 * Consumes the SAME canonical RP23 authority as the live app:
 *   rp23LevelForAngleDeg from viewingAngleUtils.jsx
 *
 * No second calculation authority — per-seat angle and level are
 * computed using the exact same formula and grading function.
 *
 * Zone distance boundaries are derived by SCANNING rp23LevelForAngleDeg
 * for exact level-transition angles, then converting those angles to
 * distances via: distance = (width/2) / tan(angle/2). This guarantees
 * the drawn zone boundaries match the grading function's inclusivity
 * rules exactly — including the sales-friendly ceil/floor/round
 * normalisation built into the authority.
 */

import { rp23LevelForAngleDeg } from "@/components/utils/viewingAngleUtils";

function angleToDistance(widthM, angleDeg) {
  if (!widthM || !angleDeg || angleDeg <= 0 || angleDeg >= 180) return Infinity;
  return (widthM / 2) / Math.tan((angleDeg * Math.PI / 180) / 2);
}

function levelToKey(level) {
  return level ? level.toLowerCase() : "below-l1";
}

function levelToLabel(level) {
  return level ? level : "Below L1";
}

/**
 * Scan rp23LevelForAngleDeg from high angle (close to screen) to low
 * angle (far from screen), finding every level transition. Convert
 * each transition angle to a distance from the screen front plane.
 *
 * Returns an ordered list of { distFromScreen, levelBefore, levelAfter }
 * from closest to farthest.
 */
function scanLevelTransitions(W) {
  const transitions = [];
  let prevLevel = rp23LevelForAngleDeg(180);

  // Use integer hundredths to avoid floating-point accumulation:
  // a = (17999 - i) / 100 gives exact values 179.99, 179.98, ..., 0.01
  for (let i = 0; i <= 17998; i++) {
    const a = (17999 - i) / 100;
    const level = rp23LevelForAngleDeg(a);
    if (level !== prevLevel) {
      transitions.push({
        angleDeg: a,
        distFromScreen: angleToDistance(W, a),
        levelBefore: prevLevel,
        levelAfter: level,
      });
      prevLevel = level;
    }
  }
  return transitions;
}

/**
 * Build zone rectangles from authority-scanned transitions.
 * Zones are ordered from close to screen → far from screen.
 * Each zone is clipped to the room boundaries [0, L].
 */
function buildZonesFromTransitions(W, frontY, L) {
  const transitions = scanLevelTransitions(W);

  const zones = [];
  let yStart = frontY;

  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i];
    const yEnd = frontY + t.distFromScreen;

    if (yEnd > yStart && yStart < L) {
      zones.push({
        key: `zone-${i}`,
        yStart: Math.max(0, yStart),
        yEnd: Math.min(L, yEnd),
        level: levelToKey(t.levelBefore),
        label: levelToLabel(t.levelBefore),
      });
    }
    yStart = Math.max(yStart, yEnd);
  }

  // Final zone (beyond last transition — typically "Below L1" too far)
  if (yStart < L) {
    const finalLevel =
      transitions.length > 0
        ? transitions[transitions.length - 1].levelAfter
        : null;
    zones.push({
      key: "zone-final",
      yStart: Math.max(0, yStart),
      yEnd: L,
      level: levelToKey(finalLevel),
      label: levelToLabel(finalLevel),
    });
  }

  return zones;
}

function buildExplanation(seats) {
  if (seats.length === 0) return "";

  const l4Count = seats.filter((s) => s.level === "l4").length;
  const l3Count = seats.filter((s) => s.level === "l3").length;
  const belowCount = seats.filter((s) => s.level === "below-l1").length;

  if (l4Count === seats.length) {
    return "The screen size is well matched to the seating area, placing all seats within the preferred viewing range for an immersive, comfortable experience.";
  }
  if (l4Count > 0 && belowCount === 0) {
    return "The screen size is well matched to the seating area, placing the main listening positions within the preferred viewing range while showing how viewing experience changes across the row.";
  }
  if (l4Count > 0) {
    return "The centre seats sit within the preferred viewing range, while some outer seats are closer to the limits of comfortable viewing.";
  }
  if (l3Count > 0 && belowCount === 0) {
    return "The seating area falls within a good viewing range, though the screen size could be adjusted to bring more seats into the preferred viewing position.";
  }
  return "The current screen size places the seating area outside the preferred viewing range. Adjusting the screen size or seating position would improve the viewing experience.";
}

export function selectClientScreenSeating({
  seatingPositions,
  screenFrontPlaneM,
  screenWidthM,
  roomLengthM,
}) {
  if (!Array.isArray(seatingPositions) || !screenWidthM || seatingPositions.length === 0) {
    return { seats: [], zones: [], hasAny: false, explanation: "" };
  }

  const W = Number(screenWidthM);
  const frontY = Number(screenFrontPlaneM) || 0.2;
  const L = Number(roomLengthM) || 6.0;

  if (!W || W <= 0) {
    return { seats: [], zones: [], hasAny: false, explanation: "" };
  }

  // Zone boundaries derived from the SAME authority function
  const zones = buildZonesFromTransitions(W, frontY, L);

  // Per-seat analysis — SAME formula + grading as live app
  const seats = seatingPositions
    .map((s) => {
      const x = Number(s.x);
      const y = Number(s.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const distance = Math.max(0, y - frontY);
      const angleDeg = W > 0 && distance > 0
        ? (2 * Math.atan((W / 2) / distance) * 180) / Math.PI
        : 0;
      const levelStr = rp23LevelForAngleDeg(angleDeg);
      const level = levelToKey(levelStr);
      return {
        id: s.id || `seat-${x.toFixed(2)}-${y.toFixed(2)}`,
        x,
        y,
        distanceM: distance,
        angleDeg,
        level,
        levelLabel: levelToLabel(levelStr),
        formatted: `${angleDeg.toFixed(1)}°`,
        isStrongest: levelStr === "L4",
      };
    })
    .filter(Boolean);

  const explanation = buildExplanation(seats);

  return { seats, zones, hasAny: seats.length > 0, explanation };
}