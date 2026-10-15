// three-subwoofer-optimiser-support.test.mjs
// ---------------------------------------------------------------------------
// ADI Bass Optimiser: THREE active subwoofers are a supported layout.
//
// PRODUCT RULE
//   The optimiser supports one, two, three or four active subwoofers. Search
//   capability is never decided from the subwoofer COUNT: the optimisation
//   GROUPS are read from the physical layout — which wall each source sits on,
//   and whether two same-model sources are mirrored about the room centre line —
//   and the grouped phase / delay / gain search acts on those groups.
//
//   The groups decide the ADJUSTMENT variables only (which sources move
//   together). Every physical source keeps its own per-seat transfer and all of
//   them contribute to every seat and frequency, so a three-subwoofer search
//   always evaluates the real combined response of all three physical sources.
//
//   SYMMETRIC PAIR RULE: a clear same-model mirrored pair stays ONE group
//   initially — symmetry preserved, search bounded, normal calibration practice.
//
// NOT IN SCOPE, asserted UNCHANGED: P19, P20, RP22 grading, room-response
// physics, and the one, two and four subwoofer behaviours.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

import {
  SUBWOOFER_GROUP_STATUS,
  adaptGroupingReason,
  describeSubwooferGrouping,
  detectSubwooferGroups,
  searchedGroupDirections,
} from "../components/room/bass/improveBassV2/subwooferGroupAuthority.js";
import {
  defineDelayGroups,
  runGroupedDelaySearch,
} from "../components/room/bass/improveBassV2/groupedDelaySearch.js";
import {
  definePhaseGroups,
  runGroupedPhaseSearch,
} from "../components/room/bass/improveBassV2/groupedPhaseSearch.js";
import {
  defineGainGroups,
  runGroupedGainSearch,
} from "../components/room/bass/improveBassV2/groupedGainSearch.js";
import {
  ESTIMATE_UNAVAILABLE_REASON,
  estimateOptimiserCalculations,
  resolveSearchGroupCount,
} from "../components/room/bass/optimiserPlan/optimiserCalculationEstimate.js";
import {
  OPTIMISER_OUTCOME,
  OPTIMISER_OUTCOME_LABEL,
  OPTIMISER_PRESENTATION_COPY,
  resolveOptimiserPresentationState,
} from "../components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js";
import { OPTIMISER_PLAN_STATUS } from "../components/room/bass/optimiserPlan/optimiserPlanConstants.js";

const readSource = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

const DELAY_SOURCE = readSource("../components/room/bass/improveBassV2/groupedDelaySearch.js");
const PHASE_SOURCE = readSource("../components/room/bass/improveBassV2/groupedPhaseSearch.js");
const GAIN_SOURCE = readSource("../components/room/bass/improveBassV2/groupedGainSearch.js");
const AUTHORITY_SOURCE = readSource("../components/room/bass/improveBassV2/subwooferGroupAuthority.js");
const PRESENTATION_SOURCE = readSource("../components/room/bass/optimiserPlan/resolveOptimiserPresentationState.js");
// The card is read as ONE unit: the journey composes the disclosure's evidence
// groups (including the subwoofer grouping block) from
// AdiJourneyEngineerDetailsSections in place.
const JOURNEY_SOURCE = readSource("../components/room/bass/optimiserPlan/AdiOptimisationJourney.jsx")
  + readSource("../components/room/bass/optimiserPlan/AdiJourneyEngineerDetailsSections.jsx");

const ROOM = { widthM: 6, lengthM: 7, heightM: 2.7 };

const sub = (id, x, y, model = "sub2-12") => ({ id, model, enabled: true, position: { x, y } });

