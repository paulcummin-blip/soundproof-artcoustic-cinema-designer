// triadPlacementSearch.js
// ---------------------------------------------------------------------------
// PRACTICAL placement search for exactly THREE active subwoofers.
//
// Three sources are not two pairs and not a quad. Their complete geometry is
// three explicit coordinates, and this module generates candidates for the four
// topologies a room can actually have:
//
//   A  front singleton + rear pair      (the pair moves together, the singleton
//                                        moves along its own wall)
//   B  front pair + rear singleton
//   C  three asymmetric sources         (no mirrored pair — each source is its
//                                        own movement variable)
//   D  three sources on practical wall positions with no clean pair
//
// GROUP INTENT IS PRESERVED, NEVER SUBSTITUTED FOR GEOMETRY: when two of the
// three are a practical symmetric pair (practicalPairAuthority), the pair moves
// as ONE movement variable — and both physical coordinates are still written
// explicitly into every candidate, each at its own installed depth. A candidate
// always carries three finite coordinates: one per physical source.
//
// PRACTICAL BY CONSTRUCTION: every movement runs ALONG the wall the source is
// already mounted on (its installed depth is never changed), so no mid-room,
// side-wall or wall-crossing position is ever manufactured to pad the count.
// Depth changes are decided by the product's practical-placement rule, not here.
//
// GENERATION ONLY: it ranks nothing, scores nothing, changes no bass maths and
// no P19/P20 definition.
// ---------------------------------------------------------------------------

import { validateCandidateSet } from "./positionCandidateGenerator.js";
import { classifySymmetricPair } from "./practicalPairAuthority.js";
import { normaliseWallGroup, classifyMovementPracticality, PLACEMENT_PRACTICALITY } from "../best-layout/practicalPlacementAuthority.js";

/** How far the linked pair moves as one variable (mm). */
export const TRIAD_PAIR_STEPS_MM = Object.freeze([100, 200, 300]);

/** How far the remaining single source moves along its own wall (mm). */
export const TRIAD_SINGLE_STEPS_MM = Object.freeze([100, 200, 300]);

/** Independent single-source movement, one source at a time (mm). */
export const TRIAD_INDIVIDUAL_STEPS_MM = Object.freeze([100, 200]);

/** Mirrored pair spreads along the wall, as a fraction of room width off centre. */
export const TRIAD_PAIR_SPREADS = Object.freeze([0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4]);

/** Practical wall positions for a single source, as a fraction of room width. */
export const TRIAD_WALL_FRACTIONS = Object.freeze([0.5, 0.25, 0.75, 0.333, 0.667, 0.15, 0.85]);

/** Distinct wall positions for a source with no clean pair to join. */
export const TRIAD_DISTRIBUTED_FRACTIONS = Object.freeze([0.25, 0.5, 0.75, 0.333, 0.667]);

/**
 * The ceiling on generated three-source candidates in one phase. Three physical
 * coordinates per candidate is where a combinatorial search would explode, so
 * each phase is bounded and the bound is stated with the workload.
 */
export const TRIAD_MAX_CANDIDATES = 48;

export const TRIAD_TOPOLOGY = Object.freeze({
  FRONT_SINGLE_REAR_PAIR: "front-singleton-rear-pair",
  FRONT_PAIR_REAR_SINGLE: "front-pair-rear-singleton",
  ASYMMETRIC: "three-asymmetric",
  DISTRIBUTED: "distributed-wall-positions",
});

const MOVEMENT_TOLERANCE_M = 0.02;

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const round3 = (value) => Number(Number(value).toFixed(3));
const percent = (value) => `${Math.round(value * 100)}%`;

function clonePositions(positions) {
  return positions.map((point) => ({ ...point, x: num(point?.x), y: num(point?.y) }));
}

/** Which practical wall a source sits on: the front or rear half of the room. */
function wallSideOf(y, lengthM) {
  const value = num(y);
  if (value == null || !(lengthM > 0)) return null;
  if (Math.abs(value - lengthM / 2) <= MOVEMENT_TOLERANCE_M) return null;
  return value < lengthM / 2 ? "front" : "rear";
}

/**
 * Read the layout of three active sources: which two are the installed pair,
 * which one stands alone, and therefore which topology this room has.
 *
 * @param {Array<{x:number,y:number,sourceId?:string,model?:string}>} currentPositions
 * @param {{widthM:number,lengthM:number}} roomDims
 * @param {Array<string|null>} [groups] - "front"/"rear" per position
 * @returns {object|null}
 */
