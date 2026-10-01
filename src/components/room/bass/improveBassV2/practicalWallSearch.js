// practicalWallSearch.js
// ---------------------------------------------------------------------------
// The DEFAULT practical placement search space: horizontal positions along the
// wall each subwoofer is already installed on.
//
// For every wall-assigned group (front / rear) the group moves ALONG ITS OWN
// WALL only — its wall depth (y) never changes. Positions are searched from the
// room centre outward through the fractions a designer actually installs at:
// quarter width, third width, wider quarter, near-corner and the wall corners.
//
// This is the counterpart to the local ±300 mm refinement in
// positionCandidateGenerator.js: that refines, this reaches.
//
// Point-source convention: coordinates are acoustic centres, matching the
// existing local position search. Wall clearance and minimum separation use the
// SAME validator as the local search (imported, never re-implemented).
//
// GENERATION ONLY. It changes no bass maths, ranks nothing, and scores nothing.
// ---------------------------------------------------------------------------

import { validateCandidateSet } from "./positionCandidateGenerator.js";
import { normaliseWallGroup, isOnPracticalWall } from "../best-layout/practicalPlacementAuthority.js";

const MID_FRACTION = 0.5;

/** Mirrored pair offsets from the room centreline (fraction of room width). */
const PAIR_OFFSETS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];

/** Single-subwoofer positions along its own wall. */
const SINGLE_FRACTIONS = [0.5, 0.25, 0.75, 0.333, 0.667, 0.15, 0.85, 0.1, 0.9];

const MOVEMENT_TOLERANCE_M = 0.02;

const percent = (value) => `${Math.round(value * 100)}%`;

function clonePositions(positions) {
  return positions.map((position) => ({ x: Number(position?.x) || 0, y: Number(position?.y) || 0 }));
}

/**
 * Which practical wall each subwoofer is currently on. Falls back to the
 * front/rear half of the room when no instance group is supplied, so a front
 * group can never be laddered onto the rear wall and vice versa.
 */
function resolveWallIndexes(positions, roomDims, groups) {
  const lengthM = Number(roomDims?.lengthM) || 0;
  const buckets = { front: [], rear: [] };
  positions.forEach((position, index) => {
    if (!isOnPracticalWall(position, roomDims)) return;
    const declared = normaliseWallGroup(groups?.[index]);
    const derived = Number(position?.y) <= lengthM / 2 ? "front" : "rear";
    buckets[declared || derived].push(index);
  });
  return buckets;
}

/**
 * Generate wall-constrained practical candidates.
 *
 * @param {object} params
 * @param {Array<{x:number,y:number}>} params.currentPositions
 * @param {{widthM:number,lengthM:number}} params.roomDims
 * @param {{widthM:number,depthM:number}} params.cabinetDims
 * @param {Array<string|null>} [params.groups] — "front"/"rear" per position
 * @returns {Array} candidates in the local position-search shape
 */
export function generatePracticalWallLadderCandidates({
  currentPositions,
  roomDims,
  cabinetDims,
  groups = [],
}) {
  const positions = Array.isArray(currentPositions) ? currentPositions : [];
  const widthM = Number(roomDims?.widthM) || 0;
  const lengthM = Number(roomDims?.lengthM) || 0;
  if (!positions.length || !(widthM > 0) || !(lengthM > 0)) return [];

  const subWidthM = cabinetDims?.widthM || 0.5;
  const subDepthM = cabinetDims?.depthM || 0.3;
  const buckets = resolveWallIndexes(positions, roomDims, groups);

  const candidates = [];
  const seen = new Set();

  function tryAdd(id, label, coordinates) {
    if (!validateCandidateSet(coordinates, roomDims, subWidthM, subDepthM)) return;
    const key = coordinates.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join("|");
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ id, label, movement: label, coordinates, phase: "practical-wall" });
  }

  /** Mirrored positions for a group: evenly spread either side of the centreline. */
  function spreadPositions(indexes, offsetFraction) {
    if (indexes.length === 1) return [widthM * offsetFraction];
    const span = offsetFraction * 2;
    return indexes.map((_, slot) => {
      const ratio = indexes.length === 1 ? 0 : slot / (indexes.length - 1);
      return widthM * (MID_FRACTION - offsetFraction + span * ratio);
    });
  }

  const groupsPresent = ["front", "rear"].filter((group) => buckets[group].length > 0);

  // ── Wall groups moving along their own wall ────────────────────────────
  for (const group of groupsPresent) {
    const indexes = buckets[group];
    if (indexes.length === 1) {
      for (const fraction of SINGLE_FRACTIONS) {
        const coordinates = clonePositions(positions);
        const x = widthM * fraction;
        if (Math.abs(x - positions[indexes[0]].x) < MOVEMENT_TOLERANCE_M) continue;
        coordinates[indexes[0]] = { x, y: positions[indexes[0]].y };
        tryAdd(
          `practical-wall-${group}-single-${percent(fraction)}`,
          `Move the ${group} sub along the ${group} wall to approximately ${percent(fraction)} of room width`,
          coordinates,
        );
      }
      continue;
    }

    for (const offset of PAIR_OFFSETS) {
      const spread = spreadPositions(indexes, offset);
      const coordinates = clonePositions(positions);
      indexes.forEach((index, slot) => {
        coordinates[index] = { x: spread[slot], y: positions[index].y };
      });
      const label = indexes.length === 2
        ? `Move the ${group} subs wider along the ${group} wall to approximately ${percent(MID_FRACTION - offset)} and ${percent(MID_FRACTION + offset)} of room width`
        : `Move the ${group} subs along the ${group} wall, spread from ${percent(MID_FRACTION - offset)} to ${percent(MID_FRACTION + offset)} of room width`;
      tryAdd(`practical-wall-${group}-${percent(offset)}`, label, coordinates);
    }
  }

  // ── Front and rear groups together at the same spread ──────────────────
  if (groupsPresent.length === 2) {
    for (const offset of PAIR_OFFSETS) {
      const coordinates = clonePositions(positions);
      for (const group of groupsPresent) {
        const indexes = buckets[group];
        const spread = spreadPositions(indexes, offset);
        indexes.forEach((index, slot) => {
          coordinates[index] = { x: spread[slot], y: positions[index].y };
        });
      }
      const label = `Move the front and rear subs wider along their own walls to approximately ${percent(MID_FRACTION - offset)} and ${percent(MID_FRACTION + offset)} of room width`;
      tryAdd(`practical-wall-both-${percent(offset)}`, label, coordinates);
    }
  }

  return candidates;
}