// CASE A — one front subwoofer on the centre line + two mirrored rear subwoofers.
const CASE_A = [
  sub("sub-front", 3, 0.2),
  sub("sub-rear-left", 1.5, 6.8),
  sub("sub-rear-right", 4.5, 6.8),
];
// CASE B — two mirrored front subwoofers + one rear subwoofer on the centre line.
const CASE_B = [
  sub("sub-front-left", 1.5, 0.2),
  sub("sub-front-right", 4.5, 0.2),
  sub("sub-rear", 3, 6.8),
];
// CASE C — three genuinely asymmetric subwoofers (the rear pair is not mirrored).
const CASE_C = [
  sub("sub-a", 3, 0.2),
  sub("sub-b", 1.5, 6.8),
  sub("sub-c", 4.6, 6.8),
];
// The unchanged two- and four-subwoofer layouts.
const CASE_2 = [sub("sub-front-left", 1.5, 0.2), sub("sub-front-right", 4.5, 0.2)];
const CASE_2_ASYMMETRIC = [sub("sub-front", 3, 0.2), sub("sub-rear", 3, 6.8)];
const CASE_4 = [
  sub("sub-front-left", 1.5, 0.2),
  sub("sub-front-right", 4.5, 0.2),
  sub("sub-rear-left", 1.5, 6.8),
  sub("sub-rear-right", 4.5, 6.8),
];

const baselineFor = (instances) => instances.map((source) => ({
  sourceId: source.id,
  delayMs: 0,
  gainDb: 0,
  polarity: 1,
}));

// Every frequency inside the searches' own 20–120 Hz scoring band, so the
// test's independent acoustic sum is directly comparable with the proxy.
const FREQS_HZ = [20, 25, 32, 40, 50, 63, 80, 100];
const SEATS = ["rsp", "seat-a", "seat-b"];

const groupIds = (grouping) => grouping.groups.map((entry) => entry.sourceIds);
const groupLabels = (grouping) => grouping.groups.map((entry) => entry.label);
const directionsOf = (search) => new Set(search.candidates.map((candidate) => candidate.direction));

/**
 * Current's untuned per-source per-seat complex transfers, in the instances'
 * own order — the same raw transfer the real searches consume.
 */
function buildTransfer(instances, intrinsicDelayMs = () => 0) {
  const perSourcePerSeatComplexTransfers = [];
  SEATS.forEach((seatId, seatIndex) => {
    instances.forEach((source, sourceIndex) => {
      const delayMs = intrinsicDelayMs(source, sourceIndex);
      const magnitude = 1 + sourceIndex * 0.1 + seatIndex * 0.05;
      const points = FREQS_HZ.map((frequency) => {
        const phase = -2 * Math.PI * frequency * (delayMs / 1000);
        return { frequency, re: magnitude * Math.cos(phase), im: magnitude * Math.sin(phase) };
      });
      perSourcePerSeatComplexTransfers.push({ seatId, sourceId: source.id, points });
    });
  });
  return {
    perSourcePerSeatComplexTransfers,
    sources: instances.map((source) => ({ x: source.position.x, y: source.position.y })),
    seatIds: SEATS,
    seatPriorityMap: [["seat-a", "primary"], ["seat-b", "secondary"]],
  };
}

/** Test-side complex sum of EVERY physical source at one seat — the independent check. */
function allSourceSum(transfer, seatId) {
  const rows = transfer.perSourcePerSeatComplexTransfers.filter((row) => row.seatId === seatId);
  return FREQS_HZ.map((_, index) => rows.reduce(
    (sum, row) => ({
      re: sum.re + row.points[index].re,
      im: sum.im + row.points[index].im,
    }),
    { re: 0, im: 0 },
  ));
}

const splOf = (complexValues) => complexValues.map((value) =>
  20 * Math.log10(Math.max(Math.hypot(value.re, value.im), 1e-10)));
const peakToPeak = (values) => Math.max(...values) - Math.min(...values);
const round3 = (value) => Math.round(value * 1000) / 1000;

const searchOf = (run, instances, transfer) => run({
  rawTransfer: transfer,
  instances,
  roomDims: ROOM,
  effectiveBaseline: baselineFor(instances),
});

// ── GROUPING AUTHORITY ─────────────────────────────────────────────────────

test("Grouping is read from the physical layout, never from array order or the count", () => {
  const reordered = [CASE_A[2], CASE_A[0], CASE_A[1]];
  expect(groupIds(detectSubwooferGroups(CASE_A, ROOM)))
    .toEqual([["sub-front"], ["sub-rear-left", "sub-rear-right"]]);
  expect(groupIds(detectSubwooferGroups(reordered, ROOM)))
    .toEqual(groupIds(detectSubwooferGroups(CASE_A, ROOM)));
});