export function resolveTriadTopology(currentPositions, roomDims, groups = []) {
  const positions = Array.isArray(currentPositions) ? currentPositions : [];
  const widthM = num(roomDims?.widthM);
  const lengthM = num(roomDims?.lengthM);
  if (positions.length !== 3 || !(widthM > 0) || !(lengthM > 0)) return null;

  const rows = positions.map((point, index) => ({
    index,
    x: num(point?.x),
    y: num(point?.y),
    sourceId: point?.sourceId ?? null,
    model: point?.model ?? null,
    wall: normaliseWallGroup(groups?.[index]) || wallSideOf(point?.y, lengthM),
  }));
  if (rows.some((row) => row.x == null || row.y == null)) return null;

  // At most one mirrored pair can exist among three sources; when more than one
  // geometrically qualifies, the closest to a true mirror is the pair.
  let pair = null;
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      if (!rows[i].wall || rows[i].wall !== rows[j].wall) continue;
      const verdict = classifySymmetricPair(rows[i], rows[j], { widthM });
      if (!verdict.paired) continue;
      if (!pair
        || verdict.lateralOffsetM < pair.verdict.lateralOffsetM
        || (verdict.lateralOffsetM === pair.verdict.lateralOffsetM && verdict.depthDeltaM < pair.verdict.depthDeltaM)) {
        pair = { indexes: [i, j], wall: rows[i].wall, verdict };
      }
    }
  }

  const singletonIndex = pair
    ? [0, 1, 2].find((index) => !pair.indexes.includes(index))
    : null;
  const distinctWalls = new Set(rows.map((row) => row.wall).filter(Boolean));

  const topology = pair
    ? (pair.wall === "front" ? TRIAD_TOPOLOGY.FRONT_PAIR_REAR_SINGLE : TRIAD_TOPOLOGY.FRONT_SINGLE_REAR_PAIR)
    : (distinctWalls.size === 1 ? TRIAD_TOPOLOGY.ASYMMETRIC : TRIAD_TOPOLOGY.DISTRIBUTED);

  return {
    topology,
    pair: pair
      ? {
        indexes: pair.indexes,
        wall: pair.wall,
        lateralOffsetM: pair.verdict.lateralOffsetM,
        depthDeltaM: pair.verdict.depthDeltaM,
        identical: pair.verdict.identical,
      }
      : null,
    singleton: singletonIndex == null
      ? null
      : { index: singletonIndex, wall: rows[singletonIndex].wall, x: rows[singletonIndex].x },
    walls: rows.map((row) => row.wall),
    pairLabel: pair
      ? (pair.wall === "front" ? "front pair" : "rear pair")
      : null,
    singletonLabel: singletonIndex == null
      ? null
      : `${rows[singletonIndex].wall === "front" ? "front" : "rear"} subwoofer`,
  };
}

/** The shared generation context for one three-source phase. */
function buildContext(currentPositions, roomDims, cabinetDims, groups) {
  const widthM = num(roomDims?.widthM);
  const lengthM = num(roomDims?.lengthM);
  const positions = Array.isArray(currentPositions) ? currentPositions : [];
  if (positions.length !== 3 || !(widthM > 0) || !(lengthM > 0)) return null;

  const layout = resolveTriadTopology(positions, roomDims, groups);
  if (!layout) return null;

  const baseline = clonePositions(positions);
  const width = num(cabinetDims?.widthM) || 0.5;
  const depth = num(cabinetDims?.depthM) || 0.3;

  const candidates = [];
  const seen = new Set();

  /**
   * Every candidate passes the SAME validator as the local position search. The
   * installed depth of a source that is not moved in depth is taken as given
   * (the room as built); a source whose depth does change must clear it.
   */
  function tryAdd(id, label, coordinates) {
    if (coordinates.some((point) => num(point?.x) == null || num(point?.y) == null)) return;
    if (!validateCandidateSet(coordinates, roomDims, width, depth, { baselinePositions: baseline })) return;
    const key = coordinates.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join("|");
    if (seen.has(key)) return;
    seen.add(key);
    const verdict = classifyMovementPracticality({
      currentPositions: baseline,
      coordinates,
      roomDims,
      groups,
    });
    candidates.push({
      id,
      label,
      movement: label,
      coordinates: coordinates.map((point) => ({ ...point, x: round3(point.x), y: round3(point.y) })),
      practical: verdict.practical,
      practicality: verdict.practical ? PLACEMENT_PRACTICALITY.PRACTICAL : PLACEMENT_PRACTICALITY.THEORETICAL,
      impracticalReason: verdict.reason,
    });
  }

  return { widthM, lengthM, baseline, layout, groups, candidates, tryAdd };
}

