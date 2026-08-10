import { runLcrUpgradeAssertions } from "./components/recommendations/designRecommendationLcrUpgrade.fixtures.js";

const result = runLcrUpgradeAssertions();
console.log(JSON.stringify(result, null, 2));
if (!result.allPassed) process.exitCode = 1;