test("Delay, phase and gain group the same layout the same way", () => {
  for (const layout of [CASE_A, CASE_B, CASE_C, CASE_2, CASE_2_ASYMMETRIC, CASE_4]) {
    expect(groupIds(definePhaseGroups(layout, ROOM))).toEqual(groupIds(defineDelayGroups(layout, ROOM)));
    expect(groupIds(defineGainGroups(layout, ROOM))).toEqual(groupIds(defineDelayGroups(layout, ROOM)));
  }
});

test("Each search states the grouping reason in its own words", () => {
  expect(adaptGroupingReason("no inter-sub delay search", "phase")).toBe("no inter-sub phase search");
  const fiveSources = [...CASE_4, sub("sub-extra", 3, 3.5)];
  expect(defineDelayGroups(fiveSources, ROOM).reason).toMatch(/one, two, three or four active sources/);
  expect(definePhaseGroups(fiveSources, ROOM).reason).toMatch(/Grouped phase search/);
  expect(defineGainGroups(fiveSources, ROOM).reason).toMatch(/Grouped gain search/);
});

// ── ITEM 7 — the former three-sub blockers are gone ───────────────────────

test("ITEM 7: the former three-sub count blocker does not exist in any grouping or search wording", () => {
  for (const source of [AUTHORITY_SOURCE, DELAY_SOURCE, PHASE_SOURCE, GAIN_SOURCE]) {
    expect(source).not.toMatch(/one, two or four active sources/);
  }
  expect(AUTHORITY_SOURCE).toMatch(/one, two, three or four active sources/);
  // And never the panel's old blanket incompleteness wording.
  expect(PRESENTATION_SOURCE).not.toMatch(/evaluation could not complete/i);
  expect(Object.values(OPTIMISER_PRESENTATION_COPY).join(" ")).not.toMatch(/evaluation could not complete/i);
});

test("ITEM 7: no valid three-subwoofer layout is reported ambiguous or unsearchable", () => {
  for (const layout of [CASE_A, CASE_B, CASE_C]) {
    const grouping = detectSubwooferGroups(layout, ROOM);
    // Only an ambiguous grouping can raise an evaluation issue.
    expect(grouping.status).toBe(SUBWOOFER_GROUP_STATUS.ELIGIBLE);
    expect(grouping.reason).toBeUndefined();
    expect(grouping.groups.length).toBeGreaterThanOrEqual(2);
  }
});

// ── TEST A — 1 front + 2 rear symmetric ───────────────────────────────────

test("TEST A: one front plus two rear subwoofers — 3 sources, 2 groups, pair linked, all three searches run", () => {
  const grouping = defineDelayGroups(CASE_A, ROOM);
  expect(grouping.status).toBe(SUBWOOFER_GROUP_STATUS.ELIGIBLE);
  expect(grouping.reason).toBeUndefined();
  expect(grouping.groups.length).toBe(2);
  expect(groupLabels(grouping)).toEqual(["Front singleton", "Rear pair"]);
  // The mirrored same-model rear pair stays ONE group.
  expect(grouping.groups[1].sourceIds).toEqual(["sub-rear-left", "sub-rear-right"]);
  expect(grouping.groups.every((entry) => entry.role !== null)).toBe(true);

  const transfer = buildTransfer(CASE_A);

  const delay = searchOf(runGroupedDelaySearch, CASE_A, transfer);
  expect(delay.status).toBe(SUBWOOFER_GROUP_STATUS.ELIGIBLE);
  expect(delay.candidates.length).toBeGreaterThan(0);
  expect(delay.coarseCount).toBe(61); // 1 frozen current + 30 steps per group

  const phase = searchOf(runGroupedPhaseSearch, CASE_A, transfer);
  expect(phase.status).toBe(SUBWOOFER_GROUP_STATUS.ELIGIBLE);
  expect(phase.candidates.length).toBeGreaterThan(0);
  expect(phase.optionCount).toBeGreaterThan(36);

  const gain = searchOf(runGroupedGainSearch, CASE_A, transfer);
  expect(gain.status).toBe(SUBWOOFER_GROUP_STATUS.ELIGIBLE);
  expect(gain.candidates.length).toBeGreaterThan(0);
  expect(gain.coarseCount).toBe(25); // 1 frozen current + 12 steps per group

  // "The optimiser completes": every lever produced a scored, non-empty result.
  for (const search of [delay, phase, gain]) {
    expect(search.current.isCurrent).toBe(true);
    expect(Number.isFinite(search.current.proxy.primaryRangeDb)).toBe(true);
  }
});

