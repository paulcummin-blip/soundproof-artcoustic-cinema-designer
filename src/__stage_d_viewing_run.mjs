import { runViewingPriorityRecommendationAssertions } from "./components/recommendations/designRecommendationViewingPriority.fixtures.js";

const result = runViewingPriorityRecommendationAssertions();
console.log(JSON.stringify(result, null, 2));
if (!result.allPassed) process.exitCode = 1;
