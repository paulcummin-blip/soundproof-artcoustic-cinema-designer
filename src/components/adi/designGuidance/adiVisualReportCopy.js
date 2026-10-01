// adiVisualReportCopy.js
// ---------------------------------------------------------------------------
// ARTCOUSTIC DESIGN INTELLIGENCE (ADI)
// The Visual Report's ADI Design Summary — copy builder.
//
// The Visual Report PRESENTS the selected design. It is not a design-debug
// document, so it states four things and nothing else:
//
//   Primary limitation   — what ADI identified (the canonical headline)
//   Current result       — the measured parameter and its level
//   Worst affected       — the canonical fact line, verbatim
//   Design interpretation— why the result is what it is
//   Next step            — use Bass Optimiser in the design workflow
//
// plus, only where an optimiser record exists, one status line.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO
// It never prints the engineering guidance: no "best first change", no
// "expected improvement", no re-placement or seating-move instruction, no
// projected P20 level. Those belong to the design workflow (Bass Optimiser,
// Engineer details) and to the Technical Report. Nothing here is offered as a
// design action unless the optimiser has already evaluated and applied it.
//
// This module produces TEXT ONLY. Every number and level it prints is copied
// from the canonical guidance it is given — it calculates nothing.
//
// PURE: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

import { ADI_FACTOR_KIND } from "./adiLimitingFactorRules";
import {
  OPTIMISER_LEVER_STATE,
  OPTIMISER_RECORD_KIND,
  OPTIMISER_TERMINAL_OUTCOME,
} from "@/components/room/bass/optimiserPlan/optimiserPlanConstants";

/** The one action the Visual Report ever names. */
export const ADI_VISUAL_NEXT_STEP =
  'Use Bass Optimiser in the design workflow to test practical improvement options before finalising the proposal.';

/** Stated when an optimiser result has been applied to this design. */
export const ADI_VISUAL_OPTIMISER_APPLIED =
  'Bass Optimiser has been applied to this design.';

/** Stated when the optimiser confirmed an option that has not been applied. */
export const ADI_VISUAL_OPTIMISER_AVAILABLE =
  'Bass Optimiser has evaluated this design and confirmed an option worth applying. The recommendation and its engineering detail are in the Bass Optimiser panel.';

/** Stated when the optimiser found nothing worth applying. */
export const ADI_VISUAL_OPTIMISER_NO_IMPROVEMENT =
  'Bass Optimiser did not confirm a practical change worth applying. Low-frequency treatment or seating/subwoofer layout changes may be considered during detailed design.';

/**
 * Why the result is what it is, per limiting factor. Written as an
 * interpretation of the design, never as an instruction to change it.
 */
const INTERPRETATION = Object.freeze({
  [ADI_FACTOR_KIND.BASS_CONSISTENCY]:
    'The current design delivers strong bass output and reference-seat performance, but the response varies across the seating area below the transition frequency. This is a room-and-seat interaction, not a loudspeaker output limit.',
  [ADI_FACTOR_KIND.BASS_RESPONSE]:
    'The reference-seat response is set by how the room behaves below the transition frequency at that position, rather than by the loudspeaker. It is a room and system interaction.',
  [ADI_FACTOR_KIND.CAPABILITY]:
    'The achievable output is set by the speaker and amplifier combination at the listening distance, so this is a system capability limit rather than a room interaction.',
  [ADI_FACTOR_KIND.ROW_COLLAPSE]:
    'The listening area is deeper than the layout serves evenly, so each row sees a slightly different result. This is a seating and geometry interaction.',
  [ADI_FACTOR_KIND.INCOMPLETE]:
    'ADI holds its conclusion until the outstanding results publish, so the design is not judged on provisional numbers.',
  [ADI_FACTOR_KIND.BALANCED]:
    'No single result is holding the design back; the remaining differences between parameters are refinements rather than constraints.',
});

const DEFAULT_INTERPRETATION =
  'This result is set by the interaction between the room, the seating and the system rather than by any one component.';

const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** "P20 L1 — worst-seat deviation ±1.2 dB…" → the fact after the prefix. */
function factAfterPrefix(line, prefix) {
  const value = text(line);
  if (!value) return null;
  if (!prefix) return value;
  const stripped = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  return stripped.replace(/^\s*[—-]\s*/, "").trim() || null;
}

/** The canonical parameter + level, e.g. "P20: L1". */
function currentResultLine(guidance) {
  const number = guidance?.parameterNumber;
  const level = guidance?.level;
  if (number == null && !level) return "Not calculated yet";
  if (number == null) return `${level}`;
  return `P${number}: ${level || "not calculated"}`;
}

/**
 * The optimiser status line, or null when no evaluated result exists.
 * Reads the persisted record's own vocabulary — it never infers a result.
 */
export function resolveOptimiserStatusLine(record) {
  if (!record || typeof record !== "object") return null;

  if (record.terminalOutcome === OPTIMISER_TERMINAL_OUTCOME.NO_USEFUL_IMPROVEMENT) {
    return ADI_VISUAL_OPTIMISER_NO_IMPROVEMENT;
  }

  const appliedStates = Object.values(record.applied || {});
  if (appliedStates.includes(OPTIMISER_LEVER_STATE.APPLIED)) {
    return ADI_VISUAL_OPTIMISER_APPLIED;
  }

  if (record.recordKind === OPTIMISER_RECORD_KIND.PLAN) {
    return ADI_VISUAL_OPTIMISER_AVAILABLE;
  }

  return null;
}

/**
 * Build the Visual Report ADI Design Summary.
 *
 * @param {Object} params
 * @param {Object|null} params.guidance        — buildAdiDesignGuidance output
 * @param {Object|null} [params.optimiserRecord] — persisted optimiser record
 * @returns {Object|null} summary, or null when there is no guidance
 */
export function buildAdiVisualReportSummary({ guidance, optimiserRecord = null } = {}) {
  if (!guidance?.available) return null;

  const limitation = text(guidance.headline) || text(guidance.area);
  if (!limitation) return null;

  const prefix = guidance.parameterNumber != null
    ? `P${guidance.parameterNumber}${guidance.level ? ` ${guidance.level}` : ""}`
    : null;

  return {
    heading: "ADI Design Summary",
    primaryLimitation: limitation,
    currentResult: currentResultLine(guidance),
    worstAffected: factAfterPrefix(guidance.evidenceLines?.[0], prefix),
    interpretation: INTERPRETATION[guidance.kind] || DEFAULT_INTERPRETATION,
    nextStep: ADI_VISUAL_NEXT_STEP,
    optimiserStatus: resolveOptimiserStatusLine(optimiserRecord),
  };
}

export default buildAdiVisualReportSummary;