// stage1ThreeSubFamilies.js
// ---------------------------------------------------------------------------
// THREE-SOURCE layout families for the Stage 1 / Stage 2 placement optimiser.
//
// Stage 1 asks a design-independent question — "where else could these
// subwoofers stand, on the walls they are already on" — and answers it from
// families of canonical, practical wall positions. One, two and four sources had
// families; three sources had none, so a three-subwoofer design produced no
// alternative-layout candidates at all and no `three_sub_result` was published.
// These families close that gap.
//
// The four topologies a room can actually have are all represented:
//
//   A  front singleton + rear pair      THREE_FRONT_SINGLE_REAR_PAIR
//   B  front pair + rear singleton      THREE_FRONT_PAIR_REAR_SINGLE
//   C  asymmetric pair on one wall      THREE_ASYMMETRIC_REAR_PAIR
//   D  three distributed wall positions THREE_DISTRIBUTED_POSITIONS
//
// plus the boundary fallback, generated like the two- and four-source boundary
// customs when the normal families are exhausted.
//
// SOURCE ORDER IS FRONT FIRST, THEN REAR, and every family carries THREE
// explicit coordinates — one per physical source. A three-source candidate is
// therefore never a quad with a missing fourth slot, and a pair is never
// substituted for the two real sources it links.
//
// Point sources only (acoustic centres, normalised), exactly like every other
// Stage 1 family: no cabinet offsets, no tuning, no bass maths, no P19/P20.
// ---------------------------------------------------------------------------

export const THREE_SUB_FAMILY_IDS = Object.freeze({
  THREE_FRONT_SINGLE_REAR_PAIR: "THREE_FRONT_SINGLE_REAR_PAIR",
  THREE_FRONT_PAIR_REAR_SINGLE: "THREE_FRONT_PAIR_REAR_SINGLE",
  THREE_ASYMMETRIC_REAR_PAIR: "THREE_ASYMMETRIC_REAR_PAIR",
  THREE_DISTRIBUTED_POSITIONS: "THREE_DISTRIBUTED_POSITIONS",
  THREE_BOUNDARY_CUSTOM: "THREE_BOUNDARY_CUSTOM",
});

/** The families searched by the normal three-source Stage 1 pass. */
export const THREE_SUB_ENABLED_FAMILIES = Object.freeze([
  THREE_SUB_FAMILY_IDS.THREE_FRONT_SINGLE_REAR_PAIR,
  THREE_SUB_FAMILY_IDS.THREE_FRONT_PAIR_REAR_SINGLE,
  THREE_SUB_FAMILY_IDS.THREE_ASYMMETRIC_REAR_PAIR,
  THREE_SUB_FAMILY_IDS.THREE_DISTRIBUTED_POSITIONS,
]);

export const THREE_SUB_DISPLAY_METADATA = Object.freeze({
  [THREE_SUB_FAMILY_IDS.THREE_FRONT_SINGLE_REAR_PAIR]: {
    label: "Three subs · front sub with rear pair",
    description: "One subwoofer on the front wall with a mirrored pair on the rear wall",
  },
  [THREE_SUB_FAMILY_IDS.THREE_FRONT_PAIR_REAR_SINGLE]: {
    label: "Three subs · front pair with rear sub",
    description: "A mirrored pair on the front wall with one subwoofer on the rear wall",
  },
  [THREE_SUB_FAMILY_IDS.THREE_ASYMMETRIC_REAR_PAIR]: {
    label: "Three subs · asymmetric rear pair",
    description: "One subwoofer on the front wall with two rear subwoofers at unequal positions",
  },
  [THREE_SUB_FAMILY_IDS.THREE_DISTRIBUTED_POSITIONS]: {
    label: "Three subs · distributed wall positions",
    description: "Three subwoofers at practical wall positions with no mirrored pair",
  },
  [THREE_SUB_FAMILY_IDS.THREE_BOUNDARY_CUSTOM]: {
    label: "Three subs · boundary custom",
    description: "Custom boundary positions for three subwoofers",
  },
});

export const THREE_SUB_PREFERENCE_RANK = Object.freeze({
  [THREE_SUB_FAMILY_IDS.THREE_FRONT_SINGLE_REAR_PAIR]: 1,
  [THREE_SUB_FAMILY_IDS.THREE_FRONT_PAIR_REAR_SINGLE]: 2,
  [THREE_SUB_FAMILY_IDS.THREE_ASYMMETRIC_REAR_PAIR]: 3,
  [THREE_SUB_FAMILY_IDS.THREE_DISTRIBUTED_POSITIONS]: 4,
  [THREE_SUB_FAMILY_IDS.THREE_BOUNDARY_CUSTOM]: 5,
});

