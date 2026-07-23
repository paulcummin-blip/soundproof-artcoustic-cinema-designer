import { computeNormalizedRoomTransfer } from "@/components/room/bass/normalizedRoomTransferEngine";
import { buildNormalizedPhysicsOptions } from "@/components/room/bass/normalizedPhysicsOptionsBuilder";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { auditPairedAuthorityCandidatePool } from "@/components/utils/pairedAuthorityComparisonAudit";
import { generateCandidatePool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { CANONICAL_BASS_PRIORITY_MODES, rankBassCandidates } from "@/components/utils/bassPriorityPolicies";

const ROOM = Object.freeze({ widthM: 6, lengthM: 8, heightM: 2.8 });
const RSP = Object.freeze({ x: 3, y: 5.5, z: 1.2 });
const PHYSICS = buildNormalizedPhysicsOptions({ surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 }, qStrategy: "ab_corrected", enableRewCoreReflections: true, roomDamping: 20, axialQ: 4 });
const sub = (id, modelKey, x, y) => ({ id, modelKey, x, y, z: 0.3, placement: y < ROOM.lengthM / 2 ? "front" : "rear", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } });

export const PAIRED_COMPARISON_FIXTURE_LAYOUTS = Object.freeze([
  { id: "one-sub2-front", tags: ["1 SUB2", "front-only"], subs: [sub("s1", "sub2-12", 1.5, 1)] },
  { id: "two-sub2-colocated", tags: ["2 SUB2", "front-only", "co-located"], subs: [sub("s1", "sub2-12", 1.5, 1), sub("s2", "sub2-12", 1.5, 1)] },
  { id: "two-sub2-front-distributed", tags: ["2 SUB2", "front-only", "distributed"], subs: [sub("s1", "sub2-12", 1, 1), sub("s2", "sub2-12", 5, 1)] },
  { id: "two-sub2-front-rear", tags: ["2 SUB2", "front/rear", "distributed"], subs: [sub("s1", "sub2-12", 1.5, 1), sub("s2", "sub2-12", 4.5, 7)] },
  { id: "four-sub2-colocated", tags: ["4 SUB2", "front-only", "co-located"], subs: ["s1", "s2", "s3", "s4"].map((id) => sub(id, "sub2-12", 1.5, 1)) },
  { id: "four-sub2-distributed", tags: ["4 SUB2", "front/rear", "distributed"], subs: [sub("s1", "sub2-12", 1, 1), sub("s2", "sub2-12", 5, 1), sub("s3", "sub2-12", 1, 7), sub("s4", "sub2-12", 5, 7)] },
  { id: "two-sub4-colocated", tags: ["2 SUB4", "front-only", "co-located"], subs: [sub("s1", "sub4-12", 1.5, 1), sub("s2", "sub4-12", 1.5, 1)] },
  { id: "two-sub4-front-rear", tags: ["2 SUB4", "front/rear", "distributed"], subs: [sub("s1", "sub4-12", 1.5, 1), sub("s2", "sub4-12", 4.5, 7)] },
  { id: "four-sub4-distributed", tags: ["4 SUB4", "front/rear", "distributed"], subs: [sub("s1", "sub4-12", 1, 1), sub("s2", "sub4-12", 5, 1), sub("s3", "sub4-12", 1, 7), sub("s4", "sub4-12", 5, 7)] },
]);

function fixtureCurves() {
  const rawCurve = Array.from({ length: 37 }, (_, index) => {
    const frequency = 20 * Math.pow(10, index * Math.log10(10) / 36);
    const residual = 5 * Math.sin(Math.log2(frequency / 20) * 2.4) - 3 * Math.cos(Math.log2(frequency / 20) * 4.1);
    return { frequency, spl: 114 + artcousticHouseCurveOffsetAt(frequency) + residual };
  });
  const perSeatRawCurves = [-0.7, 0.6].map((offset, index) => ({ seatId: `fixture-seat-${index + 1}`, responseData: rawCurve.map((point) => ({ ...point, spl: point.spl + offset + 0.3 * Math.sin(point.frequency / (9 + index)) })) }));
  return { rawCurve, perSeatRawCurves };
}

function selectionIds(candidates) {
  return Object.fromEntries(CANONICAL_BASS_PRIORITY_MODES.map((mode) => [mode, rankBassCandidates(candidates, mode).selected?.candidateId ?? null]));
}