// ── TEST B — 2 front symmetric + 1 rear ───────────────────────────────────

test("TEST B: two front plus one rear subwoofer — 2 groups, front pair linked, run completes", () => {
  const grouping = defineDelayGroups(CASE_B, ROOM);
  expect(grouping.status).toBe(SUBWOOFER_GROUP_STATUS.ELIGIBLE);
  expect(grouping.groups.length).toBe(2);
  expect(groupLabels(grouping)).toEqual(["Front pair", "Rear singleton"]);
  expect(grouping.groups[0].sourceIds).toEqual(["sub-front-left", "sub-front-right"]);
  expect(grouping.groups.every((entry) => entry.role !== null)).toBe(true);

  const transfer = buildTransfer(CASE_B);
  const delay = searchOf(runGroupedDelaySearch, CASE_B, transfer);
  const phase = searchOf(runGroupedPhaseSearch, CASE_B, transfer);
  const gain = searchOf(runGroupedGainSearch, CASE_B, transfer);
  for (const search of [delay, phase, gain]) {
    expect(search.status).toBe(SUBWOOFER_GROUP_STATUS.ELIGIBLE);
    expect(search.candidates.length).toBeGreaterThan(0);
    expect(directionsOf(search)).toEqual(new Set(["A", "B"]));
  }
  expect(delay.coarseCount).toBe(61);
  expect(gain.coarseCount).toBe(25);
});

// ── TEST C — 3 asymmetric, bounded search, THIRD GROUP REFINED ────────────

test("TEST C: three asymmetric subwoofers — 3 independent groups, bounded coarse→fine search", () => {
  const grouping = defineDelayGroups(CASE_C, ROOM);
  expect(grouping.status).toBe(SUBWOOFER_GROUP_STATUS.ELIGIBLE);
  expect(grouping.groups.length).toBe(3);
  expect(groupLabels(grouping)).toEqual(["Front singleton", "Rear left", "Rear right"]);
  expect(grouping.groups.map((entry) => entry.id)).toEqual(["A", "B", "C"]);
  expect(grouping.groups.every((entry) => entry.sourceIds.length === 1)).toBe(true);

  const transfer = buildTransfer(CASE_C);
  const delay = searchOf(runGroupedDelaySearch, CASE_C, transfer);
  // Bounded: one frozen current + 30 coarse steps per group, then a bounded
  // half-step refinement — never the 30×30×30 combinational space.
  expect(delay.coarseCount).toBe(91);
  expect(delay.fineCount).toBeLessThanOrEqual(6);
  expect(delay.candidates.length).toBeLessThanOrEqual(97);
  expect(delay.candidates.length).toBeGreaterThan(0);
  expect(directionsOf(delay)).toEqual(new Set(["A", "B", "C"]));

  const phase = searchOf(runGroupedPhaseSearch, CASE_C, transfer);
  expect(phase.candidates.length).toBeGreaterThan(0);
  expect(directionsOf(phase)).toEqual(new Set(["A", "B", "C"]));

  const gain = searchOf(runGroupedGainSearch, CASE_C, transfer);
  expect(gain.coarseCount).toBe(37); // 1 frozen current + 12 steps per group
  expect(gain.candidates.length).toBeGreaterThan(0);
  expect(directionsOf(gain)).toEqual(new Set(["A", "B", "C"]));
});