/** The canonical seed arrangement of each family, in the design's own words. */
export const THREE_SUB_FAMILY_SEEDS = Object.freeze({
  [THREE_SUB_FAMILY_IDS.THREE_FRONT_SINGLE_REAR_PAIR]: [
    { xNorm: 0.5, yNorm: 0 },
    { xNorm: 0.25, yNorm: 1 },
    { xNorm: 0.75, yNorm: 1 },
  ],
  [THREE_SUB_FAMILY_IDS.THREE_FRONT_PAIR_REAR_SINGLE]: [
    { xNorm: 0.25, yNorm: 0 },
    { xNorm: 0.75, yNorm: 0 },
    { xNorm: 0.5, yNorm: 1 },
  ],
  [THREE_SUB_FAMILY_IDS.THREE_ASYMMETRIC_REAR_PAIR]: [
    { xNorm: 0.5, yNorm: 0 },
    { xNorm: 0.2, yNorm: 1 },
    { xNorm: 0.5, yNorm: 1 },
  ],
  [THREE_SUB_FAMILY_IDS.THREE_DISTRIBUTED_POSITIONS]: [
    { xNorm: 0.25, yNorm: 0 },
    { xNorm: 0.25, yNorm: 1 },
    { xNorm: 0.5, yNorm: 1 },
  ],
  [THREE_SUB_FAMILY_IDS.THREE_BOUNDARY_CUSTOM]: [
    { xNorm: 0.2, yNorm: 0 },
    { xNorm: 0.2, yNorm: 1 },
    { xNorm: 0.8, yNorm: 1 },
  ],
});

/** Where the single source of a "one + pair" family stands. */
const SINGLETON_FRACTIONS = Object.freeze([0.5, 0.25, 0.75]);

/** How wide the mirrored pair stands, as a fraction of room width off centre. */
const PAIR_SPREADS = Object.freeze([0.25, 0.333, 0.15, 0.35]);

/** Unequal rear positions: no mirror, no clean pair. */
const ASYMMETRIC_REAR_PAIRS = Object.freeze([
  [0.2, 0.5],
  [0.15, 0.45],
  [0.25, 0.6],
  [0.1, 0.5],
]);

/** Three practical wall positions with no mirrored pair among them. */
const DISTRIBUTED_TRIPLES = Object.freeze([
  { front: 0.25, rear: [0.25, 0.5] },
  { front: 0.25, rear: [0.5, 0.75] },
  { front: 0.5, rear: [0.25, 0.5] },
  { front: 0.5, rear: [0.5, 0.75] },
  { front: 0.15, rear: [0.5, 0.85] },
  { front: 0.75, rear: [0.25, 0.5] },
]);

const roundNorm = (value) => Math.round(value * 1000) / 1000;

const front = (xNorm) => ({ xNorm: roundNorm(xNorm), yNorm: 0 });
const rear = (xNorm) => ({ xNorm: roundNorm(xNorm), yNorm: 1 });

/** One front source with a mirrored rear pair (topology A). */
function frontSingleRearPairPoints() {
  const points = [];
  for (const singleton of SINGLETON_FRACTIONS) {
    for (const spread of PAIR_SPREADS) {
      points.push([front(singleton), rear(0.5 - spread), rear(0.5 + spread)]);
    }
  }
  return points;
}

/** A mirrored front pair with one rear source (topology B). */
function frontPairRearSinglePoints() {
  const points = [];
  for (const singleton of SINGLETON_FRACTIONS) {
    for (const spread of PAIR_SPREADS) {
      points.push([front(0.5 - spread), front(0.5 + spread), rear(singleton)]);
    }
  }
  return points;
}

/** One front source with two unequally spaced rear sources (topology C). */
function asymmetricRearPairPoints() {
  return SINGLETON_FRACTIONS.flatMap((singleton) => ASYMMETRIC_REAR_PAIRS
    .map(([left, right]) => [front(singleton), rear(left), rear(right)]));
}

