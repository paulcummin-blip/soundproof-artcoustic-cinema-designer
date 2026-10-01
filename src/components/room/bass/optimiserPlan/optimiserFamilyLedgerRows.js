// optimiserFamilyLedgerRows.js
// ---------------------------------------------------------------------------
// The "What ADI tested" ledger rows, built from the SAVED RUN EVIDENCE.
//
// Product rule this exists to satisfy: if the card states how many design
// options ADI tested, the ledger beneath it must state what was tested and what
// happened. A family the run evaluated is NEVER shown as "Not evaluated".
//
// The evidence is the per-family ledger the completed run already wrote
// (run.families — see optimiserRunFamilies.js). This module reads it, applies
// the designer-facing vocabulary and returns one row per family. Where the run
// retained no attempt for a family, the reason the run recorded is stated.
//
// READ-ONLY: it evaluates nothing, scores nothing, recalculates nothing and
// changes no bass maths, no optimiser scoring and no RP22 grading.
// ---------------------------------------------------------------------------

import { OPTIMISER_FAMILY_SEQUENCE } from "./optimiserLeverOrder.js";
import {
  OPTIMISER_FAMILY_STATUS,
  OPTIMISER_RUN_FAMILY,
} from "./optimiserRunFamilies.js";
import { OPTIMISER_LEVER_VERDICT, resolveLeverVerdict } from "./optimiserLeverVerdict.js";

/**
 * The designer-facing status words. Only these are ever shown, and each says
 * exactly what happened to that family.
 */
export const ADI_ROW_STATUS = Object.freeze({
  TESTED: "Tested",
  RECOMMENDED: "Recommended",
  TRADE_OFF: "Trade-off",
  REJECTED: "Rejected",
  NOT_EVALUATED: "Not evaluated",
  NOT_YET_EVALUATED: "Not yet evaluated",
  NOT_TESTED: "Not tested",
  NOT_RETAINED: "Not retained",
  COMBINED_ONLY: "Combined only",
  CHECKED_IN_PLACEMENT: "Checked in placement search",
  COMPARE_SEPARATELY: "Compare separately",
  LAST_RESORT: "Last resort",
  APPLIED: "Applied",
});

/**
 * The designer-facing outcome phrases. A family that was evaluated states what
 * its best attempt did; a family that was not states why.
 */
export const ADI_ROW_OUTCOME = Object.freeze({
  NO_USEFUL: "No useful improvement",
  NO_SAFE: "No safe improvement",
  NO_SAFE_STANDALONE: "No safe standalone result",
  WORSENS: "Worsens the result",
  TRADE_OFF: "Improves one measure, worsens another",
  IMPROVES_NOT_OFFERED: "Improvement found — not offered for application",
  NO_BETTER_LAYOUT: "No better layout found",
  COMPARE_SEPARATELY: "Compare separately",
  DESIGN_DECISION: "Subwoofer model and quantity are a design decision",
  NOT_REQUIRED_YET: "Not required yet",
  NO_ATTEMPT_RETAINED: "Evaluated — no attempt value retained",
  PHASE_UNAVAILABLE: "Crossover-region model not available",
  NOT_STARTED: "This search was not started in this run",
  EVALUATION_FAILED: "The evaluation did not complete",
  UNAVAILABLE: "Not available",
});

/** The eight reported families, keyed by the lever they present as. */
const ROW_FAMILY = Object.freeze({
  delay: OPTIMISER_RUN_FAMILY.DELAY,
  gain: OPTIMISER_RUN_FAMILY.GAIN,
  phase: OPTIMISER_RUN_FAMILY.PHASE,
  polarity: OPTIMISER_RUN_FAMILY.POLARITY,
  placement: OPTIMISER_RUN_FAMILY.PLACEMENT,
  layout: OPTIMISER_RUN_FAMILY.ADDITIONAL_POSITIONS,
  subwoofer_option: OPTIMISER_RUN_FAMILY.SUBWOOFER_OPTION,
  seating: OPTIMISER_RUN_FAMILY.SEAT_MOVEMENT,
});

/** One short phrase at most — the ledger never shows a paragraph. */
function shortPhrase(text, maxLength = 72) {
  if (typeof text !== "string" || !text.trim()) return null;
  const first = text.trim().split(/(?<=\.)\s/)[0].trim();
  return first.length <= maxLength ? first : `${first.slice(0, maxLength - 1).trimEnd()}…`;
}

/** One family record from the run's own ledger. */
function familyOf(families, key) {
  const wanted = ROW_FAMILY[key];
  if (!wanted) return null;
  return families.find((entry) => entry?.family === wanted) || null;
}

/** The placement family, which is where an alternative layout is searched. */
const placementEntry = (families) => familyOf(families, "placement");

/** Was this family evaluated in any form, including a failed evaluation? */
function wasTested(entry) {
  if (entry?.tested === true) return true;
  return entry?.status === OPTIMISER_FAMILY_STATUS.FAILED
    || entry?.status === OPTIMISER_FAMILY_STATUS.INCOMPLETE;
}

/**
 * What a family's best evaluated attempt did to the limiting result, in the
 * designer vocabulary. Read from the same verdict authority the Engineer
 * details block uses, so the summary row and the detail can never disagree.
 */
