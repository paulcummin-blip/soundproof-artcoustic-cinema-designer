// tmp-triad-measure.test.mjs — TEMPORARY measurement, deleted immediately after reading.
// Asks the engine's own functions what the REAL Barton layout now produces.
import { it } from "vitest";

import { runPositionScreenPhase } from "../components/room/bass/improveBassV2/improveBassV2Escalation.js";
import { gatherCandidates } from "../components/room/bass/improveBassV2/improveBassV2Engine.js";
import { detectSubwooferGroups, describeSubwooferGrouping } from "../components/room/bass/improveBassV2/subwooferGroupAuthority.js";
import { resolveTriadTopology } from "../components/room/bass/improveBassV2/triadPlacementSearch.js";
import { classifySymmetricPair } from "../components/room/bass/improveBassV2/practicalPairAuthority.js";
import { buildOptimiserRunWorkload } from "../components/room/bass/optimiserPlan/optimiserRunWorkload.js";
import { estimateOptimiserCalculations } from "../components/room/bass/optimiserPlan/optimiserCalculationEstimate.js";
import { getSpeakerModelMeta } from "../components/models/speakers/registry.jsx";
import { isIdenticalSymmetricPair, isPracticalSymmetricPair } from "../components/room/bass/improveBassV2/practicalPairAuthority.js";

const ROOM = { widthM: 4.22, lengthM: 5, heightM: 2.4 };
const SEATS = [
  { id: "seat-r1-c1", x: 1.21, y: 2.55, priority: "secondary", z: 1.2 },
  { id: "seat-r1-c2", x: 1.81, y: 2.55, priority: "primary", z: 1.2 },
  { id: "seat-r1-c3", x: 2.41, y: 2.55, priority: "primary", z: 1.2 },
  { id: "seat-r1-c4", x: 3.01, y: 2.55, priority: "secondary", z: 1.2 },
  { id: "seat-r2-c1", x: 1.21, y: 4.35, priority: "secondary", z: 1.5 },
  { id: "seat-r2-c2", x: 1.81, y: 4.35, priority: "primary", z: 1.5 },
  { id: "seat-r2-c3", x: 2.41, y: 4.35, priority: "primary", z: 1.5 },
  { id: "seat-r2-c4", x: 3.01, y: 4.35, priority: "secondary", z: 1.5 },
];

// REAL Barton design, in instance order (front first, then the two rear).
const BARTON = [
  { id: "sub-front-1", model: "sub4-12", enabled: true, legacyGroup: "front", position: { x: 2.11, y: 0.145 }, bottomHeightM: 0.05 },
  { id: "sub-front-2", model: "sub4-12", enabled: false, legacyGroup: "front", position: { x: 3.165, y: 0.16 }, bottomHeightM: 0.05 },
  { id: "sub-rear-1", model: "sub3-12", enabled: true, legacyGroup: "rear", position: { x: 1.055, y: 4.8625 }, bottomHeightM: 0.05 },
  { id: "sub-rear-2", model: "sub3-12", enabled: true, legacyGroup: "rear", position: { x: 3.165, y: 4.781553721926148 }, bottomHeightM: 0.05 },
];

// Two front + one rear (topology B) and three asymmetric sources (C/D).
const TWO_FRONT = [
  { id: "f1", model: "sub4-12", enabled: true, legacyGroup: "front", position: { x: 1.055, y: 0.16 } },
  { id: "f2", model: "sub4-12", enabled: true, legacyGroup: "front", position: { x: 3.165, y: 0.16 } },
  { id: "r1", model: "sub4-12", enabled: true, legacyGroup: "rear", position: { x: 2.11, y: 4.85 } },
];
const ASYMMETRIC = [
  { id: "f1", model: "sub4-12", enabled: true, legacyGroup: "front", position: { x: 1.4, y: 0.16 } },
  { id: "r1", model: "sub4-12", enabled: true, legacyGroup: "rear", position: { x: 2.2, y: 4.85 } },
  { id: "r2", model: "sub4-12", enabled: true, legacyGroup: "rear", position: { x: 3.0, y: 4.85 } },
];

