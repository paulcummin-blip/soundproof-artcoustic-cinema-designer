// Temporary fixture runner for Phase 2A verification.
import { register } from 'node:module';
register('./__phase2a_loader.mjs', import.meta.url);

const { runNormalizedRoomTransferFixtures } = await import('./components/room/bass/normalizedRoomTransferFixtures.js');
const result = runNormalizedRoomTransferFixtures();

console.log(`\n=== Phase 2A Normalized Room Transfer Fixtures ===`);
console.log(`Passed: ${result.passed}/${result.total} ${result.allPassed ? 'ALL PASSED' : 'SOME FAILED'}`);
result.results.forEach((r) => {
  console.log(`  ${r.passed ? 'PASS' : 'FAIL'} ${r.name}`);
  console.log(`    ${r.details}`);
});
console.log('\n=== JSON RESULT ===');
console.log(JSON.stringify({ passed: result.passed, total: result.total, allPassed: result.allPassed }));