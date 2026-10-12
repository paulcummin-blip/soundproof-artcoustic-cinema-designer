/**
 * writerEvidenceClasses.js (shared)
 * ---------------------------------
 * WHAT KIND OF STATEMENT the writer may make from each part of the evidence pack.
 *
 * The pack is not one thing. It is the design as it is built, the results the
 * frozen reports state, the designer's own intentions, and — by their absence —
 * everything the evidence does not state at all. A writer that treats these as one
 * body of facts will write an intention as an achievement and an unstated outcome
 * as a result, so this module keeps them apart and says plainly which is which.
 *
 * THE FIVE CLASSES
 *   confirmed design fact   the design as built: room, display, seating, system.
 *                           Stated as what the design IS.
 *   supported result        a frozen report's own graded result, carried as an
 *                           allowed claim. The only class a performance benefit
 *                           may be claimed from.
 *   designer intention      what the designer set out to do (the brief, the
 *                           interpretation's decisions). Never an achievement.
 *   prediction              what the design is expected to do. The evidence does
 *                           not state it, so it is never written as done.
 *   unknown or unsupported  what no source states — the blocked claims and the
 *                           interpretation's own excluded evidence. Never written.
 *
 * BASS. P19 is read at the reference position only, and a bass reading that the
 * frozen reports do not publish is provisional: it supports no positive
 * performance claim at all, and only a whole-seat, positively-graded P20 result
 * supports a seat-to-seat consistency claim.
 *
 * Pure: no React, no SDK, no writes, no runtime-specific APIs.
 */

import {
  bassPublishedForEveryOption,
  supportsWholeSeatBassConsistency,
} from './writerInterpretationEvidenceCheck.js';

/** The five classes of statement, and what each one may be used for. */
export const EVIDENCE_CLASS = Object.freeze({
  CONFIRMED_DESIGN_FACT: 'confirmed_design_fact',
  SUPPORTED_RESULT: 'supported_engineering_result',
  DESIGNER_INTENTION: 'designer_intention',
  PREDICTION: 'prediction',
  UNKNOWN_OR_UNSUPPORTED: 'unknown_or_unsupported',
});

/** What each class is, in the writer's own terms. */
export const EVIDENCE_CLASS_RULE = Object.freeze({
  [EVIDENCE_CLASS.CONFIRMED_DESIGN_FACT]:
    'the design as it is built (evidence_pack.options[].facts: room, display, seating, system): state it as what the design is',
  [EVIDENCE_CLASS.SUPPORTED_RESULT]:
    'a graded result the frozen reports state, carried as an allowed claim: the only source of a performance benefit',
  [EVIDENCE_CLASS.DESIGNER_INTENTION]:
    'what the designer set out to do (editorial_brief, design_interpretation.design_decisions): an intention, never an achieved outcome',
  [EVIDENCE_CLASS.PREDICTION]:
    'what the design is expected to do before it is built: never written as a result the design has delivered',
  [EVIDENCE_CLASS.UNKNOWN_OR_UNSUPPORTED]:
    'what no source states (blocked_claims, design_interpretation.unknown_or_unsupported): never written, in any wording',
});

/** The bass evidence of one option, and what it may support. */
export function bassEvidenceForOption(option, { consistencySupported = false } = {}) {
  const bass = option?.facts?.bass || {};
  const published = bass.available === true;
  return {
    version_id: option?.version_id ?? null,
    version_name: option?.version_name ?? null,
    status: published ? 'published' : 'provisional',
    // P19 is the reference-position response: stateable only from a published result.
    p19_permitted: published,
    // P14 output and P18 extension are published results of their own.
    p14_p18_permitted: published,
    // A seat-to-seat claim needs the pack's own whole-seat, positively-graded P20 result.
    whole_seat_consistency_permitted: published && consistencySupported,
    note: published
      ? 'the frozen reports publish the bass result: each bass benefit cites its own allowed claim'
      : 'no published bass result stands behind this design: no positive bass performance claim is made, and the reference-position response stays provisional',
  };
}

/**
 * The evidence classification of one frozen pack: which part of it may be used for
 * what, and what the bass evidence of each option supports.
 *
 * @param {Object} pack — the frozen proposal evidence pack
 * @returns {Object} the classification block the writer input carries
 */
export function buildEvidenceClassification(pack) {
  const options = Array.isArray(pack?.options) ? pack.options : [];
  const consistencySupported = supportsWholeSeatBassConsistency(pack);
  const bassPublished = bassPublishedForEveryOption(pack);
  const allowed = Array.isArray(pack?.allowed_claims) ? pack.allowed_claims : [];
  const blocked = Array.isArray(pack?.blocked_claims) ? pack.blocked_claims : [];

  return {
    rule: 'keep these classes apart: a design fact is stated as what the design is, a supported result is the only source of a '
      + 'performance benefit, a designer intention is never an achievement, a prediction is never written as done, and an '
      + 'unknown or unsupported outcome is never written at all',
    classes: { ...EVIDENCE_CLASS_RULE },
    counts: {
      confirmed_design_facts: options.length,
      supported_results: allowed.length,
      unknown_or_unsupported: blocked.length,
    },
    bass: {
      status: bassPublished ? 'published' : 'provisional',
      whole_seat_consistency_supported: consistencySupported,
      rule: 'P19 is stated at the reference seating position only; a claimed seat-to-seat bass consistency needs the pack\'s own '
        + 'whole-seat positively-graded P20 result, and weak or absent P20 evidence never supports one',
      options: options.map((option) => bassEvidenceForOption(option, { consistencySupported })),
    },
  };
}

export default buildEvidenceClassification;