const meta = getSpeakerModelMeta("sub4-12");
const CAB = { widthM: Number(meta?.widthM) || 0.5, depthM: Number(meta?.depthM) || 0.3, heightM: Number(meta?.heightM) || 0.5 };
const rsp = { x: 2.11, y: 2.55, z: 1.2 };

const measureLayout = (label, instances) => {
  const active = instances.filter((s) => s.enabled !== false);
  const positions = active.map((s) => ({ x: s.position.x, y: s.position.y, sourceId: s.id, model: s.model }));
  const groups = active.map((s) => s.legacyGroup);
  const phases = {};
  for (const phase of ["symmetric", "asymmetric-pair", "individual"]) {
    const r = runPositionScreenPhase(phase, positions, ROOM, CAB, SEATS, rsp, 0.05, groups);
    phases[phase] = {
      practicalGenerated: r?.funnel?.generated ?? null,
      promoted: r?.funnel?.promotedToV2 ?? null,
      theoretical: r?.funnel?.theoreticalExcluded ?? null,
      geometryRejected: r?.funnel?.geometryRejected ?? null,
      firstMovement: r?.promoted?.[0]?.movement || null,
      firstCoordinates: r?.promoted?.[0]?.coordinates?.map((p) => `${p.sourceId}:${p.x.toFixed(2)},${p.y.toFixed(3)}`) || null,
      sourceIdsRetained: r?.promoted?.[0]?.finalist?.sources?.map((s) => s.sourceId) || null,
    };
  }
  const grouping = detectSubwooferGroups(instances, ROOM);
  const estimate = estimateOptimiserCalculations({ instances, roomDims: ROOM });
  const workload = buildOptimiserRunWorkload({ instances, roomDims: ROOM });
  const pairVerdict = active.length === 3
    ? classifySymmetricPair(active[1], active[2], { widthM: ROOM.widthM })
    : null;
  return {
    label,
    activeCount: active.length,
    groupStatus: grouping.status,
    groups: grouping.groups.map((g) => `${g.label}[${g.sourceIds.join("+")}]`),
    description: describeSubwooferGrouping(instances, ROOM).rows.map((r) => `${r.label}: ${r.sourceText}`),
    topology: active.length === 3 ? resolveTriadTopology(positions, ROOM, groups)?.topology || null : null,
    pairVerdict: pairVerdict ? { paired: pairVerdict.paired, identical: pairVerdict.identical, lateralMm: Math.round(pairVerdict.lateralOffsetM * 1000), depthMm: Math.round(pairVerdict.depthDeltaM * 1000) } : null,
    phases,
    declaredPlacementBudget: estimate.families.find((f) => f.key === "placement")?.count ?? null,
    workloadPlacementRow: workload.rows.find((r) => r.key === "placement")?.steps ?? null,
    workloadTotal: workload.totalSteps,
  };
};

it("measures three-source placement after the fix", () => {
  const threeSubLayoutPool = {
    three_sub_result: {
      evaluatedFinalists: [{
        finalistId: "three-1",
        // front singleton + rear pair (the family a 3-source layout can hold)
        coordinates: [{ x: 2.11, y: 0 }, { x: 1.055, y: 5 }, { x: 3.165, y: 5 }],
      }],
    },
  };
  let layoutCandidates = null;
  let layoutError = null;
  try {
    layoutCandidates = gatherCandidates({
      subwooferInstances: BARTON, roomDims: ROOM, stage2Result: threeSubLayoutPool, placementFingerprint: null,
    }).length;
  } catch (error) {
    layoutError = String(error?.message || error);
  }

  // eslint-disable-next-line no-console
  console.log("RESULT=" + JSON.stringify({
    barton: measureLayout("barton", BARTON),
    twoFrontOneRear: measureLayout("twoFrontOneRear", TWO_FRONT),
    asymmetric: measureLayout("asymmetric", ASYMMETRIC),
    layoutCandidatesForThreeSubPool: layoutCandidates,
    layoutError,
    identicalBandStillTight: {
      bartonRearPairOnIdenticalBand: isIdenticalSymmetricPair(BARTON[2], BARTON[3], { widthM: ROOM.widthM }),
      bartonRearPairOnPracticalBand: isPracticalSymmetricPair(BARTON[2], BARTON[3], { widthM: ROOM.widthM }),
    },
  }));
});