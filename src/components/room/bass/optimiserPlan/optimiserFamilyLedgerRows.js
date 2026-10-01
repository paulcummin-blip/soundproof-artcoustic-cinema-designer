// optimiserFamilyLedgerRows.js
// ---------------------------------------------------------------------------
// The "What ADI tested" ledger rows, built from the SAVED RUN EVIDENCE.
//
// Product rule this exists to satisfy: ADI either tested the lever, is testing
// it, or clearly says the capability is not yet supported. A family the run
// evaluated is NEVER shown as "Not tested", "Not evaluated" or "Not available",
// and a tested family always states what its best attempt did.
//
// Vocabulary (fixed):
//   Waiting · Testing · Tested · Recommended · Trade-off · Rejected ·
//   No useful improvement · Not yet supported
//
// The evidence is the per-family ledger the completed run already wrote
// (run.families — see optimiserRunFamilies.js). This module reads it, applies
// the designer-facing vocabulary and returns one row per family.
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
  /** The engine genuinely cannot evaluate this family. */
  NOT_YET_SUPPORTED: "Not yet supported",
  /** Supported, but not evaluated by THIS run — said plainly, never as "Not tested". */
  NOT_YET_SUPPORTED_IN_RUN: "Not yet supported in this run",
  APPLIED: "Applied",
});

/**
 * The designer-facing outcome phrases. A family that was evaluated states what
 * its best attempt did; a family that was not states why.
 */
export const ADI_ROW_OUTCOME = Object.freeze({
  NO_USEFUL: "No useful improvement",
  NO_SAFE_STANDALONE: "No safe standalone result",
  WORSENS: "Worsens the result",
  TRADE_OFF: "Improves one measure, worsens another",
  IMPROVES_NOT_OFFERED: "Improvement found — not offered for application",
  NO_BETTER_LAYOUT: "No better layout found",
  /** Stated for the crossover region — a capability the model does not have. */
  PHASE_NOT_MODELLED:
    "Crossover-region phase between the main speakers and subwoofers is not currently modelled",
  /** Stated for the subwoofer model / quantity family. */
  COMPARE_SEPARATELY: "Compare subwoofer models separately",
  /** Stated for a family the run did not search. */
  NOT_SEARCHED_IN_RUN: "This search did not run in this evaluation",
  /** Stated for seating the run did not need to search. */
  SEATING_LAST_RESORT:
    "Seating changes are a last resort, tried only when the practical options cannot resolve the issue",
  /** Stated for a polarity / phase evaluation with no standalone result. */
  NO_STANDALONE_SEARCH: "No standalone search — evaluated inside the combined candidate",
  EVALUATION_FAILED: "The evaluation did not complete",
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

/**
 * A run-level statement about the current baseline is never a lever's reason:
 * if the card can show the current P20 result, the run had a baseline. Such a
 * record belongs in Engineer details, not beside a lever name.
 */
function isBaselineStatement(text) {
  return /baseline|could not be validated/i.test(String(text || ""));
}

/** One short phrase at most — the ledger never shows a paragraph. */
function shortPhrase(text, maxLength = 72) {
  if (typeof text !== "string" || !text.trim()) return null;
  const first = text.trim().split(/(?<=\.)\s/)[0].trim();
  return first.length <= maxLength ? first : `${first.slice(0, maxLength - 1).trimEnd()}…`;
}

/** The run's own recorded reason, when it is about this family. */
function familyReason(entry) {
  const reason = shortPhrase(entry?.reason);
  return reason && !isBaselineStatement(reason) ? reason : null;
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

/** Supported, but this run did not search it. */
function notSearchedInRun(outcome = null) {
  return {
    status: ADI_ROW_STATUS.NOT_YET_SUPPORTED_IN_RUN,
    outcome: outcome || ADI_ROW_OUTCOME.NOT_SEARCHED_IN_RUN,
  };
}

/**
 * What a family's best evaluated attempt did to the limiting result, in the
 * designer vocabulary. Read from the same verdict authority the Engineer
 * details block uses, so the summary row and the detail can never disagree.
 */
function testedOutcome(entry, baseline) {
  const attempt = entry?.bestAttempt || null;
  // A tested family always retains a result summary. When the run kept no
  // attempt value, the honest summary is that nothing useful came of it.
  if (!attempt) {
    return { status: ADI_ROW_STATUS.TESTED, outcome: ADI_ROW_OUTCOME.NO_USEFUL };
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
    return { status: ADI_ROW_STATUS.TESTED, outcome: familyReason(entry) || ADI_ROW_OUTCOME.NO_USEFUL };
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

  // ── Phase / crossover-region alignment ── the model decides, not the run:
  // the engine's phase search is subwoofer-only, so the crossover region is not
  // evaluated at all. Stated as a capability the model does not have.
  if (key === "phase") {
    const region = entry?.crossoverRegion || null;
    const regionEvaluated = region?.supported === true && region?.evaluated === true;
    if (!regionEvaluated) {
      return {
        status: ADI_ROW_STATUS.NOT_YET_SUPPORTED,
        outcome: ADI_ROW_OUTCOME.PHASE_NOT_MODELLED,
      };
    }
  }

  // ── Polarity ── explored inside the grouped phase search and the combined
  // candidate. It is evaluated, but there is no standalone result to apply.
  if (key === "polarity") {
    if (status === OPTIMISER_FAMILY_STATUS.FAILED || status === OPTIMISER_FAMILY_STATUS.INCOMPLETE) {
      return {
        status: ADI_ROW_STATUS.TESTED,
        outcome: familyReason(entry) || ADI_ROW_OUTCOME.EVALUATION_FAILED,
      };
    }
    const evaluated = tested || Number(entry?.candidatesEvaluated) > 0;
    return evaluated
      ? { status: ADI_ROW_STATUS.TESTED, outcome: ADI_ROW_OUTCOME.NO_SAFE_STANDALONE }
      : { status: ADI_ROW_STATUS.NOT_YET_SUPPORTED, outcome: ADI_ROW_OUTCOME.NO_STANDALONE_SEARCH };
  }

  // ── Subwoofer option ── never a searched lever: a design decision.
  if (key === "subwoofer_option") {
    return {
      status: ADI_ROW_STATUS.NOT_YET_SUPPORTED_IN_RUN,
      outcome: ADI_ROW_OUTCOME.COMPARE_SEPARATELY,
    };
  }

  // ── Layout ── searched inside the placement pool, so it reports what that
  // search found. When the placement search itself never ran, that is said.
  if (key === "layout") {
    if (wasTested(placementEntry(families))) {
      return { status: ADI_ROW_STATUS.TESTED, outcome: ADI_ROW_OUTCOME.NO_BETTER_LAYOUT };
    }
    return notSearchedInRun(familyReason(entry));
  }

  // ── Seating ── the last resort, tried only once the practical options are
  // exhausted, so an untouched seating search is a policy state, not a gap.
  if (key === "seating" && !tested) {
    return notSearchedInRun(ADI_ROW_OUTCOME.SEATING_LAST_RESORT);
  }

  if (status === OPTIMISER_FAMILY_STATUS.FAILED || status === OPTIMISER_FAMILY_STATUS.INCOMPLETE) {
    return {
      status: ADI_ROW_STATUS.TESTED,
      outcome: familyReason(entry) || ADI_ROW_OUTCOME.EVALUATION_FAILED,
    };
  }

  if (!tested) return notSearchedInRun(familyReason(entry));

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