test("THIRD GROUP IS REFINED, not created and ignored", () => {
  const transfer = buildTransfer(CASE_C);
  for (const run of [runGroupedDelaySearch, runGroupedPhaseSearch, runGroupedGainSearch]) {
    const search = searchOf(run, CASE_C, transfer);
    const refined = new Set(search.candidates
      .filter((candidate) => candidate.neighbours || candidate.direction === "C")
      .map((candidate) => candidate.direction));
    // Group C is present in the refined output of all three searches.
    expect(refined.has("C")).toBe(true);
    const cCandidates = search.candidates.filter((candidate) => candidate.direction === "C");
    expect(cCandidates.length).toBeGreaterThan(0);
    // Each refined candidate is scored — never an unrefined placeholder.
    expect(cCandidates.every((candidate) => candidate.proxy && Number.isFinite(candidate.proxy.primaryRangeDb)))
      .toBe(true);
  }
  // The delay ledger accounts for every generated row, including group C.
  const delay = searchOf(runGroupedDelaySearch, CASE_C, transfer);
  expect(delay.ledger.length).toBe(delay.coarseCount + delay.fineCount);
  expect(delay.ledger.filter((row) => row.direction === "C").length).toBeGreaterThan(30);
});

test("Refinement directions are read from the candidates, so a third group is never dropped", () => {
  const rows = [
    { id: "current", isCurrent: true },
    { id: "a", direction: "A" },
    { id: "b", direction: "B" },
    { id: "c", direction: "C" },
    { id: "rejected", direction: "C", rejection: "invalid" },
  ];
  expect(searchedGroupDirections(rows)).toEqual(["A", "B", "C"]);
});

// ── TEST D — no useful improvement is NOT a failed evaluation ─────────────

test("TEST D: a three-subwoofer design with nothing worth applying reports NO IMPROVEMENT FOUND", () => {
  for (const layout of [CASE_A, CASE_B, CASE_C]) {
    const grouping = detectSubwooferGroups(layout, ROOM);
    expect(grouping.status).toBe(SUBWOOFER_GROUP_STATUS.ELIGIBLE);
    const estimate = estimateOptimiserCalculations({ instances: layout, roomDims: ROOM });
    expect(estimate.available).toBe(true);
    expect(estimate.reason).toBeNull();
    expect(estimate.groups).toBeGreaterThanOrEqual(2);
  }

  const state = resolveOptimiserPresentationState({
    planView: { status: OPTIMISER_PLAN_STATUS.NO_USEFUL_IMPROVEMENT, levers: [] },
    runStatus: "complete",
  });
  expect(state.outcome).toBe(OPTIMISER_OUTCOME.NO_IMPROVEMENTS);
  expect(state.outcomeLabel).toBe(OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.NO_IMPROVEMENTS]);
  expect(state.message).toMatch(/did not find a worthwhile improvement/);
  expect(state.message).not.toMatch(/could not complete/i);
});

// ── TEST E — a calibration improvement is surfaced normally ───────────────

test("TEST E: the grouped delay search surfaces the adjustment that improves the real three-source response", () => {
  // The rear pair is 6 ms late relative to the front source, so the three-source
  // sum has a deep null at 80 Hz at the baseline. Aligning the front group
  // removes it, and that adjustment must be surfaced as a normal candidate.
  const transfer = buildTransfer(CASE_A, (source) => (source.id === "sub-front" ? 0 : 6));
  const search = searchOf(runGroupedDelaySearch, CASE_A, transfer);
  const frontGroup = search.grouping.groups[0];
  const improved = search.candidates.filter((candidate) => candidate.direction === frontGroup.id);

  expect(improved.length).toBeGreaterThan(0);
  const best = Math.min(...improved.map((candidate) => candidate.proxy.primaryRangeDb));
  expect(best).toBeLessThan(search.current.proxy.primaryRangeDb - 6);

  const winner = improved.find((candidate) => candidate.proxy.primaryRangeDb === best);
  // The surfaced candidate adjusts the front group only — the other sources keep
  // their own values, and their responses stay in the calculation.
  const untouched = winner.tuning.filter((row) => !frontGroup.sourceIds.includes(row.sourceId));
  expect(untouched.length).toBe(2);
  expect(untouched.every((row) => row.delayMs === 0)).toBe(true);
  expect(winner.tuning.length).toBe(3);
});

// ── TEST F — a physical change is surfaced, never auto-applied ────────────

