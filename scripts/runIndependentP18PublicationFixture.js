import { runContractFixtures } from "../src/components/room/bass/bassAnalysisContractFixtures.js";

const results = runContractFixtures();
const passed = results.independentP18SurvivesP14Miss === true;
console.log(JSON.stringify({
  name: "P18 publishes Minimum L2 at 30.65 Hz when P14 123 dBC fails",
  expected: "P14 FAIL; P18 L2 · 30 Hz",
  passed,
}, null, 2));
if (!passed) process.exitCode = 1;
