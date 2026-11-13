import { prepareElectronicCandidate, settingsEqual } from "../optimiseWorkflow/electronicApplication.js";
export const COMBINED_ELECTRONIC_APPLY_BLOCK = Object.freeze({
  NO_LEVER: "no_lever",
  INCOMPLETE: "incomplete",
  IDENTITY_MISMATCH: "identity_mismatch",
  NO_CROSSOVER: "no_crossover",
  NO_TUNING: "no_tuning",
  STALE_FINGERPRINT: "stale_fingerprint",
  BAD_TUNING: "bad_tuning",
  BAD_CROSSOVER: "bad_crossover",
});

export const COMBINED_ELECTRONIC_APPLY_BLOCK_MESSAGE = Object.freeze({
  [COMBINED_ELECTRONIC_APPLY_BLOCK.NO_LEVER]:
    "No combined electronic optimisation result is saved for this design.",
  [COMBINED_ELECTRONIC_APPLY_BLOCK.INCOMPLETE]:
    "The confirmed configuration is incomplete — missing crossover or tuning settings prevent a complete apply.",
  [COMBINED_ELECTRONIC_APPLY_BLOCK.IDENTITY_MISMATCH]:
    "The installed subwoofers no longer match the configuration ADI confirmed. Re-run the Optimisation Plan.",
  [COMBINED_ELECTRONIC_APPLY_BLOCK.NO_CROSSOVER]:
    "The confirmed crossover configuration is missing — a partial apply is not permitted.",
  [COMBINED_ELECTRONIC_APPLY_BLOCK.NO_TUNING]:
    "The confirmed per-source tuning is missing — a partial apply is not permitted.",
  [COMBINED_ELECTRONIC_APPLY_BLOCK.STALE_FINGERPRINT]:
    "This optimisation result belongs to an earlier design state. Re-run the Optimisation Plan before applying.",
  [COMBINED_ELECTRONIC_APPLY_BLOCK.BAD_TUNING]:
    "The confirmed tuning contains duplicate IDs, non-finite values, or missing fields — it cannot be applied safely.",
  [COMBINED_ELECTRONIC_APPLY_BLOCK.BAD_CROSSOVER]:
    "The confirmed crossover contains non-finite or missing values — it cannot be applied safely.",
});

const blocked = (code) => ({
  ok: false,
  code,
  reason: COMBINED_ELECTRONIC_APPLY_BLOCK_MESSAGE[code],
});


export function buildCombinedElectronicApply(){
  // Legacy lever consumers commit only instances. They must never execute half
  // of a combined change; the mounted ADI workflow owns the full transaction.
  return {ok:false,code:COMBINED_ELECTRONIC_APPLY_BLOCK.INCOMPLETE,
    reason:"Run ADI to apply and verify the complete electronic configuration."};
}
export function buildCombinedElectronicUndo(){
  return {ok:false,code:COMBINED_ELECTRONIC_APPLY_BLOCK.INCOMPLETE,
    reason:"Restore previous settings through the saved and verified ADI receipt."};
}
export function isCombinedElectronicApplied(lever,instances,currentCrossover){
  // Merely matching settings is not evidence of persistence or verification.
  return false;
}