function testedOutcome(entry, baseline) {
  const attempt = entry?.bestAttempt || null;
  if (!attempt) {
    return {
      status: ADI_ROW_STATUS.TESTED,
      outcome: shortPhrase(entry?.reason) || ADI_ROW_OUTCOME.NO_ATTEMPT_RETAINED,
    };
  }

  const verdict = resolveLeverVerdict({
    effect: {
      p20DeltaDb: attempt.p20DeltaDb,
      p19DeltaDb: attempt.p19DeltaDb,
      p14DeltaDb: attempt.p14DeltaDb,
    },
    baseline,
    tested: true,
  });

  if (verdict.verdict === OPTIMISER_LEVER_VERDICT.REJECTED) {
    return { status: ADI_ROW_STATUS.REJECTED, outcome: ADI_ROW_OUTCOME.WORSENS };
  }
  if (verdict.verdict === OPTIMISER_LEVER_VERDICT.TRADE_OFF) {
    return { status: ADI_ROW_STATUS.TRADE_OFF, outcome: ADI_ROW_OUTCOME.TRADE_OFF };
  }
  if (verdict.verdict === OPTIMISER_LEVER_VERDICT.RECOMMENDED) {
    return { status: ADI_ROW_STATUS.TESTED, outcome: ADI_ROW_OUTCOME.IMPROVES_NOT_OFFERED };
  }
  if (verdict.verdict === OPTIMISER_LEVER_VERDICT.NOT_APPLICABLE) {
    return {
      status: ADI_ROW_STATUS.TESTED,
      outcome: shortPhrase(entry?.reason) || ADI_ROW_OUTCOME.NO_ATTEMPT_RETAINED,
    };
  }
  return { status: ADI_ROW_STATUS.TESTED, outcome: ADI_ROW_OUTCOME.NO_USEFUL };
}

/**
 * One row's status and outcome, from that family's own evidence.
 *
 * Two families are reported by what they are rather than by a verdict: an
 * alternative LAYOUT is only ever searched inside the placement pool, and the
 * SUBWOOFER OPTION is never searched at all. Neither may read as an unevaluated
 * family, and neither is reported as a tested lever in its own right.
 */
function rowFor(key, entry, families, baseline) {
  const status = entry?.status || null;
  const tested = wasTested(entry);

  // ── Phase / crossover-region alignment ── the model decides, not the run.
  // The engine's phase search is subwoofer-only, so the crossover region is not
  // evaluated. Stated as not yet evaluated until the model supports it.
  if (key === "phase") {
    const region = entry?.crossoverRegion || null;
    const regionEvaluated = region?.supported === true && region?.evaluated === true;
    if (!regionEvaluated) {
      return { status: ADI_ROW_STATUS.NOT_YET_EVALUATED, outcome: ADI_ROW_OUTCOME.PHASE_UNAVAILABLE };
    }
  }

  // ── Polarity ── explored inside the combined candidate only. There is no
  // standalone evaluation, so there is no safe independent result.
  if (key === "polarity") {
    return { status: ADI_ROW_STATUS.COMBINED_ONLY, outcome: ADI_ROW_OUTCOME.NO_SAFE_STANDALONE };
  }

  // ── Subwoofer option ── never a searched lever: a design decision.
  if (key === "subwoofer_option") {
    return { status: ADI_ROW_STATUS.COMPARE_SEPARATELY, outcome: ADI_ROW_OUTCOME.DESIGN_DECISION };
  }

  // ── Layout ── searched inside the placement pool, so it is stated as checked
  // there. When the placement search itself never ran, that is said instead.
  if (key === "layout") {
    if (wasTested(placementEntry(families))) {
      return { status: ADI_ROW_STATUS.CHECKED_IN_PLACEMENT, outcome: ADI_ROW_OUTCOME.NO_BETTER_LAYOUT };
    }
    return {
      status: ADI_ROW_STATUS.NOT_TESTED,
      outcome: shortPhrase(entry?.reason) || ADI_ROW_OUTCOME.NOT_STARTED,
    };
  }

  // ── Seating ── a last resort, tried only once the practical options are
  // exhausted. Not required yet is a real state, not a missing one.
  if (key === "seating" && !tested) {
    return { status: ADI_ROW_STATUS.LAST_RESORT, outcome: ADI_ROW_OUTCOME.NOT_REQUIRED_YET };
  }

  if (status === OPTIMISER_FAMILY_STATUS.FAILED || status === OPTIMISER_FAMILY_STATUS.INCOMPLETE) {
    return {
      status: ADI_ROW_STATUS.TESTED,
      outcome: shortPhrase(entry?.reason) || ADI_ROW_OUTCOME.EVALUATION_FAILED,
    };
  }

  if (!tested) {
    return {
      status: ADI_ROW_STATUS.NOT_TESTED,
      outcome: shortPhrase(entry?.reason) || ADI_ROW_OUTCOME.NOT_STARTED,
    };
  }

  return testedOutcome(entry, baseline);
}

/**
 * The eight ledger rows' status and outcome, read from the saved run evidence.
 *
 * @param {object} params
 * @param {Array|null} params.families - run.families from the saved plan/evidence
 * @param {object|null} [params.baseline] - the plan's baseline, for the verdict
 * @returns {Record<string, {status: string, outcome: string}>|null} null when the
 *   saved record carries no per-family evidence (older plans) — the caller then
 *   falls back to the plan's own lever rows.
 */
export function buildFamilyLedgerRows({ families = null, baseline = null } = {}) {
  if (!Array.isArray(families) || families.length === 0) return null;

  const rows = {};
  let recognised = 0;
  for (const key of Object.keys(ROW_FAMILY)) {
    const entry = familyOf(families, key);
    if (!entry) {
      rows[key] = null;
      continue;
    }
    recognised += 1;
    rows[key] = rowFor(key, entry, families, baseline);
  }
  return recognised > 0 ? rows : null;
}

/** The row keys this ledger can state, in the fixed least-intrusive order. */
export const ADI_LEDGER_FAMILY_KEYS = Object.freeze(
  OPTIMISER_FAMILY_SEQUENCE.filter((key) => !!ROW_FAMILY[key]),
);