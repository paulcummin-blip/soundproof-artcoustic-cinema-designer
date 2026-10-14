/**
 * narrativeRoles.js (base44/shared — CANONICAL)
 * ---------------------------------------------
 * THE ONE narrative role vocabulary: what a result may be to a proposal, and where
 * each role sits.
 *
 * It exists on its own so that every reader of the vocabulary — the narrative
 * priority authority, the seat-scope authority (P1 and P20) and the designer-facing
 * Expert View — shares one definition with no import cycle and no second list.
 *
 * THE ROLES, strongest first:
 *   Lead story          the design's headline performance result
 *   Worth mentioning    a positive result that is not the headline
 *   Design rationale    an important physical design DECISION the client and the
 *                       installer ask about (the seating clearance): it belongs in
 *                       the narrative and NOT in a performance headline
 *   Supporting evidence evidence that may be stated, never promoted
 *   Technical only      stated in the engineering evidence and nowhere else
 *   Do not discuss      the designer's own steer, which overrides everything
 *
 * INTERNAL ONLY. No role, rank or label is ever printed in a client document.
 *
 * Pure: no React, no SDK, no storage, no side effects, no weights of its own.
 */

export const NARRATIVE_PRIORITY = Object.freeze({
  LEAD_STORY: 'lead_story',
  WORTH_MENTIONING: 'worth_mentioning',
  DESIGN_RATIONALE: 'design_rationale',
  SUPPORTING_EVIDENCE: 'supporting_evidence',
  TECHNICAL_ONLY: 'technical_only',
  DO_NOT_DISCUSS: 'do_not_discuss',
});

/** Where each role sits, strongest first. */
export const PRIORITY_RANK = Object.freeze({
  [NARRATIVE_PRIORITY.DO_NOT_DISCUSS]: 0,
  [NARRATIVE_PRIORITY.TECHNICAL_ONLY]: 1,
  [NARRATIVE_PRIORITY.SUPPORTING_EVIDENCE]: 2,
  [NARRATIVE_PRIORITY.DESIGN_RATIONALE]: 3,
  [NARRATIVE_PRIORITY.WORTH_MENTIONING]: 4,
  [NARRATIVE_PRIORITY.LEAD_STORY]: 5,
});

/** What each role is called on the designer-facing Expert View. */
export const PRIORITY_LABEL = Object.freeze({
  [NARRATIVE_PRIORITY.LEAD_STORY]: 'Lead story',
  [NARRATIVE_PRIORITY.WORTH_MENTIONING]: 'Worth mentioning',
  [NARRATIVE_PRIORITY.DESIGN_RATIONALE]: 'Design rationale',
  [NARRATIVE_PRIORITY.SUPPORTING_EVIDENCE]: 'Supporting evidence',
  [NARRATIVE_PRIORITY.TECHNICAL_ONLY]: 'Technical only',
  [NARRATIVE_PRIORITY.DO_NOT_DISCUSS]: 'Do not discuss',
});

/**
 * Whether a role is a PERFORMANCE candidate — something a highlights page may
 * state as a strength. A design rationale is deliberately not one: it is explained
 * in the narrative, and it never takes a headline place from a real result.
 */
export const isNarrativeCandidate = (priority) => (PRIORITY_RANK[priority] ?? 0) >= PRIORITY_RANK[NARRATIVE_PRIORITY.WORTH_MENTIONING];

/** Whether a role may carry flagship language. Only a lead story may. */
export const mayUseFlagshipLanguage = (priority) => priority === NARRATIVE_PRIORITY.LEAD_STORY;

/** Whether a role may appear in the narrative at all. */
export const mayAppearInNarrative = (priority) => (PRIORITY_RANK[priority] ?? 0) > PRIORITY_RANK[NARRATIVE_PRIORITY.TECHNICAL_ONLY];

export default NARRATIVE_PRIORITY;