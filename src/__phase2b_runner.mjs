// Phase 2B fixture runner — executes all Phase 1, 2A, and 2B fixture suites
// in Node using a custom ESM loader that resolves @/ imports.
//
// Usage: node --experimental-loader ./src/__phase2b_loader.mjs src/__phase2b_runner.mjs

import { runFingerprintFixtures } from "@/components/room/bass/bassAnalysisFingerprintFixtures";
import { runContractFixtures } from "@/components/room/bass/bassAnalysisContractFixtures";
import { runIntegrationFixtures } from "@/components/room/bass/bassAnalysisIntegrationFixtures";
import { runNormalizedRoomTransferFixtures } from "@/components/room/bass/normalizedRoomTransferFixtures";
import { runNormalizedRoomTransferLiveFixtures } from "@/components/room/bass/normalizedRoomTransferLiveFixtures";

// Normalize a fixture result to { results, passed, total, allPassed }.
// Existing suites (fingerprints, contract, integration, normalizedRoomTransfer)
// return a flat object of booleans. The live suite returns
// { results, passed, total, allPassed }.
function normalizeResult(raw) {
  if (raw && Array.isArray(raw.results)) {
    return raw;
  }
  const entries = Object.entries(raw || {});
  const results = entries.map(([name, passed]) => ({ name, passed: !!passed, details: "" }));
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  return { results, passed, total, allPassed: passed === total };
}

function printSuite(name, result) {
  console.log(`\n=== ${name} ===`);
  console.log(`  Passed: ${result.passed}/${result.total} ${result.allPassed ? "ALL PASSED" : "FAILURES"}`);
  for (const r of result.results) {
    console.log(`  ${r.passed ? "PASS" : "FAIL"} ${r.name}`);
    if (!r.passed && r.details) console.log(`    ${r.details}`);
  }
}

const suites = [
  ["fingerprints", normalizeResult(runFingerprintFixtures())],
  ["contract", normalizeResult(runContractFixtures())],
  ["integration", normalizeResult(runIntegrationFixtures())],
  ["normalizedRoomTransfer", normalizeResult(runNormalizedRoomTransferFixtures())],
  ["normalizedRoomTransferLive", normalizeResult(runNormalizedRoomTransferLiveFixtures())],
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