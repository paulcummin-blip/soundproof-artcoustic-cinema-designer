// Bass Optimiser: physical candidate geometry contract for three active sources.
//
// A linked optimisation group controls movement/search variables only. It never
// replaces either physical source in the candidate geometry.
import { expect, test } from "vitest";

import {
  attachPhysicalSourceIdentity,
  generateAsymmetricPairCandidates,
  generateIndividualCandidatesForPhase,
  generateSymmetricCandidates,
  hasCompletePhysicalGeometry,
  identifyLayout,
} from "../components/room/bass/improveBassV2/positionCandidateGenerator.js";
import { generatePracticalWallLadderCandidates } from "../components/room/bass/improveBassV2/practicalWallSearch.js";
import { runPositionScreenPhase } from "../components/room/bass/improveBassV2/improveBassV2Escalation.js";

const ROOM = { widthM: 4.22, lengthM: 5, heightM: 2.4 };
const CABINET = { widthM: 0.2, depthM: 0.2, heightM: 0.5 };
const THREE = [
  { sourceId: "sub-front-1", x: 2.11, y: 0.145 },
  { sourceId: "sub-rear-1", x: 1.055, y: 4.8625 },
  { sourceId: "sub-rear-2", x: 3.165, y: 4.8625 },
];
const GROUPS = ["front", "rear", "rear"];

const complete = (candidate, count) => {
  expect(hasCompletePhysicalGeometry(candidate, count)).toBe(true);
  expect(candidate.coordinates).toHaveLength(count);
  expect(candidate.coordinates.every((point) =>
    Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
};

test("three sources are identified as a triad, never a quad with a null fourth slot", () => {
  const layout = identifyLayout(THREE);
  expect(layout.type).toBe("triad");
  expect(layout.subs).toHaveLength(3);
  expect(layout.subs.map((source) => source.originalIndex)).toEqual([0, 1, 2]);
  expect(Object.values(layout).includes(null)).toBe(false);
});

test("the two-pair local generators do not invent a fourth source for a triad", () => {
  expect(() => generateSymmetricCandidates(THREE, ROOM, CABINET)).not.toThrow();
  expect(() => generateAsymmetricPairCandidates(THREE, ROOM, CABINET)).not.toThrow();
  expect(generateSymmetricCandidates(THREE, ROOM, CABINET)).toEqual([]);
  expect(generateAsymmetricPairCandidates(THREE, ROOM, CABINET)).toEqual([]);
});

test("three-source practical placement candidates retain every physical source", () => {
  const candidates = generatePracticalWallLadderCandidates({
    currentPositions: THREE,
    roomDims: ROOM,
    cabinetDims: CABINET,
    groups: GROUPS,
  });
  expect(candidates.length).toBeGreaterThan(0);
  candidates.forEach((candidate) => complete(candidate, 3));

  const frontMove = candidates.find((candidate) =>
    candidate.id.startsWith("practical-wall-front-single-")
    && Math.abs(candidate.coordinates[0].x - THREE[0].x) > 0.02);
  expect(frontMove).toBeTruthy();
  expect(frontMove.coordinates[1]).toEqual({ x: THREE[1].x, y: THREE[1].y });
  expect(frontMove.coordinates[2]).toEqual({ x: THREE[2].x, y: THREE[2].y });

  const rearMove = candidates.find((candidate) =>
    candidate.id.startsWith("practical-wall-rear-")
    && Math.abs(candidate.coordinates[1].x - THREE[1].x) > 0.02
    && Math.abs(candidate.coordinates[2].x - THREE[2].x) > 0.02);
  expect(rearMove).toBeTruthy();
  expect(rearMove.coordinates[0]).toEqual({ x: THREE[0].x, y: THREE[0].y });
  expect(rearMove.coordinates[1]).toBeTruthy();
  expect(rearMove.coordinates[2]).toBeTruthy();
});

test("individual three-source candidates remain complete and bind to source ids by physical order", () => {
  const candidates = generateIndividualCandidatesForPhase(THREE, ROOM, CABINET);
  expect(candidates.length).toBeGreaterThan(0);
  for (const candidate of candidates) {
    complete(candidate, 3);
    const identified = attachPhysicalSourceIdentity(candidate.coordinates, THREE);
    expect(identified.map((point) => point.sourceId)).toEqual([
      "sub-front-1",
      "sub-rear-1",
      "sub-rear-2",
    ]);
  }
});

test("the live three-source wall topology screens and promotes only complete identified candidates", () => {
  const result = runPositionScreenPhase(
    "symmetric",
    THREE,
    ROOM,
    CABINET,
    [
      { id: "seat-primary", x: 1.8, y: 2.55, z: 1.2, priority: "primary" },
      { id: "seat-secondary", x: 3.0, y: 4.35, z: 1.5, priority: "secondary" },
    ],
    { x: 2.11, y: 2.55, z: 1.2 },
    0.05,
    GROUPS,
  );
  expect(result.funnel.generated).toBeGreaterThan(0);
  expect(result.funnel.geometryRejected).toBe(0);
  expect(result.promoted.length).toBeGreaterThan(0);
  for (const candidate of result.promoted) {
    complete(candidate, 3);
    expect(candidate.coordinates.map((point) => point.sourceId)).toEqual([
      "sub-front-1",
      "sub-rear-1",
      "sub-rear-2",
    ]);
    expect(candidate.finalist.sources.map((source) => source.sourceId)).toEqual([
      "sub-front-1",
      "sub-rear-1",
      "sub-rear-2",
    ]);
  }
});

test("malformed geometry is rejected at the candidate boundary", () => {
  expect(hasCompletePhysicalGeometry({
    coordinates: [{ x: 2.11, y: 0.145 }, { x: 1.055, y: 4.8625 }],
  }, 3)).toBe(false);
  expect(hasCompletePhysicalGeometry({
    coordinates: [{ x: 2.11, y: 0.145 }, null, { x: 3.165, y: 4.8625 }],
  }, 3)).toBe(false);
});

test("one, two and four-source geometry behaviour remains complete", () => {
  const layouts = [
    [{ sourceId: "one", x: 2.11, y: 0.145 }],
    [
      { sourceId: "left", x: 1.055, y: 0.145 },
      { sourceId: "right", x: 3.165, y: 0.145 },
    ],
    [
      { sourceId: "front-left", x: 1.055, y: 0.145 },
      { sourceId: "front-right", x: 3.165, y: 0.145 },
      { sourceId: "rear-left", x: 1.055, y: 4.8625 },
      { sourceId: "rear-right", x: 3.165, y: 4.8625 },
    ],
  ];

  for (const positions of layouts) {
    const families = [
      generateSymmetricCandidates(positions, ROOM, CABINET),
      generateAsymmetricPairCandidates(positions, ROOM, CABINET),
      generateIndividualCandidatesForPhase(positions, ROOM, CABINET),
    ];
    for (const candidate of families.flat()) complete(candidate, positions.length);
  }
});
