import { runLiveBassTestOptimiserFixture } from "../src/components/utils/liveBassTestOptimiserFixture.js";

const result = runLiveBassTestOptimiserFixture([123]);
const candidate = result.cases[0];
console.log(JSON.stringify({
  targetDb: candidate?.targetDb,
  p14AvailableDb: candidate?.p14AvailableDb,
  p14MarginDb: candidate?.p14MarginDb,
  p18Hz: candidate?.p18Hz,
  p18Level: candidate?.p18Level,
  p19Db: candidate?.p19Db,
  p19DisplayDb: candidate?.p19DisplayDb,
  p19Level: candidate?.p19Level,
  filters: candidate?.filters,
  samples: candidate?.samples,
  broadValley: {
    changed: candidate?.broadValleyRebalance?.changed,
    reason: candidate?.broadValleyRebalance?.reason,
    selected: candidate?.broadValleyRebalance?.selected,
    diagnostics: candidate?.broadValleyRebalance?.diagnostics,
    verification: candidate?.broadValleyRebalance?.verification ? {
      testedBanks: candidate.broadValleyRebalance.verification.testedBanks,
      rspLevelRegression: candidate.broadValleyRebalance.verification.rspLevelRegression,
      rspRmsWorsening: candidate.broadValleyRebalance.verification.rspRmsWorsening,
      bestValleySample: candidate.broadValleyRebalance.verification.bestValleySample,
    } : null,
  },
}, null, 2));