/** Both coordinates of the linked pair, written explicitly at their own depths. */
function pairCoordinates(context, leftIndex, rightIndex, leftX, rightX) {
  const coordinates = clonePositions(context.baseline);
  coordinates[leftIndex] = { ...coordinates[leftIndex], x: leftX };
  coordinates[rightIndex] = { ...coordinates[rightIndex], x: rightX };
  return coordinates;
}

/** The linked pair widens or narrows about the room's centre line, together. */
function movePairAsOne(context, deltaM) {
  const [leftIndex, rightIndex] = context.layout.pair.indexes;
  const ordered = [leftIndex, rightIndex].sort((a, b) => context.baseline[a].x - context.baseline[b].x);
  const [firstIndex, secondIndex] = ordered;
  const centre = context.widthM / 2;
  const firstOutward = context.baseline[firstIndex].x < centre;
  const delta = firstOutward ? -deltaM : deltaM;
  const coordinates = pairCoordinates(
    context,
    firstIndex,
    secondIndex,
    context.baseline[firstIndex].x + delta,
    context.baseline[secondIndex].x - delta,
  );
  const direction = deltaM > 0 ? "wider" : "closer together";
  return {
    coordinates,
    label: `Move the ${context.layout.pairLabel} ${direction} by ${Math.abs(Math.round(deltaM * 1000))} mm `
      + `along the ${context.layout.pair.wall} wall`,
  };
}

/** One source moves along its own wall; the other two keep their positions. */
function moveSourceAlongWall(context, index, deltaM) {
  const coordinates = clonePositions(context.baseline);
  coordinates[index] = { ...coordinates[index], x: coordinates[index].x + deltaM };
  const direction = deltaM > 0 ? "right" : "left";
  const wall = context.layout.walls[index];
  return {
    coordinates,
    label: `Move the ${wall === "rear" ? "rear" : "front"} subwoofer ${direction} by `
      + `${Math.abs(Math.round(deltaM * 1000))} mm along the ${wall} wall`,
  };
}

const capCandidates = (candidates) => candidates.slice(0, TRIAD_MAX_CANDIDATES);

/**
 * Phase A — the installed pair moves as one variable, then the remaining source
 * moves along its own wall. Where no pair exists, each of the three sources is
 * moved along its own wall in turn.
 */
export function generateTriadSymmetricCandidates(currentPositions, roomDims, cabinetDims, groups = []) {
  const context = buildContext(currentPositions, roomDims, cabinetDims, groups);
  if (!context) return [];

  if (context.layout.pair) {
    for (const mm of TRIAD_PAIR_STEPS_MM) {
      for (const sign of [1, -1]) {
        const moved = movePairAsOne(context, sign * (mm / 1000));
        context.tryAdd(`triad-pair-${sign > 0 ? "wider" : "narrower"}-${mm}`, moved.label, moved.coordinates);
      }
    }
    for (const mm of TRIAD_SINGLE_STEPS_MM) {
      for (const sign of [1, -1]) {
        const moved = moveSourceAlongWall(context, context.layout.singleton.index, sign * (mm / 1000));
        context.tryAdd(`triad-single-${sign > 0 ? "right" : "left"}-${mm}`, moved.label, moved.coordinates);
      }
    }
    return capCandidates(context.candidates);
  }

  for (let index = 0; index < 3; index += 1) {
    for (const mm of TRIAD_SINGLE_STEPS_MM) {
      for (const sign of [1, -1]) {
        const moved = moveSourceAlongWall(context, index, sign * (mm / 1000));
        context.tryAdd(`triad-source${index + 1}-${sign > 0 ? "right" : "left"}-${mm}`, moved.label, moved.coordinates);
      }
    }
  }
  return capCandidates(context.candidates);
}