test("TEST F: a physical move is surfaced as a physical change and is not applied on its own", () => {
  const state = resolveOptimiserPresentationState({
    planView: {
      status: OPTIMISER_PLAN_STATUS.CURRENT,
      levers: [{
        key: "placement",
        label: "Subwoofer positions",
        canApply: true,
        evaluated: true,
        effect: { summary: "Seat-to-seat bass consistency improves" },
        changes: [{ sourceId: "sub-front", from: "0.30 m", to: "0.45 m" }],
      }],
    },
    runStatus: "complete",
  });
  expect(state.outcome).toBe(OPTIMISER_OUTCOME.PHYSICAL_CHANGE);
  expect(state.outcomeLabel).toBe(OPTIMISER_OUTCOME_LABEL[OPTIMISER_OUTCOME.PHYSICAL_CHANGE]);
  expect(state.message).toMatch(/requires a physical change/);
  expect(state.nextAction).toMatch(/not applied/);
});

test("A three-subwoofer calibration lever still resolves to a normal, applicable improvement", () => {
  const state = resolveOptimiserPresentationState({
    planView: {
      status: OPTIMISER_PLAN_STATUS.CURRENT,
      levers: [{
        key: "delay",
        label: "Grouped delay",
        canApply: true,
        evaluated: true,
        effect: { summary: "Bass consistency improves" },
        changes: [{ groupId: "A", from: "0 ms", to: "6 ms" }],
      }],
    },
    runStatus: "complete",
  });
  expect(state.outcome).toBe(OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND);
  expect(state.showApply).toBe(true);
});

// ── ALL THREE PHYSICAL RESPONSES USED ────────────────────────────────────

test("All three physical subwoofer responses contribute to every seat response", () => {
  const transfer = buildTransfer(CASE_C);
  const search = searchOf(runGroupedDelaySearch, CASE_C, transfer);
  expect(search.current.tuning.length).toBe(3);
  // The search's own current response IS the complex sum of all three sources.
  for (const seatId of ["seat-a", "seat-b"]) {
    expect(round3(search.current.proxy.ranges[seatId]))
      .toBe(round3(peakToPeak(splOf(allSourceSum(transfer, seatId)))));
  }
  // Grouping never removes a source: every candidate still tunes all three.
  for (const candidate of search.candidates) {
    expect(candidate.tuning.length).toBe(3);
    expect(new Set(candidate.tuning.map((row) => row.sourceId)).size).toBe(3);
  }
});

// ── ITEM 5 — calculation estimate UI ─────────────────────────────────────

test("ITEM 5: a three-subwoofer design is searchable and the estimate reflects its detected groups", () => {
  const caseA = estimateOptimiserCalculations({ instances: CASE_A, roomDims: ROOM });
  const caseB = estimateOptimiserCalculations({ instances: CASE_B, roomDims: ROOM });
  const caseC = estimateOptimiserCalculations({ instances: CASE_C, roomDims: ROOM });

  expect(caseA.available).toBe(true);
  expect(caseB.available).toBe(true);
  expect(caseC.available).toBe(true);
  for (const estimate of [caseA, caseB, caseC]) {
    expect(estimate.reason).toBeNull();
    expect(estimate.sourceCount).toBe(3);
    expect(estimate.total).toBeGreaterThan(0);
  }
  // The detected grouping is the authority, not a quantity table.
  expect(caseA.groups).toBe(2);
  expect(caseB.groups).toBe(2);
  expect(caseC.groups).toBe(3);
  // Three independent groups test more electronic options than two.
  expect(caseC.total).toBeGreaterThan(caseA.total);
  // The unsupported-layout warning is never produced for a three-sub layout.
  expect(ESTIMATE_UNAVAILABLE_REASON).toMatch(/not fixed in a form the optimiser can search/);
  expect([caseA, caseB, caseC].some((estimate) => estimate.reason === ESTIMATE_UNAVAILABLE_REASON)).toBe(false);
});

test("ITEM 5: the quantity fallback never denies three sources a search space", () => {
  expect(resolveSearchGroupCount(1, null)).toBe(0);
  expect(resolveSearchGroupCount(2, null)).toBe(2);
  expect(resolveSearchGroupCount(3, null)).toBe(3);
  expect(resolveSearchGroupCount(4, null)).toBe(2);
  // A detected grouping always wins over the fallback.
  expect(resolveSearchGroupCount(3, 2)).toBe(2);
  expect(resolveSearchGroupCount(3, 3)).toBe(3);
});

