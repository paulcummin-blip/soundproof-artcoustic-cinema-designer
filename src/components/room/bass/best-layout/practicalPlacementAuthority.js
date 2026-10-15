// practicalPlacementAuthority.js
// ---------------------------------------------------------------------------
// ONE authority for what counts as a PRACTICAL subwoofer placement, and for
// describing a practical placement in design language.
//
// PRODUCT RULE — ADI's default placement search is constrained to positions a
// cinema installer would actually build:
//   - every subwoofer stays on its own front or rear wall
//   - movement is horizontal ALONG that wall (centre → quarter → third → corner)
//   - practical wall clearance is preserved
//
// Never a default recommendation (theoretical only):
//   - subwoofers in the middle of the room
//   - side-wall midpoints
//   - subwoofers floating away from a practical wall
//   - a subwoofer crossing from its front/rear wall to another wall
//   - the four-wall midpoint arrangement
//
// Those candidates remain available ONLY as labelled theoretical options, using
// THEORETICAL_PLACEMENT_LABEL, and never as the primary recommendation.
//
// Pure geometry classification and copy. No bass maths, no P19/P20 definition,
// no target-bank logic, no scoring, no ranking.
// ---------------------------------------------------------------------------

export const PLACEMENT_PRACTICALITY = Object.freeze({
  PRACTICAL: "practical",
  THEORETICAL: "theoretical",
});

/** Stated verbatim wherever a theoretical candidate is retained. */
export const THEORETICAL_PLACEMENT_LABEL = "Theoretical option — not normally practical.";

/**
 * How far a source centre may sit from the front or rear wall PLANE and still
 * count as being on that wall. Derived from the canonical placement guide inset
 * (BEST_SUB_LAYOUT_CONSTANTS.minimumWallClearanceM = 0.1 m) with allowance for
 * cabinet half-depth. Side walls are never practical walls in their own right —
 * only a corner (which lies on the front or rear plane AND a side wall) is.
 */
export const PRACTICAL_WALL_TOLERANCE_M = 0.2;

/**
 * The depth a source is installed at, unchanged, within this tolerance (m).
 * A source whose depth does not change is not moved in depth at all.
 */
export const INSTALLED_DEPTH_TOLERANCE_M = 0.001;

/**
 * A destination this close to the room's mid-length is a mid-room position.
 * The same rule the placement-move copy states, kept in one number.
 */
export const MID_ROOM_ZONE_M = 0.2;

/**
 * THE INSTALLED-DEPTH RULE (movement classification only).
 *
 * A movement is practical when it runs ALONG the wall each source is mounted on.
 * A source that is NOT moved in depth therefore keeps its own installed depth as
 * its practical depth: the depth a cabinet is installed at is the room as built,
 * not a proposal, and re-judging it against a nominal band refused to search
 * layouts that are genuinely wall-mounted — a rear pair set 218 mm off the wall,
 * or a front cabinet inside the nominal clearance, produced ZERO candidates for
 * the whole design. Only a source whose depth IS changed must land inside the
 * practical wall band. A source sitting at the room's mid-length stays
 * theoretical either way.
 */
export const INSTALLED_DEPTH_BASIS =
  "A source that is not moved in depth keeps its own installed depth: the placement search runs along the wall it "
  + "is already mounted on. A source whose depth does change must land on a practical front or rear wall.";

export const IMPRACTICAL_REASONS = Object.freeze({
  SIDE_WALL: "Side-wall position — not on a front or rear wall.",
  MID_ROOM: "Mid-room position — away from any practical wall.",
  WRONG_WALL: "Crosses to a different wall than its own.",
  OFF_WALL: "Leaves the subwoofer's own wall.",
  UNRESOLVED: "Position could not be resolved for this room.",
});

const WALL_FRONT = "front";
const WALL_REAR = "rear";

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

/** "front" | "rear" | null for a subwoofer instance's group. */
export function wallGroupOf(instance) {
  const group = String(instance?.legacyGroup || "").trim().toLowerCase();
  return group === WALL_FRONT || group === WALL_REAR ? group : null;
}

/** "front" | "rear" | null for a raw group value. */
export function normaliseWallGroup(value) {
  const group = String(value || "").trim().toLowerCase();
  return group === WALL_FRONT || group === WALL_REAR ? group : null;
}

/** Which practical wall plane a Y coordinate sits on, or null if it sits on neither. */
function wallPlaneOf(y, lengthM, toleranceM) {
  if (y == null || !(lengthM > 0)) return null;
  if (y <= toleranceM) return WALL_FRONT;
  if (y >= lengthM - toleranceM) return WALL_REAR;
  return null;
}

function reasonForOffWallPoint(point, roomDims, toleranceM) {
  const x = num(point?.x);
  const widthM = num(roomDims?.widthM);
  if (x != null && widthM > 0 && (x <= toleranceM || x >= widthM - toleranceM)) {
    return IMPRACTICAL_REASONS.SIDE_WALL;
  }
  return IMPRACTICAL_REASONS.MID_ROOM;
}