function globalLargest(reports) {
  return reports.map((report) => ({ layoutId: report.layoutId, ...report.audit.summary.largestMetricDelta })).filter((entry) => Number.isFinite(entry.absoluteDelta)).sort((a, b) => b.absoluteDelta - a.absoluteDelta || a.layoutId.localeCompare(b.layoutId))[0] ?? null;
}

export function runPairedAuthorityComparisonAuditFixtures() {
  const { rawCurve, perSeatRawCurves } = fixtureCurves();
  const reports = PAIRED_COMPARISON_FIXTURE_LAYOUTS.map((layout) => {
    const transfer = computeNormalizedRoomTransfer({ roomDims: ROOM, rspPosition: RSP, seatingPositions: [], subsForSimulation: layout.subs, physicsOptions: PHYSICS });
    const pool = generateCandidatePool({ rawCurve, perSeatRawCurves, activeSubs: layout.subs, usableLfHz: 20, transitionHz: 120, p14TargetBasis: "recommended", perSourceComplexTransfers: transfer.perSourceRspComplexTransfers, normalizedTransferFingerprint: transfer.geometryFingerprint, calibrationFingerprint: `paired-comparison:${layout.id}` });
    const selectable = pool.selectablePool.length ? pool.selectablePool : pool.candidates;
    const before = selectionIds(selectable);
    const audit = auditPairedAuthorityCandidatePool(pool);
    const repeatedAudit = auditPairedAuthorityCandidatePool(pool);
    const after = selectionIds(selectable);
    return { layoutId: layout.id, tags: layout.tags, generatedCandidateCount: pool.generatedCandidateCount, productionSelectionUnchangedByAudit: JSON.stringify(before) === JSON.stringify(after), deterministic: JSON.stringify(audit) === JSON.stringify(repeatedAudit), audit };
  });
  const requiredTags = ["1 SUB2", "2 SUB2", "4 SUB2", "2 SUB4", "4 SUB4", "front-only", "front/rear", "co-located", "distributed"];
  const checks = [
    { name: "All required system and placement fixtures exist", passed: requiredTags.every((tag) => reports.some((report) => report.tags.includes(tag))) },
    { name: "Every generated optimiser candidate is audited", passed: reports.every((report) => report.generatedCandidateCount === report.audit.summary.candidateCount) },
    { name: "Audit does not mutate production selection", passed: reports.every((report) => report.productionSelectionUnchangedByAudit) },
    { name: "P19 remains unchanged in every comparison", passed: reports.every((report) => report.audit.candidates.every((candidate) => candidate.differenceFlags.p19Changed === false)) },
    { name: "Every row has the required comparison output", passed: reports.every((report) => report.audit.candidates.every((candidate) => candidate.candidateId && candidate.current?.p14 && candidate.current?.p18 && candidate.current?.p19 && candidate.current?.p20 && candidate.pairedMinimumResult && candidate.pairedRecommendedResult && typeof candidate.differenceFlags?.selectionImpact === "boolean")) },
    { name: "Audit output is deterministic for an unchanged pool", passed: reports.every((report) => report.deterministic) },
  ];
  const selectionChanges = reports.flatMap((report) => Object.entries(report.audit.summary.selectedCandidateChanges).filter(([, value]) => value.changed).map(([mode, value]) => ({ layoutId: report.layoutId, mode, ...value })));
  const smells = reports.flatMap((report) => report.audit.summary.professionalSmellTestFailures.map((failure) => ({ layoutId: report.layoutId, ...failure })));
  return {
    reports,
    summary: {
      layoutCount: reports.length,
      totalCandidateCount: reports.reduce((sum, report) => sum + report.audit.summary.candidateCount, 0),
      changedStatusCandidateCount: reports.reduce((sum, report) => sum + report.audit.summary.changedStatusCandidateCount, 0),
      selectedCandidateChanges: selectionChanges,
      selectedCandidateChangesAnyLayout: selectionChanges.length > 0,
      largestMetricDelta: globalLargest(reports),
      professionalSmellTestFailureCount: smells.length,
      professionalSmellTestFailures: smells,
    },
    checks,
    passed: checks.filter((check) => check.passed).length,
    total: checks.length,
    allPassed: checks.every((check) => check.passed),
  };
}