// ── ITEM 6 — engineer details ────────────────────────────────────────────

test("ITEM 6: Engineer details states 3 active subwoofers / 2 groups and names the sources", () => {
  const described = describeSubwooferGrouping(CASE_A, ROOM);
  expect(described.status).toBe(SUBWOOFER_GROUP_STATUS.ELIGIBLE);
  expect(described.activeCount).toBe(3);
  expect(described.groupCount).toBe(2);
  expect(described.rows.map((row) => row.label)).toEqual(["Front singleton", "Rear pair"]);
  expect(described.rows.map((row) => row.sourceText)).toEqual(["SUB1", "SUB2 · SUB3"]);
  // The designer reads SUB labels — never an internal array position.
  expect(described.rows.every((row) => /^SUB\d( · SUB\d)*$/.test(row.sourceText))).toBe(true);
});

test("ITEM 6: an asymmetric three-subwoofer layout states 3 optimisation groups", () => {
  const described = describeSubwooferGrouping(CASE_C, ROOM);
  expect(described.activeCount).toBe(3);
  expect(described.groupCount).toBe(3);
  expect(described.rows.map((row) => row.label)).toEqual(["Front singleton", "Rear left", "Rear right"]);
  expect(described.rows.every((row) => row.sourceText.startsWith("SUB"))).toBe(true);
});

test("ITEM 6: the grouping block is wired into Engineer details with the design's own instances", () => {
  expect(JOURNEY_SOURCE).toMatch(/<AdiSubwooferGroupingBlock instances=\{instances\} roomDims=\{roomDims\} \/>/);
});

// ── REGRESSION — 1 / 2 / 4 ───────────────────────────────────────────────

test("1-SUB REGRESSION: unchanged — no grouped search, one frozen current, no candidates", () => {
  const layout = [CASE_A[0]];
  const grouping = defineDelayGroups(layout, ROOM);
  expect(grouping.status).toBe(SUBWOOFER_GROUP_STATUS.SKIPPED);
  expect(grouping.groups).toEqual([]);
  expect(definePhaseGroups(layout, ROOM).status).toBe(SUBWOOFER_GROUP_STATUS.SKIPPED);
  expect(defineGainGroups(layout, ROOM).status).toBe(SUBWOOFER_GROUP_STATUS.SKIPPED);
  expect(resolveSearchGroupCount(1, null)).toBe(0);

  const transfer = buildTransfer(layout);
  for (const run of [runGroupedDelaySearch, runGroupedPhaseSearch, runGroupedGainSearch]) {
    const search = searchOf(run, layout, transfer);
    expect(search.status).toBe(SUBWOOFER_GROUP_STATUS.SKIPPED);
    expect(search.candidates).toEqual([]);
    expect(search.current.isCurrent).toBe(true);
  }
  const estimate = estimateOptimiserCalculations({ instances: layout, roomDims: ROOM });
  expect(estimate.groups).toBe(0);
});

test("2-SUB REGRESSION: symmetric pair still skipped, asymmetric pair still searchable", () => {
  const paired = defineDelayGroups(CASE_2, ROOM);
  expect(paired.status).toBe(SUBWOOFER_GROUP_STATUS.SKIPPED);
  expect(paired.groups).toEqual([]);
  expect(defineGainGroups(CASE_2, ROOM).status).toBe(SUBWOOFER_GROUP_STATUS.SKIPPED);
  expect(resolveSearchGroupCount(2, null)).toBe(2);

  const asymmetric = defineDelayGroups(CASE_2_ASYMMETRIC, ROOM);
  expect(asymmetric.status).toBe(SUBWOOFER_GROUP_STATUS.ELIGIBLE);
  expect(asymmetric.groups.map((entry) => entry.id)).toEqual(["A", "B"]);
  expect(groupLabels(asymmetric)).toEqual(["First source", "Second source"]);

  const transfer = buildTransfer(CASE_2_ASYMMETRIC);
  const delay = searchOf(runGroupedDelaySearch, CASE_2_ASYMMETRIC, transfer);
  expect(delay.coarseCount).toBe(61);
  expect(delay.candidates.length).toBeGreaterThan(0);
  expect(directionsOf(delay)).toEqual(new Set(["A", "B"]));
  const phase = searchOf(runGroupedPhaseSearch, CASE_2_ASYMMETRIC, transfer);
  const gain = searchOf(runGroupedGainSearch, CASE_2_ASYMMETRIC, transfer);
  expect(phase.optionCount).toBeGreaterThan(36);
  expect(gain.coarseCount).toBe(25);
});

