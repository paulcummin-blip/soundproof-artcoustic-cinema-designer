import { runCanonicalBassEqFixtures } from "../src/components/room/bass/canonicalBassEqFixtures.js";
import { runBassOptimiserCompatibilityFixtures } from "../src/components/room/bass/bassOptimiserCompatibilityFixtures.js";

const result = runCanonicalBassEqFixtures();
const compatibility = runBassOptimiserCompatibilityFixtures();
const cacheVersionChecksPassed = compatibility.checks
  .filter((check) => check.name.startsWith("2.") || check.name.startsWith("5.") || check.name.startsWith("8."))
  .every((check) => check.passed);
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
  cacheVersionChecksPassed,
  cacheCompatibility: compatibility,
}, null, 2));

if (failed.length || !result.physicalValidationPassed || !result.aggregateBoostWithinLimit || !result.aggregateCutWithinLimit || !cacheVersionChecksPassed) {
  process.exitCode = 1;
}