/**
 * Phase B — the pair's own spread and the singleton move ASYMMETRICALLY: the
 * linked pair is re-spread while the singleton holds, and the singleton moves
 * while the pair holds at a re-spread position. Grouping still decides which
 * coordinates move together; every coordinate stays explicit.
 */
export function generateTriadAsymmetricCandidates(currentPositions, roomDims, cabinetDims, groups = []) {
  const context = buildContext(currentPositions, roomDims, cabinetDims, groups);
  if (!context) return [];

  if (!context.layout.pair) {
    // Three independent sources: two move while the third holds.
    for (const mm of TRIAD_INDIVIDUAL_STEPS_MM) {
      for (const sign of [1, -1]) {
        for (let held = 0; held < 3; held += 1) {
          const coordinates = clonePositions(context.baseline);
          const moving = [0, 1, 2].filter((index) => index !== held);
          moving.forEach((index) => {
            coordinates[index] = { ...coordinates[index], x: coordinates[index].x + sign * (mm / 1000) };
          });
          context.tryAdd(
            `triad-pairmove-${moving.join("")}-${sign > 0 ? "right" : "left"}-${mm}`,
            `Move two of the three subwoofers ${sign > 0 ? "right" : "left"} by ${mm} mm along their walls`,
            coordinates,
          );
        }
      }
    }
    return capCandidates(context.candidates);
  }

  const [leftIndex, rightIndex] = context.layout.pair.indexes;
  const singletonIndex = context.layout.singleton.index;
  const centre = context.widthM / 2;

  for (const spread of TRIAD_PAIR_SPREADS) {
    const leftX = context.widthM * spread;
    const rightX = context.widthM * (1 - spread);
    const reSpreads = [
      pairCoordinates(context, leftIndex, rightIndex, leftX, rightX),
      pairCoordinates(context, leftIndex, rightIndex, centre - (centre - leftX) * 0.5, centre + (rightX - centre) * 0.5),
    ];
    reSpreads.forEach((coordinates, variant) => {
      context.tryAdd(
        `triad-respread-${Math.round(spread * 100)}-${variant}`,
        `Re-space the ${context.layout.pairLabel} about the room centre along the ${context.layout.pair.wall} wall, `
        + `then re-align the timing`,
        coordinates,
      );
    });
    // The singleton moves while the pair holds at this re-spread position.
    for (const sign of [1, -1]) {
      const coordinates = pairCoordinates(context, leftIndex, rightIndex, leftX, rightX);
      const singletonDelta = sign * 0.2;
      coordinates[singletonIndex] = {
        ...coordinates[singletonIndex],
        x: coordinates[singletonIndex].x + singletonDelta,
      };
      context.tryAdd(
        `triad-respread-${Math.round(spread * 100)}-single-${sign > 0 ? "right" : "left"}`,
        `Re-space the ${context.layout.pairLabel} and move the ${context.layout.singletonLabel} `
        + `${sign > 0 ? "right" : "left"} by 200 mm along its wall`,
        coordinates,
      );
    }
  }

  return capCandidates(context.candidates);
}

/**
 * Phase C — one source moves independently (three independent sources), each
 * along its own wall at its own installed depth.
 */
export function generateTriadIndividualCandidates(currentPositions, roomDims, cabinetDims) {
  const context = buildContext(currentPositions, roomDims, cabinetDims, []);
  if (!context) return [];

  for (let index = 0; index < 3; index += 1) {
    for (const mm of TRIAD_INDIVIDUAL_STEPS_MM) {
      for (const sign of [1, -1]) {
        const moved = moveSourceAlongWall(context, index, sign * (mm / 1000));
        context.tryAdd(
          `triad-individual-source${index + 1}-${sign > 0 ? "right" : "left"}-${mm}`,
          moved.label,
          moved.coordinates,
        );
      }
    }
  }
  return capCandidates(context.candidates);
}

/**
 * The practical WALL LADDER for three sources: the reach along each wall, at the
 * fractions a designer actually installs at, for the pair and for a source that
 * stands alone. Every candidate keeps each source on its own wall, so nothing
 * unusable is generated merely to raise the count.
 */
