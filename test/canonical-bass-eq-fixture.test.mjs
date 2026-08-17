import { runCanonicalBassEqFixtures } from "../src/components/room/bass/canonicalBassEqFixtures.js";

const result = runCanonicalBassEqFixtures();
const failed = result.checks.filter((check) => !check.passed);

console.log(JSON.stringify({
  passed: result.passed,
  total: result.total,
  allPassed: result.allPassed,
  checks: result.checks,
  correctionWindowDiagnostics: result.correctionWindowDiagnostics,
  deepNullOperatingLevelOffsetDb: result.deepNullOperatingLevelOffsetDb,
  referenceL2OperatingLevelOffsetDb: result.referenceL2OperatingLevelOffsetDb,
  protectedNullBoostCount: result.protectedNullBoostCount,
  physicalValidationPassed: result.physicalValidationPassed,
  aggregateBoostWithinLimit: result.aggregateBoostWithinLimit,
  aggregateCutWithinLimit: result.aggregateCutWithinLimit,
}, null, 2));

if (failed.length || !result.physicalValidationPassed || !result.aggregateBoostWithinLimit || !result.aggregateCutWithinLimit) {
  process.exitCode = 1;
}
