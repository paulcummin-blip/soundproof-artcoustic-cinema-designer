import { runAllFixtures } from './components/report/technical/artcousticSystemDesignRatingFixtures.js';
const result = runAllFixtures();
const failed = result.results.filter(f => !f.passed);
console.log(JSON.stringify({
  allPassed: result.allPassed,
  total: result.results.length,
  passed: result.results.filter(f=>f.passed).length,
  failed: failed.length,
  failedNames: failed.map(f => `${f.name}: ${f.details}`),
}, null, 2));