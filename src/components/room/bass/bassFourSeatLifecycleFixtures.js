import { buildHouseCurveAccuracyReference } from "@/components/utils/houseCurveAccuracyFixtures";
import { generateCandidatePool, selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { HOUSE_CURVE_ENGINE_VERSION, BASS_RESULT_SCHEMA_VERSION } from "./bassResultAuthority";

export function runFourSeatBassLifecycleFixture() {
  const { rawCurve, perSeatRawCurves } = buildHouseCurveAccuracyReference();
  const stages = [];
  const startedAt = performance.now();
  const pool = generateCandidatePool({
    rawCurve,
    perSeatRawCurves,
    activeSubs: [{ modelKey: "SUB2-12" }, { modelKey: "SUB2-12" }],
    usableLfHz: 20,
    transitionHz: 120,
    onProgress: (progress) => stages.push(progress.phase),
  });
  const selected = selectCandidateFromPool(pool, "balanced");
  const elapsedMs = performance.now() - startedAt;
  const checks = [
    ["Four real seats evaluated", pool.performanceSummary?.seatCount === 4],
    ["Two-sub candidate pool completed", pool.generatedCandidateCount > 0],
    ["Ranked candidate pool created", stages.includes("rankedCandidates created")],
    ["Ranked selectable pool created", stages.includes("rankedSelectablePool created")],
    ["Priority selection completed", !!selected.selectedCandidate],
    ["Engine and result versions are singular", pool.engineVersion === HOUSE_CURVE_ENGINE_VERSION && pool.resultSchemaVersion === BASS_RESULT_SCHEMA_VERSION],
  ].map(([name, passed]) => ({ name, passed: !!passed }));
  return { checks, passed: checks.filter((check) => check.passed).length, total: checks.length, allPassed: checks.every((check) => check.passed), elapsedMs, workerRequests: 1, replacementRuns: 0, lastStage: stages.at(-1) || null, poolId: pool.poolId };
}