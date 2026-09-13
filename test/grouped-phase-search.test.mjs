import test from "node:test";
import assert from "node:assert/strict";

import {
  PHASE_CONTROL_REFERENCE_HZ,
  allPassMagnitude,
  allPassPhaseRadians,
} from "../src/bass/core/subwooferPhaseControl.js";
import {
  createGroupedPhaseCandidate,
  definePhaseGroups,
  generateGroupedPhaseCandidates,
} from "../src/components/room/bass/improveBassV2/groupedPhaseSearch.js";
import { resumWithTuning } from "../src/components/room/bass/stage2/stage2TuningSearch.js";
import {
  applyCalibrationTuning,
  isCalibrationApplied,
} from "../src/components/room/bass/improveBassV2/improveBassV2ApplyCalibration.js";
import { buildStageDisplay } from "../src/components/room/bass/improveBassV2/improveBassV2StageMapping.js";

const room = { widthM: 6, lengthM: 7, heightM: 2.7 };
const instances = [
  { id: "f-left", group: "front", position: { x: 1.5, y: 0.2 } },
  { id: "f-right", group: "front", position: { x: 4.5, y: 0.2 } },
  { id: "b-left", group: "rear", position: { x: 1.5, y: 6.8 } },
  { id: "b-right", group: "rear", position: { x: 4.5, y: 6.8 } },
];
const baseline = instances.map((source, index) => ({
  sourceId: source.id,
  delayMs: index,
  gainDb: index % 2 ? -1 : 0,
  polarity: index % 2 ? -1 : 1,
  phaseControlDeg: 0,
}));

test("first-order all-pass is unity magnitude and reaches its requested lag at 80 Hz", () => {
  for (const phaseDeg of [5, 45, 90, 135, 175]) {
    assert.ok(Math.abs(allPassMagnitude(20, phaseDeg) - 1) < 1e-12);
    assert.ok(Math.abs(allPassMagnitude(80, phaseDeg) - 1) < 1e-12);
    assert.ok(Math.abs(allPassMagnitude(200, phaseDeg) - 1) < 1e-12);
    const actualDeg = allPassPhaseRadians(PHASE_CONTROL_REFERENCE_HZ, phaseDeg) * 180 / Math.PI;
    assert.ok(Math.abs(actualDeg + phaseDeg) < 1e-9);
  }
});

test("all-pass phase is frequency-dependent rather than a non-causal constant rotation", () => {
  const low = allPassPhaseRadians(20, 90);
  const reference = allPassPhaseRadians(80, 90);
  const high = allPassPhaseRadians(160, 90);
  assert.ok(Math.abs(low) < Math.abs(reference));
  assert.ok(Math.abs(high) > Math.abs(reference));
});

test("four-source grouped search covers Current plus 5..175 degrees in both directions", () => {
  const grouping = definePhaseGroups(instances, room);
  const candidates = generateGroupedPhaseCandidates(grouping, baseline);
  assert.equal(candidates.length, 71);
  assert.equal(new Set(candidates.map((candidate) => candidate.id)).size, 71);
  for (const direction of ["A", "B"]) {
    assert.deepEqual(
      candidates.filter((candidate) => candidate.direction === direction)
        .map((candidate) => candidate.phaseAtReferenceDeg),
      Array.from({ length: 35 }, (_, index) => (index + 1) * 5),
    );
  }
});

test("grouped phase changes only its selected group and preserves delay, gain and polarity", () => {
  const grouping = definePhaseGroups(instances, room);
  const candidate = createGroupedPhaseCandidate(grouping, baseline, "B", 95);
  const selected = new Set(grouping.groups.find((group) => group.id === "B").sourceIds);
  candidate.tuning.forEach((row, index) => {
    assert.equal(row.phaseControlDeg, selected.has(row.sourceId) ? 95 : 0);
    assert.equal(row.delayMs, baseline[index].delayMs);
    assert.equal(row.gainDb, baseline[index].gainDb);
    assert.equal(row.polarity, baseline[index].polarity);
  });
});

test("group identities and candidate IDs are stable when source order changes", () => {
  const order = [instances[3], instances[0], instances[2], instances[1]];
  const reorderedBaseline = order.map((source) => baseline.find((row) => row.sourceId === source.id));
  const original = createGroupedPhaseCandidate(
    definePhaseGroups(instances, room), baseline, "A", 65,
  );
  const reordered = createGroupedPhaseCandidate(
    definePhaseGroups(order, room), reorderedBaseline, "A", 65,
  );
  assert.equal(original.id, reordered.id);
  assert.deepEqual(
    [...original.tuning].sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
    [...reordered.tuning].sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
  );
});

test("a symmetric same-wall pair is not offered a differential phase search", () => {
  const grouping = definePhaseGroups(instances.slice(0, 2), room);
  assert.equal(grouping.status, "skipped");
  assert.equal(generateGroupedPhaseCandidates(grouping, baseline.slice(0, 2)).length, 1);
});

test("complex re-sum applies the stored all-pass transfer function", () => {
  const points = [{ frequency: 80, re: 1, im: 0 }];
  const transfers = [
    { seatId: "rsp", points },
    { seatId: "rsp", points },
  ];
  const raw = resumWithTuning(transfers, [
    { delayMs: 0, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
    { delayMs: 0, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
  ], ["rsp"]).rsp;
  const shifted = resumWithTuning(transfers, [
    { delayMs: 0, gainDb: 0, polarity: 0, phaseControlDeg: 0 },
    { delayMs: 0, gainDb: 0, polarity: 0, phaseControlDeg: 90 },
  ], ["rsp"]).rsp;
  assert.ok(Math.abs(raw.splDb[0] - 20 * Math.log10(2)) < 1e-9);
  assert.ok(Math.abs(shifted.splDb[0] - 20 * Math.log10(Math.SQRT2)) < 1e-9);
  assert.ok(Math.abs(shifted._sumRe[0] - 1) < 1e-9);
  assert.ok(Math.abs(shifted._sumIm[0] + 1) < 1e-9);
});

test("Apply persists phase and the applied-state check includes it", () => {
  const current = instances.slice(0, 2).map((source) => ({
    ...source,
    enabled: true,
    delayMs: 0,
    gainDb: 0,
    polarity: 1,
    phaseControlDeg: 0,
  }));
  const tuning = current.map((source, index) => ({
    sourceId: source.id,
    delayMs: 0,
    gainDb: 0,
    polarity: 1,
    phaseControlDeg: index === 0 ? 0 : 75,
  }));
  const applied = applyCalibrationTuning(current, tuning, { candidateId: "phase-test" });
  assert.equal(applied[1].phaseControlDeg, 75);
  assert.equal(isCalibrationApplied(applied, tuning), true);
  assert.equal(isCalibrationApplied(current, tuning), false);
});

test("phase progress is active during search and terminal after a real verdict", () => {
  const active = buildStageDisplay({
    status: "running",
    phase: "calibrating",
    phaseLabel: "Testing grouped all-pass phase settings",
    progressCurrent: 12,
    progressTotal: 71,
  });
  const activePhase = active.stages.find((stage) => stage.key === "phase_polarity");
  assert.equal(active.activeStageKey, "phase_polarity");
  assert.equal(activePhase.status, "active");
  assert.match(activePhase.subStageLabel, /12 of 71/);

  const complete = buildStageDisplay({
    status: "running",
    phase: "testing_positions",
    stageVerdicts: { phase_polarity: "no_improvement" },
  });
  assert.equal(
    complete.stages.find((stage) => stage.key === "phase_polarity").status,
    "completed",
  );
});