/** Three practical wall positions with no mirrored pair (topology D). */
function distributedPositionPoints() {
  return DISTRIBUTED_TRIPLES.map((triple) => [
    front(triple.front),
    rear(triple.rear[0]),
    rear(triple.rear[1]),
  ]);
}

/** The fallback arrangement, generated only when the normal families are done. */
export function threeSubFallbackPoints() {
  return [[front(0.2), rear(0.2), rear(0.8)]];
}

const POINT_BUILDERS = Object.freeze({
  [THREE_SUB_FAMILY_IDS.THREE_FRONT_SINGLE_REAR_PAIR]: frontSingleRearPairPoints,
  [THREE_SUB_FAMILY_IDS.THREE_FRONT_PAIR_REAR_SINGLE]: frontPairRearSinglePoints,
  [THREE_SUB_FAMILY_IDS.THREE_ASYMMETRIC_REAR_PAIR]: asymmetricRearPairPoints,
  [THREE_SUB_FAMILY_IDS.THREE_DISTRIBUTED_POSITIONS]: distributedPositionPoints,
  [THREE_SUB_FAMILY_IDS.THREE_BOUNDARY_CUSTOM]: threeSubFallbackPoints,
});

export function isThreeSubFamily(familyId) {
  return Object.prototype.hasOwnProperty.call(POINT_BUILDERS, String(familyId || ""));
}

/**
 * Every candidate arrangement of one three-source family, front wall first.
 * Each entry is three explicit points — one per physical source.
 */
export function threeSubFamilyPoints(familyId) {
  const builder = POINT_BUILDERS[String(familyId || "")];
  return builder ? builder() : [];
}

/** Which of the three sources hold the mirrored pair in a family. */
function pairIndexesOf(familyId) {
  const family = String(familyId || "");
  if (family === THREE_SUB_FAMILY_IDS.THREE_FRONT_SINGLE_REAR_PAIR) return [1, 2];
  if (family === THREE_SUB_FAMILY_IDS.THREE_FRONT_PAIR_REAR_SINGLE) return [0, 1];
  return null;
}

/**
 * The refinement parameter of a family's best candidate: how wide its mirrored
 * pair stands, plus where the sources that stand alone are, so the fine search
 * refines the arrangement that was actually found rather than a seed.
 *
 * @returns {{spread:number, singletons:Array<number>}|null}
 */
export function threeSubFamilyBestParam(candidate) {
  const sources = Array.isArray(candidate?.sources) ? candidate.sources : [];
  const indexes = pairIndexesOf(candidate?.familyId);
  if (sources.length !== 3 || !indexes) return null;

  const pairXs = indexes.map((index) => Number(sources[index]?.xNorm)).filter((value) => Number.isFinite(value));
  if (pairXs.length !== 2) return null;
  const spread = roundNorm(0.5 - Math.min(...pairXs.map((x) => Math.abs(x - 0.5))));

  const singletons = sources
    .map((source, index) => (indexes.includes(index) ? null : Number(source?.xNorm)))
    .filter((value) => Number.isFinite(value));
  if (singletons.length !== 1) return null;
  return { spread, singletons };
}

/**
 * The fine search around a family's best candidate: the same arrangement with
 * the pair's spread refined in 10 mm steps, the other sources held.
 */
export function threeSubFineFamilyPoints(familyId, param) {
  const spread = Number(param?.spread);
  const singletons = Array.isArray(param?.singletons) ? param.singletons : [0.5];
  if (!Number.isFinite(spread)) return [];
  const indexes = pairIndexesOf(familyId);
  if (!indexes) return [];

  const points = [];
  const pairOnFrontWall = indexes[0] === 0;
  const singletonIndex = [0, 1, 2].find((index) => !indexes.includes(index));
  for (let offset = -0.04; offset <= 0.04 + 1e-9; offset += 0.01) {
    const candidateSpread = roundNorm(spread + offset);
    if (candidateSpread < 0.05 || candidateSpread > 0.45) continue;
    const sources = new Array(3);
    const pairXs = [roundNorm(0.5 - candidateSpread), roundNorm(0.5 + candidateSpread)];
    indexes.forEach((sourceIndex, slot) => {
      sources[sourceIndex] = pairOnFrontWall ? front(pairXs[slot]) : rear(pairXs[slot]);
    });
    sources[singletonIndex] = pairOnFrontWall ? rear(singletons[0]) : front(singletons[0]);
    points.push(sources);
  }
  return points;
}