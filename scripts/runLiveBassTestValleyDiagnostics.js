import { runLiveBassTestOptimiserFixture } from "../src/components/utils/liveBassTestOptimiserFixture.js";

const result = runLiveBassTestOptimiserFixture([109]);
console.log(JSON.stringify(result.cases[0]?.broadValleyRebalance?.verification ?? null, null, 2));
