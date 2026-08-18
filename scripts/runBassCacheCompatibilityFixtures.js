import { runBassOptimiserCompatibilityFixtures } from "../src/components/room/bass/bassOptimiserCompatibilityFixtures.js";
import { runBassResultAuthorityFixtures } from "../src/components/room/bass/bassResultAuthorityFixtures.js";

const compatibility = runBassOptimiserCompatibilityFixtures();
const authority = runBassResultAuthorityFixtures();
const allPassed = compatibility.allPassed && authority.allPassed;

console.log(JSON.stringify({
  compatibility,
  authority,
  allPassed,
}, null, 2));

if (!allPassed) process.exitCode = 1;
