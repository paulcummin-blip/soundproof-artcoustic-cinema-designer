import { runContractFixtures } from "../src/components/room/bass/bassAnalysisContractFixtures.js";

const results = runContractFixtures();
const failed = Object.entries(results).filter(([, passed]) => passed !== true);
console.log(JSON.stringify({ passed: Object.keys(results).length - failed.length, total: Object.keys(results).length, allPassed: failed.length === 0, failed }, null, 2));
if (failed.length) process.exitCode = 1;