test("4-SUB REGRESSION: the front pair + rear pair grouping and its bounds are unchanged", () => {
  const grouping = defineDelayGroups(CASE_4, ROOM);
  expect(grouping.status).toBe(SUBWOOFER_GROUP_STATUS.ELIGIBLE);
  expect(groupLabels(grouping)).toEqual(["Front pair", "Rear pair"]);
  expect(groupIds(grouping)).toEqual([
    ["sub-front-left", "sub-front-right"],
    ["sub-rear-left", "sub-rear-right"],
  ]);
  expect(grouping.groups.every((entry) => entry.role !== null)).toBe(true);
  expect(resolveSearchGroupCount(4, null)).toBe(2);

  const transfer = buildTransfer(CASE_4);
  const delay = searchOf(runGroupedDelaySearch, CASE_4, transfer);
  expect(delay.coarseCount).toBe(61);
  expect(delay.candidates.length).toBeGreaterThan(0);
  expect(directionsOf(delay)).toEqual(new Set(["A", "B"]));
  const phase = searchOf(runGroupedPhaseSearch, CASE_4, transfer);
  const gain = searchOf(runGroupedGainSearch, CASE_4, transfer);
  expect(phase.candidates.length).toBeGreaterThan(0);
  expect(gain.coarseCount).toBe(25);

  const estimate = estimateOptimiserCalculations({ instances: CASE_4, roomDims: ROOM });
  expect(estimate.available).toBe(true);
  expect(estimate.groups).toBe(2);
});

test("REGRESSION: a four-subwoofer calibration lever still resolves to an applicable improvement", () => {
  const state = resolveOptimiserPresentationState({
    planView: {
      status: OPTIMISER_PLAN_STATUS.CURRENT,
      levers: [{
        key: "delay",
        label: "Grouped delay",
        canApply: true,
        evaluated: true,
        effect: { summary: "Bass consistency improves" },
        changes: [{ groupId: "A", from: "0 ms", to: "4 ms" }],
      }],
    },
    runStatus: "complete",
  });
  expect(state.outcome).toBe(OPTIMISER_OUTCOME.IMPROVEMENTS_FOUND);
  expect(state.showApply).toBe(true);
});

// ── NO P19 / P20 CHANGE ──────────────────────────────────────────────────

test("NO P19/P20 CHANGE: the grouped searches carry raw response proxies only", () => {
  const hasGradingImport = (source) =>
    /import[^;]*(p19|p20|bassGrading|rp22BassMetrics|bassCompliancePresentation)/i.test(source);
  for (const source of [DELAY_SOURCE, PHASE_SOURCE, GAIN_SOURCE]) {
    expect(hasGradingImport(source)).toBe(false);
  }

  const search = searchOf(runGroupedDelaySearch, CASE_C, buildTransfer(CASE_C));
  expect(Object.keys(search.current.proxy).sort())
    .toEqual(["allSeatRangeDb", "primaryRangeDb", "ranges", "rspRangeDb"]);
  // No grade, level or score field is produced by the grouped search.
  expect(JSON.stringify(search.current.proxy)).not.toMatch(/grade|level|score/i);
});

test("NO P19/P20 CHANGE: grouping never alters the seats or frequencies evaluated", () => {
  for (const layout of [CASE_A, CASE_C, CASE_4]) {
    const search = searchOf(runGroupedDelaySearch, layout, buildTransfer(layout));
    expect(Object.keys(search.current.proxy.ranges).sort()).toEqual([...SEATS].sort());
    for (const candidate of search.candidates) {
      expect(Object.keys(candidate.proxy.ranges).sort()).toEqual([...SEATS].sort());
    }
  }
});