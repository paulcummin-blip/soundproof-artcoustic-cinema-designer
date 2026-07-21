// Phase 2B fixture runner — executes all Phase 1, 2A, and 2B fixture suites
// in Node using a custom ESM loader that resolves @/ imports.
//
// Usage: node --experimental-loader ./src/__phase2b_loader.mjs src/__phase2b_runner.mjs

import { runFingerprintFixtures } from "@/components/room/bass/bassAnalysisFingerprintFixtures";
import { runContractFixtures } from "@/components/room/bass/bassAnalysisContractFixtures";
import { runIntegrationFixtures } from "@/components/room/bass/bassAnalysisIntegrationFixtures";
import { runNormalizedRoomTransferFixtures } from "@/components/room/bass/normalizedRoomTransferFixtures";
import { runNormalizedRoomTransferLiveFixtures } from "@/components/room/bass/normalizedRoomTransferLiveFixtures";

function printSuite(name, result) {
  console.log(`\n=== ${name} ===`);
  console.log(`  Passed: ${result.passed}/${result.total} ${result.allPassed ? "ALL PASSED" : "FAILURES"}`);
  for (const r of result.results) {
    console.log(`  ${r.passed ? "PASS" : "FAIL"} ${r.name}`);
    if (!r.passed) console.log(`    ${r.details}`);
  }
}

const suites = [
  ["fingerprints", runFingerprintFixtures()],
  ["contract", runContractFixtures()],
  ["integration", runIntegrationFixtures()],
  ["normalizedRoomTransfer", runNormalizedRoomTransferFixtures()],
  ["normalizedRoomTransferLive", runNormalizedRoomTransferLiveFixtures()],
];

let allPassed = true;
const summary = [];

for (const [name, result] of suites) {
  printSuite(name, result);
  summary.push({ name, passed: result.passed, total: result.total, allPassed: result.allPassed });
  if (!result.allPassed) allPassed = false;
}

console.log("\n=== JSON SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));

if (!allPassed) {
  process.exit(1);
}