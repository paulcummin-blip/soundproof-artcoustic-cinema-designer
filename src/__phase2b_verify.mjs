// Temporary Phase 2B fixture runner — deleted after verification.
import { runNormalizedRoomTransferLiveFixtures } from "@/components/room/bass/normalizedRoomTransferLiveFixtures";

const outcome = runNormalizedRoomTransferLiveFixtures();
console.log(`\n=== Phase 2B Live Fixtures: ${outcome.passed}/${outcome.total} ${outcome.allPassed ? "PASS" : "FAIL"} ===\n`);
for (const r of outcome.results) {
  console.log(`  ${r.passed ? "✓" : "✗"} ${r.name}`);
  console.log(`    ${r.details}`);
}
if (!outcome.allPassed) {
  console.log("\nFAILED FIXTURES:");
  for (const r of outcome.results.filter(r => !r.passed)) {
    console.log(`  ✗ ${r.name}: ${r.details}`);
  }
}