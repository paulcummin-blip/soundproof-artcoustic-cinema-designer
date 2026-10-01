// placementMoveAuthority.js
// ---------------------------------------------------------------------------
// What a PLACEMENT change physically means, in installer language — and whether
// it is a practical, wall-based move or a theoretical one.
//
// Product rules this exists to satisfy:
//   • Placement means moving the physical subwoofer locations. The designer is
//     told that in plain words, never with raw coordinates.
//   • Default placement advice is practical: front subs stay on the front wall,
//     rear subs stay on the rear wall, and the movement runs along the wall the
//     subwoofer is already mounted on.
//   • A movement that leaves the mounting wall, or lands mid-room, is a
//     THEORETICAL option. It is stated in Engineer details only and is never
//     offered as default placement.
//
// READ-ONLY: it describes the coordinates a completed run already evaluated. It
// evaluates nothing, scores nothing, recalculates nothing and changes no bass
// maths, no optimiser scoring and no RP22 definition.
// ---------------------------------------------------------------------------

/** The fixed explanation of what the lever means. */
export const PLACEMENT_DEFINITION =
  "Placement means moving the physical subwoofer locations.";

/** The placement panel's own title: the lever, and what it does. */
export const PLACEMENT_PANEL_TITLE = "Placement — move subwoofers";

/** Stated for a movement that leaves the practical, wall-based envelope. */
export const PLACEMENT_THEORETICAL_NOTE =
  "Theoretical option — not offered as default placement.";

/** Stated while no on-plan preview of the proposed positions exists. */
export const PLACEMENT_PREVIEW_UNAVAILABLE = "Preview not yet available.";

/** Stated once the evaluated positions have been written to the design. */
export const PLACEMENT_APPLIED_MESSAGE = "Placement applied";

/** Stated once the previous positions have been restored. */
export const PLACEMENT_UNDONE_MESSAGE = "Placement undone";

/** The previous-improvement copy: the evaluated positions are not offered now. */
export const PLACEMENT_PREVIOUS_FOUND =
  "Previous placement improvement found. Re-run ADI on the current design before applying.";

/** The previous-improvement copy when the design itself has moved on. */
export const PLACEMENT_PREVIOUS_FOUND_STALE =
  "Previous placement improvement found, but the design has changed. Re-run ADI before applying.";

/** A subwoofer may not leave the wall it is mounted on by more than this. */
const WALL_TOLERANCE_M = 0.15;

/** A position this close to the room's mid-length is a mid-room position. */
const MIDPOINT_TOLERANCE_M = 0.2;

const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/** Approximately 250 mm — the granularity an installer works to. */
const roundMm = (mm) => {
  if (!Number.isFinite(mm) || mm <= 0) return null;
  return Math.max(50, Math.round(mm / 50) * 50);
};

const groupNoun = (group) => (group === "front"
  ? "the front subs"
  : group === "rear" ? "the rear subs" : "the subwoofers");

const wallNoun = (group) => (group === "front"
  ? "the front wall"
  : group === "rear" ? "the rear wall" : "their wall");

/**
 * Is ONE evaluated change a practical, wall-based move?
 *
 * Practical means: the subwoofer stays on the wall it is mounted on (its
 * wall-normal coordinate is unchanged), and the movement runs along that wall.
 * With the room known, a destination that lands at the room's mid-length is
 * rejected as a mid-room position.
 */
export function isPracticalPlacementChange(change, roomDims = null) {
  const fromX = num(change?.fromX);
  const fromY = num(change?.fromY);
  const toX = num(change?.toX);
  const toY = num(change?.toY);
  // A move that cannot be read is never offered as practical.
  if (fromX == null || fromY == null || toX == null || toY == null) return false;
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.abs(dy) > WALL_TOLERANCE_M) return false;
  if (Math.abs(dx) < Math.abs(dy)) return false;

  const lengthM = num(roomDims?.lengthM);
  if (lengthM != null && Math.abs(toY - lengthM / 2) <= MIDPOINT_TOLERANCE_M) return false;
  return true;
}

/** The factual reason a change is theoretical, or null when it is practical. */
function theoreticalReason(rows, roomDims) {
  const lengthM = num(roomDims?.lengthM);
  const offWall = rows.some((row) => Math.abs(row.dy) > WALL_TOLERANCE_M);
  const midRoom = lengthM != null
    && rows.some((row) => Math.abs(num(row.change?.toY) - lengthM / 2) <= MIDPOINT_TOLERANCE_M);
  const acrossWall = rows.some((row) => Math.abs(row.dx) < Math.abs(row.dy));

  const reasons = [];
  if (offWall) reasons.push("an evaluated position leaves the wall the subwoofer is mounted on");
  if (midRoom) reasons.push("an evaluated position sits in the middle of the room");
  if (!offWall && !midRoom && acrossWall) reasons.push("the evaluated movement runs across the room rather than along the wall");
  if (reasons.length === 0) reasons.push("the evaluated position is not a wall-based position");
  return reasons.join("; ") + ".";
}

