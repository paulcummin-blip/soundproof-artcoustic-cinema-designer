import { runP18ExtensionAuthorityFixtures } from "../src/components/utils/p18ExtensionAuthorityFixtures.js";
import { runRp22GradingBoundaryFixtures } from "../src/components/utils/rp22/rp22GradingBoundaryFixtures.js";
import { runBassAuthoritativeAssessmentFixtures } from "../src/components/utils/bassAuthoritativeAssessmentFixtures.js";

const p18 = runP18ExtensionAuthorityFixtures();
const grading = runRp22GradingBoundaryFixtures();
const authority = runBassAuthoritativeAssessmentFixtures();
const result = {
  p18: { passed: p18.passed },
  grading: { passed: grading.passed, total: grading.total, allPassed: grading.allPassed },
  authority: { passed: authority.passed, total: authority.total, allPassed: authority.allPassed },
};

console.log(JSON.stringify(result, null, 2));

if (!grading.allPassed || !authority.allPassed) process.exitCode = 1;
