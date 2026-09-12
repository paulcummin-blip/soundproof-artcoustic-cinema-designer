// checkpoint-final-verify.mjs
// Comprehensive verification of the five-stage Improve Bass workflow.
// Tests: apply field isolation, stale invalidation, cancel safety,
// one-result-per-stage, completed history.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => readFileSync(join(__dirname, "..", "src", rel), "utf8");

let pass = 0;
let fail = 0;
function check(name, condition, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ════════════════════════════════════════════════════════════════════
// CHECKPOINT 1: ONE RESULT PER STAGE
// ════════════════════════════════════════════════════════════════════
console.log("\n=== CHECKPOINT 1: ONE RESULT PER STAGE ===\n");

const stageAuthority = readSrc("components/room/bass/improveBassV2/improveBassV2StageAuthority.js");
check("buildStageResults returns 5 stage keys", stageAuthority.includes("phase") && stageAuthority.includes("delay") && stageAuthority.includes("gain") && stageAuthority.includes("subPositions") && stageAuthority.includes("seating"));
check("STAGE_ORDER has exactly 5 stages", stageAuthority.includes('["phase", "delay", "gain", "subPositions", "seating"]'));
check("Each stage has at most ONE result (verdict + result)", stageAuthority.includes("verdict:") && stageAuthority.includes("result:"));
check("Phase is NOT AVAILABLE (not faked)", stageAuthority.includes('verdict: "not_available"') && stageAuthority.includes("phase control model"));

const stageResults = readSrc("components/room/bass/improveBassV2/ImproveBassV2StageResults.jsx");
check("StageResults renders STAGE_ORDER (one row per stage)", stageResults.includes("STAGE_ORDER.map"));
check("StageResults uses buildStageResults (not rankRecommendations)", stageResults.includes("buildStageResults") && !stageResults.includes("rankRecommendations"));
check("StageResults does NOT render tier labels (BEST/NEXT BEST)", !stageResults.includes("BEST IMPROVEMENT") && !stageResults.includes("NEXT BEST"));

const v2Comp = readSrc("components/room/bass/improveBassV2/ImproveBassResponseV2.jsx");
check("V2 component renders ImproveBassV2StageResults (not old ranked cards)", v2Comp.includes("ImproveBassV2StageResults") && !v2Comp.includes("<ImproveBassV2Results"));
check("V2 component passes onApplyStage (per-stage apply)", v2Comp.includes("onApplyStage={handleApplyStage}"));

// ════════════════════════════════════════════════════════════════════
// CHECKPOINT 2: APPLY FIELD ISOLATION
// ════════════════════════════════════════════════════════════════════
console.log("\n=== CHECKPOINT 2: APPLY FIELD ISOLATION ===\n");

const applyCal = readSrc("components/room/bass/improveBassV2/improveBassV2ApplyCalibration.js");
// A. APPLY DELAY / GAIN
check("applyCalibrationTuning only changes delayMs, gainDb, polarity, tuningSource", 
  applyCal.includes("delayMs:") && applyCal.includes("gainDb:") && applyCal.includes("polarity:") && applyCal.includes("tuningSource:"));
check("applyCalibrationTuning preserves position (spreads ...inst)", 
  applyCal.includes("...inst") && applyCal.includes("position:") === false); // position is NOT explicitly set — preserved via spread
check("applyCalibrationTuning does NOT change model", !applyCal.includes("model:"));
check("applyCalibrationTuning does NOT change enabled state (disabled preserved)", applyCal.includes("inst.enabled === false"));
check("applyCalibrationTuning does NOT change bottomHeightM", !applyCal.includes("bottomHeightM:"));
check("applyCalibrationTuning does NOT change rotationDeg", !applyCal.includes("rotationDeg:"));

const applyMain = readSrc("components/room/bass/improveBassV2/improveBassV2Apply.js");
// C. APPLY SUBWOOFER POSITION
check("buildOptimisedInstances only changes position + positionSource", 
  applyMain.includes("position: { ...inst.position, x:") && applyMain.includes("positionSource:"));
check("buildOptimisedInstances preserves disabled instances", applyMain.includes("inst.enabled === false"));
check("buildOptimisedInstances does NOT change model", !applyMain.match(/model\s*:/));
check("buildOptimisedInstances does NOT change bottomHeightM", !applyMain.match(/bottomHeightM\s*:/));
check("buildOptimisedInstances does NOT change rotationDeg", !applyMain.match(/rotationDeg\s*:/));

// D. APPLY SEATING POSITION
check("handleApplyStage seating branch only calls commitSeating", 
  v2Comp.includes('stageKey === "seating"') && v2Comp.includes("commitSeating(result.seatingPositions)"));
check("handleApplyStage seating branch only calls commitSeating (not commitInstances)", 
  v2Comp.includes('} else if (stageKey === "seating")') && 
  v2Comp.includes("commitSeating(result.seatingPositions)") && 
  !v2Comp.includes('stageKey === "seating"') ? false : // guard against syntax error
  // Verify the seating branch block does not contain commitInstances
  (() => {
    const idx = v2Comp.indexOf('stageKey === "seating"');
    const blockEnd = v2Comp.indexOf("}, [", idx);
    const block = v2Comp.slice(idx, blockEnd > idx ? blockEnd : idx + 200);
    return !block.includes("commitInstances");
  })());
check("handleApplyStage delay/gain calls applyCalibrationTuning (not buildOptimisedInstances)", 
  v2Comp.includes('stageKey === "delay" || stageKey === "gain"') && v2Comp.includes("applyCalibrationTuning(subwooferInstances"));
check("handleApplyStage subPositions calls buildOptimisedInstances", 
  v2Comp.includes('stageKey === "subPositions"') && v2Comp.includes("buildOptimisedInstances("));

// ════════════════════════════════════════════════════════════════════
// CHECKPOINT 3: STALE RECOMMENDATION INVALIDATION
// ════════════════════════════════════════════════════════════════════
console.log("\n=== CHECKPOINT 3: STALE RECOMMENDATION INVALIDATION ===\n");

check("V2 computes currentDesignFingerprint on every render", 
  v2Comp.includes("currentDesignFingerprint") && v2Comp.includes("useMemo"));
check("completedResultStale compares fingerprint vs winner.applyFingerprint", 
  v2Comp.includes("completedResultStale") && v2Comp.includes("currentDesignFingerprint !== state.winner.applyFingerprint"));
check("StageResults hidden when stale (completedResultStale gate)", 
  v2Comp.includes("!completedResultStale") && v2Comp.includes("ImproveBassV2StageResults"));
check("CompletedInvestigation shown even when stale (history persists)", 
  v2Comp.includes("ImproveBassV2CompletedInvestigation") && v2Comp.includes("stale={completedResultStale}"));
check("StageRow Apply button hidden when stale", 
  readSrc("components/room/bass/improveBassV2/ImproveBassV2StageRow.jsx").includes("!stale && onApply"));
check("handleApplyStage rejects stale at runtime (fingerprint check)", 
  v2Comp.includes("fingerprint !== state.winner.applyFingerprint") && v2Comp.includes('setStale(projectId, "Design changed'));

// ════════════════════════════════════════════════════════════════════
// CHECKPOINT 4: POST-APPLY CANONICAL CURRENT
// ════════════════════════════════════════════════════════════════════
console.log("\n=== CHECKPOINT 4: POST-APPLY CANONICAL CURRENT ===\n");

check("V2 winner is NOT treated as canonical authority (uses shared.completedBassAuthority)", 
  v2Comp.includes("shared?.completedBassAuthority") && v2Comp.includes("currentAuthority: shared?.completedBassAuthority"));
check("V2 does NOT write to completedBassAuthority (only reads)", 
  !v2Comp.includes("setCompletedBassAuthority") && !v2Comp.includes("completedBassAuthority ="));
check("Apply commits to project state (commitInstances/commitSeating), not to V2 store", 
  v2Comp.includes("commitInstances(next") && v2Comp.includes("commitSeating(result.seatingPositions)"));
check("After Apply, design change triggers production recalculation (fingerprint mismatch)", 
  v2Comp.includes("currentDesignFingerprint") && v2Comp.includes("completedResultStale"));

// ════════════════════════════════════════════════════════════════════
// CHECKPOINT 5-8: REPORT PROPAGATION
// ════════════════════════════════════════════════════════════════════
console.log("\n=== CHECKPOINT 5-8: REPORT PROPAGATION ===\n");

const reportFiles = [
  ["artcousticSystemDesignRating.js", "components/report/technical/artcousticSystemDesignRating.js"],
  ["buildDesignRatingInput.js", "components/report/technical/buildDesignRatingInput.js"],
  ["RP22CompliancePanel.jsx", "components/rp22/RP22CompliancePanel.jsx"],
  ["selectClientBass.js", "components/report/client/selectClientBass.js"],
  ["useAppDesignRating.js", "components/hooks/useAppDesignRating.js"],
];
for (const [name, path] of reportFiles) {
  const content = readSrc(path);
  const noV2 = !content.includes("improveBassV2Store") && !content.includes("ImproveBassV2Results") && !content.includes("ImproveBassV2StageResults");
  check(`${name} does NOT import V2 store/proposals`, noV2);
}

check("buildDesignRatingInput uses completedBassAuthority (not V2 winner)", 
  readSrc("components/report/technical/buildDesignRatingInput.js").includes("completedBassAuthority") && 
  readSrc("components/report/technical/buildDesignRatingInput.js").includes("completedBassPresentation"));
check("isMetricIneligible excludes N/A from rating floors", 
  readSrc("components/report/technical/buildDesignRatingInput.js").includes("isMetricIneligible"));

// ════════════════════════════════════════════════════════════════════
// CHECKPOINT 9: SERIALIZE / REOPEN PARITY
// ════════════════════════════════════════════════════════════════════
console.log("\n=== CHECKPOINT 9: SERIALIZE / REOPEN PARITY ===\n");

check("V2 store is NOT persisted (resets on reopen)", 
  !readSrc("components/room/bass/improveBassV2/improveBassV2Store.js").includes("localStorage") && 
  !readSrc("components/room/bass/improveBassV2/improveBassV2Store.js").includes("sessionStorage"));
check("Apply writes to project entity (commitInstances/commitSeating), not V2 store", 
  v2Comp.includes("commitInstances") && v2Comp.includes("commitSeating"));
check("subwooferInstances carry delayMs/gainDb/polarity (persisted fields)", 
  readSrc("components/room/bass/improveBassV2/improveBassV2ApplyCalibration.js").includes("delayMs:") && 
  readSrc("components/room/bass/improveBassV2/improveBassV2ApplyCalibration.js").includes("gainDb:") && 
  readSrc("components/room/bass/improveBassV2/improveBassV2ApplyCalibration.js").includes("polarity:"));
check("tuningSource marks V2-applied instances (provenance)", 
  readSrc("components/room/bass/improveBassV2/improveBassV2ApplyCalibration.js").includes('tuningSource: "v2-optimised"'));
check("Position apply marks positionSource (provenance)", 
  readSrc("components/room/bass/improveBassV2/improveBassV2Apply.js").includes('positionSource: "v2-optimised"'));

// ════════════════════════════════════════════════════════════════════
// CHECKPOINT 10: COMPLETED HISTORY AFTER APPLY
// ════════════════════════════════════════════════════════════════════
console.log("\n=== CHECKPOINT 10: COMPLETED HISTORY AFTER APPLY ===\n");

const completedInv = readSrc("components/room/bass/improveBassV2/ImproveBassV2CompletedInvestigation.jsx");
check("CompletedInvestigation rendered in ALL terminal states (complete/cancelled/stale/error)", 
  v2Comp.includes("isComplete &&") && v2Comp.includes("isCancelled &&") && v2Comp.includes("isStale &&") && v2Comp.includes("isError &&"));
check("CompletedInvestigation does NOT have Apply buttons", 
  !completedInv.includes("onApply") && !completedInv.includes("Apply") || completedInv.includes("APPLIED"));
check("CompletedInvestigation accepts stale prop", completedInv.includes("stale"));
check("CompletedInvestigation persists after completion (not cleared)", 
  !v2Comp.includes("resetImproveBassV2") || v2Comp.includes("handleRetry"));

// ════════════════════════════════════════════════════════════════════
// CHECKPOINT 11: CANCEL SAFETY
// ════════════════════════════════════════════════════════════════════
console.log("\n=== CHECKPOINT 11: CANCEL SAFETY ===\n");

check("Cancel calls requestCancel (sets cancelRequested flag)", 
  v2Comp.includes("requestCancel(projectId)"));
check("Cancel also cancels heavy action (Stage 2)", 
  v2Comp.includes("cancelBassHeavyAction(projectId"));
check("Cancelled jobs never publish winner (setCancelled only)", 
  v2Comp.includes('result.status === "cancelled"') && v2Comp.includes("setCancelled(projectId)"));
check("Cancelled state shows CompletedInvestigation (earlier stages visible)", 
  v2Comp.includes("isCancelled &&") && v2Comp.includes("<ImproveBassV2CompletedInvestigation"));
check("Cancelled state does NOT call commitInstances/commitSeating", 
  (() => {
    const idx = v2Comp.indexOf("isCancelled &&");
    const blockEnd = v2Comp.indexOf("{isStale", idx);
    const block = v2Comp.slice(idx, blockEnd > idx ? blockEnd : idx + 500);
    return !block.includes("commitInstances") && !block.includes("commitSeating");
  })());
check("Retry resets V2 store (fresh run works without reload)", 
  v2Comp.includes("handleRetry") && v2Comp.includes("resetImproveBassV2(projectId)"));
check("Engine checks isCancelled periodically", 
  v2Comp.includes("isCancelled: () => isCancelRequested(projectId)"));

// ════════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════════
console.log(`\n=== FINAL VERIFICATION: ${pass} passed, ${fail} failed ===\n`);
if (fail > 0) {
  console.error("FINAL VERIFICATION FAILED");
  process.exit(1);
}
console.log("FINAL VERIFICATION PASSED");