export function generateTriadWallLadderCandidates({ currentPositions, roomDims, cabinetDims, groups = [] } = {}) {
  const context = buildContext(currentPositions, roomDims, cabinetDims, groups);
  if (!context) return [];

  if (context.layout.pair) {
    const [leftIndex, rightIndex] = context.layout.pair.indexes;
    const singletonIndex = context.layout.singleton.index;

    // The pair reaches along its own wall, the remaining source at its own position.
    for (const spread of TRIAD_PAIR_SPREADS) {
      const coordinates = pairCoordinates(
        context, leftIndex, rightIndex, context.widthM * spread, context.widthM * (1 - spread),
      );
      context.tryAdd(
        `triad-ladder-pair-${percent(spread)}`,
        `Move the ${context.layout.pairLabel} wider along the ${context.layout.pair.wall} wall to approximately `
        + `${percent(spread)} and ${percent(1 - spread)} of room width`,
        coordinates,
      );
    }

    // The remaining source reaches along its own wall, the pair held.
    for (const fraction of TRIAD_WALL_FRACTIONS) {
      const x = context.widthM * fraction;
      if (Math.abs(x - context.baseline[singletonIndex].x) < MOVEMENT_TOLERANCE_M) continue;
      const coordinates = clonePositions(context.baseline);
      coordinates[singletonIndex] = { ...coordinates[singletonIndex], x };
      context.tryAdd(
        `triad-ladder-single-${percent(fraction)}`,
        `Move the ${context.layout.singletonLabel} along the ${context.layout.walls[singletonIndex]} wall to `
        + `approximately ${percent(fraction)} of room width`,
        coordinates,
      );
    }

    // Both together at the positions this topology is normally installed at.
    for (const [pairSpread, singleFraction] of [[0.25, 0.5], [0.333, 0.5], [0.25, 0.25], [0.15, 0.5], [0.35, 0.5]]) {
      const coordinates = pairCoordinates(
        context, leftIndex, rightIndex, context.widthM * pairSpread, context.widthM * (1 - pairSpread),
      );
      coordinates[singletonIndex] = { ...coordinates[singletonIndex], x: context.widthM * singleFraction };
      context.tryAdd(
        `triad-ladder-both-${percent(pairSpread)}-${percent(singleFraction)}`,
        `Move the ${context.layout.pairLabel} to approximately ${percent(pairSpread)} and ${percent(1 - pairSpread)} `
        + `of room width with the ${context.layout.singletonLabel} at approximately ${percent(singleFraction)}`,
        coordinates,
      );
    }
    return capCandidates(context.candidates);
  }

  // No clean pair: each source reaches along its own wall in turn, then a small
  // set of practical asymmetric distributions.
  for (let index = 0; index < 3; index += 1) {
    for (const fraction of TRIAD_DISTRIBUTED_FRACTIONS) {
      const x = context.widthM * fraction;
      if (Math.abs(x - context.baseline[index].x) < MOVEMENT_TOLERANCE_M) continue;
      const coordinates = clonePositions(context.baseline);
      coordinates[index] = { ...coordinates[index], x };
      context.tryAdd(
        `triad-ladder-distributed-source${index + 1}-${percent(fraction)}`,
        `Move a subwoofer along the ${context.layout.walls[index]} wall to approximately ${percent(fraction)} of room width`,
        coordinates,
      );
    }
  }

  const rearIndexes = [0, 1, 2].filter((index) => context.layout.walls[index] === "rear");
  const frontIndexes = [0, 1, 2].filter((index) => context.layout.walls[index] === "front");
  for (const [fractionA, fractionB] of [[0.25, 0.5], [0.5, 0.75], [0.15, 0.85], [0.333, 0.667]]) {
    if (rearIndexes.length < 2) break;
    const coordinates = clonePositions(context.baseline);
    coordinates[rearIndexes[0]] = { ...coordinates[rearIndexes[0]], x: context.widthM * fractionA };
    coordinates[rearIndexes[1]] = { ...coordinates[rearIndexes[1]], x: context.widthM * fractionB };
    if (frontIndexes.length === 1) {
      coordinates[frontIndexes[0]] = { ...coordinates[frontIndexes[0]], x: context.widthM * 0.5 };
    }
    context.tryAdd(
      `triad-ladder-distributed-rear-${percent(fractionA)}-${percent(fractionB)}`,
      `Re-space the two rear subwoofers to approximately ${percent(fractionA)} and ${percent(fractionB)} of room `
      + "width, leaving the front subwoofer in place",
      coordinates,
    );
  }

  return capCandidates(context.candidates);
}