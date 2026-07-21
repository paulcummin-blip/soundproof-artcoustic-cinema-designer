// Temporary all-fixtures runner — deleted after verification.
import { runFingerprintFixtures } from "@/components/room/bass/bassAnalysisFingerprintFixtures";
import { runContractFixtures } from "@/components/room/bass/bassAnalysisContractFixtures";
import { runIntegrationFixtures } from "@/components/room/bass/bassAnalysisIntegrationFixtures";
import { runNormalizedRoomTransferFixtures } from "@/components/room/bass/normalizedRoomTransferFixtures";
import { runNormalizedRoomTransferLiveFixtures } from "@/components/room/bass/normalizedRoomTransferLiveFixtures";

const suites = [
  { name: "Phase 1 — Fingerprint", run: runFingerprintFixtures },
  { name: "Phase 1 — Contract", run: runContractFixtures },
  { name: "Phase 2A — Integration", run: runIntegrationFixtures },
  { name: "Phase 2A — Normalized Room Transfer", run: runNormalizedRoomTransferFixtures },
  { name: "Phase 2B — Normalized Room Transfer Live", run: runNormalizedRoomTransferLiveFixtures },
];

let grandPassed = 0;
let grandTotal = 0;
const suiteSummaries = [];

for (const suite of suites) {
  try {
    const outcome = suite.run();
    grandPassed += outcome.passed;
    grandTotal += outcome.total;
    suiteSummaries.push({ name: suite.name, passed: outcome.passed, total: outcome.total, allPassed: outcome.allPassed });
    console.log(`\n=== ${suite.name}: ${outcome.passed}/${outcome.total} ${outcome.allPassed ? "PASS" : "FAIL"} ===`);
    if (!outcome.allPassed) {
      for (const r of outcome.results.filter(r => !r.passed)) {
        console.log(`  ✗ ${r.name}: ${r.details}`);
      }
    }
  } catch (e) {
    console.log(`\n=== ${suite.name}: EXCEPTION ===`);
    console.log(`  ${e?.message || String(e)}`);
    suiteSummaries.push({ name: suite.name, passed: 0, total: 0, allPassed: false, error: e?.message });
  }
}

console.log(`\n=== GRAND TOTAL: ${grandPassed}/${grandTotal} ===`);
for (const s of suiteSummaries) {
  console.log(`  ${s.allPassed ? "✓" : "✗"} ${s.name}: ${s.passed}/${s.total}${s.error ? " (EXCEPTION: " + s.error + ")" : ""}`);
}