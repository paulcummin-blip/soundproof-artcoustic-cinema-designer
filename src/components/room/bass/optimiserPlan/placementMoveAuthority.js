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

import { subwooferGroupNoun } from "./placementPlausibilityAuthority.js";

/** The fixed explanation of what the lever means. */
export const PLACEMENT_DEFINITION =
  "Placement means moving the physical subwoofer locations.";

/**
 * The placement card's title. It names the DECISION the designer is making — a
 * subwoofer placement — and never the lever's internal name. The lever's own
 * wording ("Placement — move subwoofers") states no destination, so it is not
 * the heading of a card whose job is to state one.
 */
export const PLACEMENT_PANEL_TITLE = "Subwoofer placement recommendation";

/** Stated for a movement that leaves the practical, wall-based envelope. */
export const PLACEMENT_THEORETICAL_NOTE =
  "Theoretical option — not offered as default placement.";

/** Stated while no on-plan preview of the proposed positions exists. */
export const PLACEMENT_PREVIEW_UNAVAILABLE = "Preview not yet available.";

/** Stated once the evaluated positions have been written to the design. */
export const PLACEMENT_APPLIED_MESSAGE = "Placement applied";

/** Stated once the previous positions have been restored. */
export const PLACEMENT_UNDONE_MESSAGE = "Placement undone";

/**
 * The copy when the saved run measured a placement improvement but did NOT keep
 * the exact move with it. Nothing physical can be stated, so no placement
 * recommendation is offered at all: the card says what is missing and names the
 * ONE action that produces the move.
 *
 * ONE wording for every surface that has to state it — the placement card, the
 * tested-lever ledger and the plan's own notes all read this constant.
 */
export const PLACEMENT_MOVE_NOT_RETAINED =
  "ADI found that subwoofer placement may improve the result, but the saved run does not contain the exact move. Re-run Bass Optimiser to generate a placement recommendation.";

/** The same copy when the design itself has moved on since the evaluation. */
export const PLACEMENT_PREVIOUS_FOUND_STALE =
  "Previous result found a possible improvement. Re-run ADI on the current design before applying any change. The design has changed since that evaluation.";

/**
 * The copy when the evaluation's own baseline is not the P20 the design measures
 * now. The design has not changed — the comparison was simply made against a
 * different current result, so it is stated as that run's evidence.
 */
export const PLACEMENT_BASELINE_MISMATCH =
  "This evaluation compared its candidate with the result it measured when it ran, which is not the result the design measures now. Re-run ADI on the current design before applying any change.";

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

// Quantity-aware: one front subwoofer is stated as "the front subwoofer", two as
// "the front subwoofers". With no layout census to read, the neutral plural is
// kept rather than a quantity being invented.
const groupNoun = (group, layoutCounts = null) => subwooferGroupNoun(group, layoutCounts);

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

/** Whole millimetres — the granularity an installer works to, never a decimal. */
function millimetres(metres) {
  const value = num(metres);
  return value == null ? null : Math.round(Math.abs(value) * 1000);
}

/** A subwoofer's distance from the NEARER side wall, in whole millimetres. */
function sideWallMillimetres(x, widthM) {
  const value = num(x);
  const width = num(widthM);
  if (value == null || width == null) return null;
  return Math.round(Math.min(value, width - value) * 1000);
}

/** "700 mm and 1 700 mm from the nearest side wall" — the positions themselves. */
function distancesText(values) {
  const list = (Array.isArray(values) ? values : []).filter((value) => value != null);
  if (list.length === 0) return null;
  return `${list.join(" mm and ")} mm from the nearest side wall`;
}

/** Which way ONE wall group moves, read from the room's own centreline. */
function groupDirection(groupRows, centre) {
  if (centre == null) return null;
  const outward = groupRows.every((row) => Math.abs(num(row.change.toX) - centre) > Math.abs(num(row.change.fromX) - centre));
  if (outward) return "outward";
  const inward = groupRows.every((row) => Math.abs(num(row.change.toX) - centre) < Math.abs(num(row.change.fromX) - centre));
  return inward ? "inward" : null;
}

/** "Sub 3 and Sub 4" — the subwoofers that actually move, named. */
function listText(items) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * Describe a placement change in installer language.
 *
 * @param {object} params
 * @param {Array} params.changes - the persisted placement changes (fromX/fromY → toX/toY)
 * @param {object|null} [params.roomDims] - { widthM, lengthM, heightM }, optional
 * @param {object|null} [params.layoutCounts] - { front, rear, total, known }: the
 *   subwoofer census of the CURRENT layout, so the wording names one subwoofer as
 *   one. Omitted → the neutral plural.
 * @returns {object|null} null when no change can be described
 *   { practical, theoreticalReason, movementLabel, wallStatement, movementMm, moves,
 *     movesByGroup, unambiguous }
 */