/**
 * Classify a SET of positions (absolute geometry) as practical or theoretical.
 * Used for the global placement pool, where candidates arrive as wall fractions.
 *
 * @param {object} params
 * @param {Array<{x:number,y:number}>} params.coordinates — positions in metres
 * @param {{widthM:number,lengthM:number}} params.roomDims
 * @param {Array<string|null>} [params.groups] — "front"/"rear" per position
 * @returns {{practical:boolean, reason:string|null, walls:Array<string|null>}}
 */
export function classifyPlacementPracticality({
  coordinates,
  roomDims,
  groups = [],
  wallToleranceM = PRACTICAL_WALL_TOLERANCE_M,
}) {
  const list = Array.isArray(coordinates) ? coordinates : [];
  const lengthM = num(roomDims?.lengthM);
  if (!list.length || !(lengthM > 0)) {
    return { practical: false, reason: IMPRACTICAL_REASONS.UNRESOLVED, walls: [] };
  }

  const walls = [];
  for (let index = 0; index < list.length; index++) {
    const wall = wallPlaneOf(num(list[index]?.y), lengthM, wallToleranceM);
    if (!wall) {
      return {
        practical: false,
        reason: reasonForOffWallPoint(list[index], roomDims, wallToleranceM),
        walls,
      };
    }
    const assigned = normaliseWallGroup(groups?.[index]);
    if (assigned && assigned !== wall) {
      return { practical: false, reason: IMPRACTICAL_REASONS.WRONG_WALL, walls };
    }
    walls.push(wall);
  }
  return { practical: true, reason: null, walls };
}

/** Which practical wall a depth sits on: the front or rear half of the room. */
function installedWallSideOf(y, lengthM) {
  const value = num(y);
  if (value == null || !(lengthM > 0)) return null;
  if (Math.abs(value - lengthM / 2) <= INSTALLED_DEPTH_TOLERANCE_M) return null;
  return value < lengthM / 2 ? WALL_FRONT : WALL_REAR;
}

/**
 * Classify a MOVEMENT from the current positions as practical or theoretical.
 *
 * A default-search movement is practical when every subwoofer stays on the wall
 * it is mounted on — its wall depth does not change. That is the product rule
 * "y remains at the current front/rear wall depth"; it excludes depth moves,
 * side/interior moves and wall crossings in one test.
 *
 * INSTALLED-DEPTH RULE: a source whose depth is unchanged keeps its own
 * installed depth (see INSTALLED_DEPTH_BASIS) — the room as built is not a
 * proposal to be re-judged. A source whose depth DOES change must land inside
 * the practical wall band, exactly as before.
 *
 * @param {object} params
 * @param {Array<{x:number,y:number}>} params.currentPositions
 * @param {Array<{x:number,y:number}>} params.coordinates
 * @param {Array<string|null>} [params.groups]
 */
export function classifyMovementPracticality({
  currentPositions,
  coordinates,
  roomDims,
  groups = [],
  wallToleranceM = PRACTICAL_WALL_TOLERANCE_M,
}) {
  const before = Array.isArray(currentPositions) ? currentPositions : [];
  const after = Array.isArray(coordinates) ? coordinates : [];
  const lengthM = num(roomDims?.lengthM);
  if (!after.length || !(lengthM > 0)) {
    return { practical: false, reason: IMPRACTICAL_REASONS.UNRESOLVED, walls: [] };
  }

  const walls = [];
  for (let index = 0; index < after.length; index++) {
    const afterY = num(after[index]?.y);
    const startY = num(before[index]?.y);
    const sameInstalledDepth = afterY != null && startY != null
      && Math.abs(afterY - startY) <= INSTALLED_DEPTH_TOLERANCE_M;

    if (sameInstalledDepth) {
      const startWall = installedWallSideOf(startY, lengthM);
      if (!startWall) {
        return { practical: false, reason: IMPRACTICAL_REASONS.MID_ROOM, walls };
      }
      if (Math.abs(startY - lengthM / 2) <= MID_ROOM_ZONE_M) {
        return { practical: false, reason: IMPRACTICAL_REASONS.MID_ROOM, walls };
      }
      const assigned = normaliseWallGroup(groups?.[index]);
      if (assigned && assigned !== startWall) {
        return { practical: false, reason: IMPRACTICAL_REASONS.WRONG_WALL, walls };
      }
      walls.push(startWall);
      continue;
    }

    const wall = wallPlaneOf(afterY, lengthM, wallToleranceM);
    if (!wall) {
      return {
        practical: false,
        reason: reasonForOffWallPoint(after[index], roomDims, wallToleranceM),
        walls,
      };
    }
    const startWall = wallPlaneOf(startY, lengthM, wallToleranceM);
    if (startWall && startWall !== wall) {
      return { practical: false, reason: IMPRACTICAL_REASONS.OFF_WALL, walls };
    }
    const assigned = normaliseWallGroup(groups?.[index]);
    if (assigned && assigned !== wall) {
      return { practical: false, reason: IMPRACTICAL_REASONS.WRONG_WALL, walls };
    }
    walls.push(wall);
  }
  return { practical: true, reason: null, walls };
}