/** Front subs first, then rear subs, then any ungrouped subwoofer. */
function orderedGroups(rows) {
  const groups = [];
  for (const group of ["front", "rear", null]) {
    if (rows.some((row) => row.group === group)) groups.push(group);
  }
  return groups;
}

/** The centreline the movement is measured from: the room, or the subs' own line. */
function centreX(rows, roomDims) {
  const widthM = num(roomDims?.widthM);
  if (widthM != null) return widthM / 2;
  const fromXs = rows.map((row) => num(row.change?.fromX)).filter((value) => value != null);
  if (!fromXs.length) return null;
  return fromXs.reduce((sum, value) => sum + value, 0) / fromXs.length;
}

/**
 * Describe a placement change in installer language.
 *
 * @param {object} params
 * @param {Array} params.changes - the persisted placement changes (fromX/fromY → toX/toY)
 * @param {object|null} [params.roomDims] - { widthM, lengthM, heightM }, optional
 * @returns {object|null} null when no change can be described
 *   { practical, theoreticalReason, movementLabel, wallStatement, movementMm, moves }
 */
export function describePlacementMove({ changes = [], roomDims = null } = {}) {
  const rows = (Array.isArray(changes) ? changes : [])
    .map((change) => {
      const fromX = num(change?.fromX);
      const fromY = num(change?.fromY);
      const toX = num(change?.toX);
      const toY = num(change?.toY);
      const dx = toX != null && fromX != null ? toX - fromX : null;
      const dy = toY != null && fromY != null ? toY - fromY : null;
      const distanceMm = num(change?.distanceMm) != null
        ? Math.abs(Math.round(num(change.distanceMm)))
        : (dx != null && dy != null ? Math.round(Math.hypot(dx, dy) * 1000) : null);
      const group = change?.group === "front" || change?.group === "rear" ? change.group : null;
      return { change, group, dx, dy, distanceMm, practical: isPracticalPlacementChange(change, roomDims) };
    })
    .filter((row) => row.dx != null && row.dy != null);

  if (rows.length === 0) return null;

  const practical = rows.every((row) => row.practical);
  const centre = centreX(rows, roomDims);
  const outward = centre != null
    ? rows.every((row) => Math.abs(num(row.change.toX) - centre) > Math.abs(num(row.change.fromX) - centre))
    : true;

  const distances = rows.map((row) => row.distanceMm).filter((value) => value != null);
  const movementMm = distances.length
    ? roundMm(distances.reduce((sum, value) => sum + value, 0) / distances.length)
    : null;

  const wallPhrase = orderedGroups(rows)
    .map((group) => `${groupNoun(group)} ${outward ? "wider along" : "along"} ${wallNoun(group)}`)
    .join(" and ");
  const directionPhrase = outward
    ? "toward the nearest side wall"
    : centre != null ? "toward the centre of the room" : "along the wall";
  const distancePhrase = movementMm != null ? `approximately ${movementMm} mm ` : "";

  const movementLabel = wallPhrase
    ? `Move ${wallPhrase} — ${distancePhrase}${directionPhrase}.`
    : `Move the subwoofers — ${distancePhrase}${directionPhrase}.`;

  return {
    practical,
    theoreticalReason: practical ? null : theoreticalReason(rows, roomDims),
    movementLabel,
    // Practical placement never asks for a wall change. Stated with the move.
    wallStatement: practical
      ? "Front and rear subs stay on their own wall — the movement is along the wall."
      : null,
    movementMm,
    moves: rows.map((row) => ({
      subId: row.change?.subId || null,
      label: row.change?.label || row.change?.subId || null,
      group: row.group,
      distanceMm: row.distanceMm,
      practical: row.practical,
    })),
  };
}

/**
 * The plain-English line for ONE persisted change, for the plan card. Never
 * coordinates: those belong in Engineer details only.
 */
export function describePlacementChange(change) {
  const distanceMm = num(change?.distanceMm);
  const distance = distanceMm != null && distanceMm > 0 ? `${Math.round(Math.abs(distanceMm))} mm` : null;
  const direction = typeof change?.direction === "string" && change.direction.trim()
    ? change.direction.trim()
    : null;
  if (distance && direction) return `move ${distance} ${direction}, staying on its wall`;
  if (distance) return `move ${distance}, staying on its wall`;
  return "move along its wall";
}