export function describePlacementMove({ changes = [], roomDims = null, layoutCounts = null } = {}) {
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
  // One movement in one direction, or none: a change set whose rows do not all
  // move the same way is not a single physical move.
  const outwardCount = centre != null
    ? rows.filter((row) => Math.abs(num(row.change.toX) - centre) > Math.abs(num(row.change.fromX) - centre)).length
    : 0;
  const inwardCount = centre != null
    ? rows.filter((row) => Math.abs(num(row.change.toX) - centre) < Math.abs(num(row.change.fromX) - centre)).length
    : 0;
  const outward = centre != null ? outwardCount === rows.length : true;
  const unambiguous = centre == null
    || outwardCount === rows.length
    || inwardCount === rows.length;
  // How many subwoofers move on each wall — the evidence a symmetry check reads.
  const movesByGroup = rows.reduce((counts, row) => {
    if (row.group === "front") counts.front += 1;
    else if (row.group === "rear") counts.rear += 1;
    return counts;
  }, { front: 0, rear: 0 });

  const distances = rows.map((row) => row.distanceMm).filter((value) => value != null);
  const movementMm = distances.length
    ? roundMm(distances.reduce((sum, value) => sum + value, 0) / distances.length)
    : null;

  // A one-front / one-rear layout moved as a matched pair is stated as the pair
  // it is — the arrangement the designer actually built.
  const matchedFrontRearPair = layoutCounts?.known === true
    && num(layoutCounts.front) === 1
    && num(layoutCounts.rear) === 1
    && movesByGroup.front === 1
    && movesByGroup.rear === 1;
  const wallPhrase = matchedFrontRearPair
    ? `the front/rear pair ${outward ? "wider along their walls" : "along their walls"}`
    : orderedGroups(rows)
      .map((group) => `${groupNoun(group, layoutCounts)} ${outward ? "wider along" : "along"} ${wallNoun(group)}`)
      .join(" and ");
  const directionPhrase = outward
    ? "toward the nearest side wall"
    : !unambiguous ? "along the walls"
      : centre != null ? "toward the centre of the room" : "along the wall";
  const distancePhrase = movementMm != null ? `approximately ${movementMm} mm ` : "";

  const movementLabel = wallPhrase
    ? `Move ${wallPhrase} — ${distancePhrase}${directionPhrase}.`
    : `Move the subwoofers — ${distancePhrase}${directionPhrase}.`;

  // ── The move as the designer has to carry it out ──
  // One entry per wall group: which subwoofers move, where they are now, where
  // they go, and the movement between the two. Read from the evaluated
  // coordinates only — a position the run did not keep is stated as absent, never
  // guessed, and the whole block is simply omitted when nothing can be read.
  const widthM = num(roomDims?.widthM);
  const groups = orderedGroups(rows).map((group) => {
    const groupRows = rows.filter((row) => row.group === group);
    const wall = wallNoun(group);
    const subLabels = groupRows.map((row) => row.label || row.subId).filter(Boolean);
    const fromDistances = groupRows.map((row) => sideWallMillimetres(row.change?.fromX, widthM));
    const toDistances = groupRows.map((row) => sideWallMillimetres(row.change?.toX, widthM));
    const groupDistances = groupRows.map((row) => row.distanceMm).filter((value) => value != null);
    const groupMm = groupDistances.length
      ? roundMm(groupDistances.reduce((sum, value) => sum + value, 0) / groupDistances.length)
      : null;
    const direction = groupDirection(groupRows, centre);
    const everyFrom = fromDistances.every((value) => value != null);
    const everyTo = toDistances.every((value) => value != null);
    const fromDistancesText = everyFrom ? distancesText(fromDistances) : null;
    const toDistancesText = everyTo ? distancesText(toDistances) : null;
    const movement = direction === "inward"
      ? "inward, toward the centre of the room"
      : direction === "outward"
        ? "outward, toward the nearest side wall"
        : "along the wall";
    return {
      group,
      groupPhrase: groupNoun(group, layoutCounts),
      subLabels,
      subLabelsText: listText(subLabels),
      // "on the rear wall, 700 mm and 1 700 mm from the nearest side wall".
      fromText: fromDistancesText ? `on ${wall}, ${fromDistancesText}` : `on ${wall}`,
      toText: toDistancesText ? `on ${wall}, ${toDistancesText}` : `on ${wall}`,
      movementText: groupMm != null ? `${groupMm} mm ${movement}` : movement,
      distanceMm: groupMm,
    };
  });
  const allSubLabels = rows.map((row) => row.label || row.subId).filter(Boolean);

  return {
    practical,
    theoreticalReason: practical ? null : theoreticalReason(rows, roomDims),
    movementLabel,
    // The physical move itself, per wall group: which subwoofers, from where, to
    // where, and the movement in millimetres and direction.
    groups,
    subLabels: allSubLabels,
    subLabelsText: listText(allSubLabels),
    distanceText: movementMm != null ? `${movementMm} mm` : null,
    // Practical placement never asks for a wall change. Stated with the move.
    wallStatement: practical
      ? "Front and rear subs stay on their own wall — the movement is along the wall."
      : null,
    movementMm,
    // Whether the change set is ONE movement in ONE direction, and how many
    // subwoofers move on each wall.
    unambiguous,
    movesByGroup,
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