/** True when a source sits on a practical (front or rear) wall plane. */
export function isOnPracticalWall(position, roomDims, wallToleranceM = PRACTICAL_WALL_TOLERANCE_M) {
  return wallPlaneOf(num(position?.y), num(roomDims?.lengthM), wallToleranceM) != null;
}

/**
 * The wall a source is INSTALLED on: its own front or rear half of the room, and
 * not the room's mid-length. This is the test a movement which keeps the
 * installed depth is judged by (see INSTALLED_DEPTH_BASIS), so "which wall is
 * this source on" is answered once, for both the classification and the wall
 * ladder that reaches along that wall.
 *
 * @returns {"front"|"rear"|null}
 */
export function isInstalledOnPracticalWall(position, roomDims) {
  const lengthM = num(roomDims?.lengthM);
  const y = num(position?.y);
  if (!(lengthM > 0) || y == null) return null;
  if (Math.abs(y - lengthM / 2) <= MID_ROOM_ZONE_M) return null;
  return installedWallSideOf(y, lengthM);
}

function round(value, digits = 3) {
  const numeric = num(value);
  return numeric == null ? null : Number(numeric.toFixed(digits));
}

/**
 * The durable record of a rejected theoretical candidate. Candidate ids and
 * coordinates live here (Engineer Details), never in client-facing copy.
 */
export function describeTheoreticalCandidate(candidate, classification = null) {
  const coordinates = Array.isArray(candidate?.coordinates) ? candidate.coordinates : [];
  return {
    id: candidate?.id || null,
    familyId: candidate?.familyId || null,
    label: THEORETICAL_PLACEMENT_LABEL,
    practicality: PLACEMENT_PRACTICALITY.THEORETICAL,
    reason: classification?.reason || null,
    coordinates: coordinates.map((point) => ({ x: round(point?.x), y: round(point?.y) })),
  };
}

function percentageOf(value, widthM) {
  return Math.round((Number(value) / widthM) * 100);
}

function percentageList(values, widthM) {
  const unique = [...new Set(values.map((value) => percentageOf(value, widthM)))];
  unique.sort((a, b) => a - b);
  return unique.map((value) => `${value}%`);
}

/**
 * Practical design language for a recommended placement.
 *
 * @param {object} params
 * @param {Array} params.instances — current subwoofer instances (grouped)
 * @param {Array<{x:number,y:number}>} params.coordinates — recommended positions
 * @param {{widthM:number}} [params.roomDims] — enables the wall-position sentence
 * @returns {{summary:string|null, wallPosition:string|null}}
 */
export function describePracticalPlacement({ instances = [], coordinates = [], roomDims = null }) {
  const active = (Array.isArray(instances) ? instances : []).filter((instance) => instance?.enabled !== false);
  const after = Array.isArray(coordinates) ? coordinates : [];
  if (!active.length || active.length !== after.length) return { summary: null, wallPosition: null };

  const groups = active.map(wallGroupOf);
  const phrases = [];
  const positionsByGroup = {};

  for (const group of [WALL_FRONT, WALL_REAR]) {
    const indexes = groups.map((value, index) => (value === group ? index : -1)).filter((index) => index >= 0);
    if (!indexes.length) continue;

    const beforeX = indexes.map((index) => num(active[index]?.position?.x) ?? 0);
    const afterX = indexes.map((index) => num(after[index]?.x) ?? 0);
    const spread = (values) => (values.length > 1 ? Math.max(...values) - Math.min(...values) : 0);
    const deltaSpread = spread(afterX) - spread(beforeX);
    const moved = afterX.some((value, index) => Math.abs(value - beforeX[index]) > 0.02);

    if (moved) {
      if (deltaSpread > 0.05) phrases.push(`${group} subs wider along the ${group} wall`);
      else if (deltaSpread < -0.05) phrases.push(`${group} subs closer together along the ${group} wall`);
      else phrases.push(`${group} subs along the ${group} wall`);
    }
    positionsByGroup[group] = afterX;
  }

  const summary = phrases.length ? `Move the ${phrases.join(" and the ")}.` : null;

  const widthM = num(roomDims?.widthM);
  let wallPosition = null;
  if (widthM > 0) {
    const front = percentageList(positionsByGroup[WALL_FRONT] || [], widthM);
    const rear = percentageList(positionsByGroup[WALL_REAR] || [], widthM);
    const join = (values) => values.join(" and ");
    if (front.length && rear.length && join(front) === join(rear)) {
      wallPosition = `Recommended practical wall position: front/rear subs at approximately ${join(front)} of room width.`;
    } else if (front.length && rear.length) {
      wallPosition = `Recommended practical wall position: front subs at approximately ${join(front)} and rear subs at approximately ${join(rear)} of room width.`;
    } else {
      const only = front.length ? { group: WALL_FRONT, values: front } : rear.length ? { group: WALL_REAR, values: rear } : null;
      if (only) {
        wallPosition = `Recommended practical wall position: ${only.group} subs at approximately ${join(only.values)} of room width.`;
      }
    }
  }

  return { summary, wallPosition };
}