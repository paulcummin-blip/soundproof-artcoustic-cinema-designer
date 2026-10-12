/**
 * writerInterpretationEvidenceCheck.js (shared)
 * ---------------------------------------------
 * THE check between the saved ADI interpretation and the frozen evidence it
 * describes, run before that interpretation is handed to the writer.
 *
 * WHY IT EXISTS. The interpretation is Stage 1's reading of the design: what the
 * room is, what the design intends, where it is strongest. It is written once and
 * saved with the proposal, so a field in it can fall behind the frozen evidence —
 * most often where an assumption (a projection screen, a bass outcome) was written
 * before the evidence stated otherwise.
 *
 * WHAT IT DOES. It compares the interpretation's own statements against the frozen
 * pack and removes ONLY the statements that contradict it, recording each removal
 * as a correction. The rest of the interpretation is kept: a valid, project-specific
 * reading is never discarded because one field is wrong, and the frozen evidence is
 * never rewritten, softened or filled in.
 *
 * WHAT IT NEVER DOES. It states no figure, calculates nothing and decides no
 * level: the frozen evidence is the authority, and where the two disagree the
 * interpretation field goes, not the evidence.
 *
 * Pure: no React, no SDK, no writes, no runtime-specific APIs.
 */

import {
  DISPLAY_TYPE_TV,
  canonicalDisplayType,
} from '../canonicalDisplayIdentity.js';
import { seatConsistencyClaim } from './writerOutputTextRules.js';

/** Why one interpretation statement was removed. Every removal is a stated reason. */
export const INTERPRETATION_CORRECTION_REASON = Object.freeze({
  DISPLAY_IDENTITY: 'contradicts_the_frozen_display_identity',
  SCREEN_ASSUMPTION: 'assumes_a_projection_screen_the_frozen_evidence_does_not_state',
  SEAT_CONSISTENCY: 'states_a_seat_to_seat_outcome_the_frozen_evidence_does_not_support',
  PROVISIONAL_BASS: 'states_a_published_bass_result_the_frozen_evidence_does_not_carry',
});

/** The one rule that governs a corrected interpretation. */
export const CORRECTION_RULE =
  'these statements contradicted the frozen evidence and were removed: they are never written, '
  + 'the rest of the interpretation stands, and the frozen evidence itself is unchanged';

/** A TV has no projection screen, so this wording cannot describe a TV design. */
const SCREEN_ASSUMPTION =
  /\b(?:acoustically\s+transparent|projection\s+screen|projector|screen\s+wall|behind\s+the\s+screen)\b/i;
/** The words that name a projection rather than a television. */
const PROJECTION_WORD = /\b(?:projection|projector|screen)\b/i;
const TV_WORD = /\b(?:tv|television)\b/i;
/** A statement about the low-frequency result rather than about the design intent. */
const BASS_SUBJECT = /\b(?:bass|subwoofer|subs|low[- ]frequency|lfe)\b/i;
const BASS_OUTCOME = /\b(?:result|response|extension|output|reliable|achiev|deliver|measured|calculated)\b/i;
const SEAT_TO_SEAT = /\bseat[- ]to[- ]seat\b/i;

/**
 * The frozen display identity of every option, read from the pack's own screen
 * fact. The identity is never inferred from a size, a width or an aspect ratio:
 * a value that names neither a TV nor a screen reads as a projection screen,
 * exactly as the canonical display authority reads it.
 *
 * @returns {Array<{version_id, version_name, display_type, is_tv, screen_type}>}
 */
export function frozenDisplayIdentities(pack) {
  return (Array.isArray(pack?.options) ? pack.options : []).map((option) => {
    const screen = option?.facts?.screen || {};
    const stated = canonicalDisplayType(screen?.screen_type) || canonicalDisplayType(screen?.display_type);
    const isTv = stated === DISPLAY_TYPE_TV || (!stated && TV_WORD.test(String(screen?.screen_type || '')));
    return {
      version_id: option?.version_id ?? null,
      version_name: option?.version_name ?? null,
      display_type: isTv ? DISPLAY_TYPE_TV : (stated || null),
      is_tv: isTv,
      screen_type: screen?.screen_type ?? null,
    };
  });
}

/**
 * Whether the pack publishes a bass result for every option. A design whose basin
 * evidence is not published carries a provisional bass reading, which is never
 * stated as a result the design achieves.
 */
export function bassPublishedForEveryOption(pack) {
  const options = Array.isArray(pack?.options) ? pack.options : [];
  if (options.length === 0) return false;
  return options.every((option) => option?.facts?.bass?.available === true);
}

/**
 * Whether the pack's own evidence supports a WHOLE-SEAT bass consistency claim.
 *
 * Only a P20 claim the evidence states at every seat and grades L3 or L4 supports
 * one. A result stated for one seating group is a different, narrower claim, and
 * no claim at all supports nothing: weak or absent P20 evidence never becomes
 * "bass is consistent across all seats".
 */
export function supportsWholeSeatBassConsistency(pack) {
  const allowed = Array.isArray(pack?.allowed_claims) ? pack.allowed_claims : [];
  return allowed.some((claim) => {
    const id = String(claim?.claim_id || '');
    const area = String(claim?.area || '').toLowerCase();
    if (!/p20/i.test(id) && area !== 'p20') return false;
    const scope = String(claim?.scope || 'all').toLowerCase();
    if (scope !== 'all') return false;
    const levels = Array.isArray(claim?.basis?.levels) ? claim.basis.levels : [];
    return levels.some((level) => /^L[34]$/.test(String(level)));
  });
}

/** Why one statement cannot stand against the frozen evidence, or null. */
function statementReason(text, { isTv, bassProvisional, consistencySupported }) {
  const value = String(text || '');
  if (value.length === 0) return null;
  if (isTv && SCREEN_ASSUMPTION.test(value)) return INTERPRETATION_CORRECTION_REASON.SCREEN_ASSUMPTION;
  if (!consistencySupported && (seatConsistencyClaim(value) || SEAT_TO_SEAT.test(value))) {
    return INTERPRETATION_CORRECTION_REASON.SEAT_CONSISTENCY;
  }
  if (bassProvisional && BASS_SUBJECT.test(value) && BASS_OUTCOME.test(value)) {
    return INTERPRETATION_CORRECTION_REASON.PROVISIONAL_BASS;
  }
  return null;
}

/** Every statement the frozen evidence does not support, and why. */
export function interpretationCorrections(view, context) {
  const corrections = [];
  if (!view || typeof view !== 'object') return corrections;

  const presentation = String(view.presentation || '');
  if (presentation) {
    if (context.isTv && PROJECTION_WORD.test(presentation)) {
      corrections.push({ field: 'presentation', statement: presentation, reason: INTERPRETATION_CORRECTION_REASON.SCREEN_ASSUMPTION });
    } else if (!context.isTv && context.displayStated && TV_WORD.test(presentation)) {
      corrections.push({ field: 'presentation', statement: presentation, reason: INTERPRETATION_CORRECTION_REASON.DISPLAY_IDENTITY });
    }
  }

  for (const field of ['intended_use', 'defining_feature', 'seating_story', 'room_type']) {
    const reason = statementReason(view[field], context);
    if (reason) corrections.push({ field, statement: String(view[field]), reason });
  }
  for (const field of ['design_decisions', 'constraints']) {
    for (const entry of Array.isArray(view[field]) ? view[field] : []) {
      const reason = statementReason(entry, context);
      if (reason) corrections.push({ field, statement: String(entry), reason });
    }
  }
  for (const entry of Array.isArray(view.strongest_areas) ? view.strongest_areas : []) {
    const reason = statementReason(entry?.evidence, context) || statementReason(entry?.area, context);
    if (reason) corrections.push({ field: 'strongest_areas', statement: `${entry?.area || ''}: ${entry?.evidence || ''}`.trim(), reason });
  }
  // The design philosophy records the reasoning behind the design, so its own
  // statements are held to exactly the same check: a reason that contradicts the
  // frozen evidence is removed rather than handed to the writer. No new rule is
  // introduced and no acceptance is loosened.
  const philosophy = view.design_philosophy;
  if (philosophy && typeof philosophy === 'object') {
    const reason = statementReason(philosophy.why_appropriate, context);
    if (reason) {
      corrections.push({
        field: 'design_philosophy.why_appropriate',
        statement: String(philosophy.why_appropriate),
        reason,
      });
    }
  }
  return corrections;
}

/**
 * The interpretation view with every unsupported statement removed, and the
 * removals recorded.
 *
 * @param {Object} input
 * @param {Object} input.view — the writer-facing interpretation view
 * @param {Object} input.pack — the frozen evidence pack it describes
 * @returns {{ view: Object, corrections: Array<Object>, context: Object }}
 */
export function checkInterpretationAgainstEvidence({ view = null, pack = null } = {}) {
  if (!view || typeof view !== 'object') return { view: view ?? null, corrections: [], context: null };

  const displays = frozenDisplayIdentities(pack);
  const context = {
    isTv: displays.length > 0 && displays.every((entry) => entry.is_tv),
    displayStated: displays.some((entry) => entry.screen_type !== null && entry.screen_type !== undefined),
    bassProvisional: !bassPublishedForEveryOption(pack),
    consistencySupported: supportsWholeSeatBassConsistency(pack),
  };

  const corrections = interpretationCorrections(view, context);
  const corrected = new Set(corrections.map((entry) => `${entry.field}::${entry.statement}`));
  const keep = (field, value) => (corrected.has(`${field}::${String(value)}`) ? null : value);
  const keepList = (field, list) => (Array.isArray(list) ? list : [])
    .filter((entry) => !corrected.has(`${field}::${String(entry)}`));

  const next = {
    ...view,
    presentation: keep('presentation', view.presentation),
    intended_use: keep('intended_use', view.intended_use),
    defining_feature: keep('defining_feature', view.defining_feature),
    seating_story: keep('seating_story', view.seating_story),
    room_type: keep('room_type', view.room_type),
    design_decisions: keepList('design_decisions', view.design_decisions),
    constraints: keepList('constraints', view.constraints),
    strongest_areas: (Array.isArray(view.strongest_areas) ? view.strongest_areas : [])
      .filter((entry) => !corrected.has(`strongest_areas::${`${entry?.area || ''}: ${entry?.evidence || ''}`.trim()}`)),
    design_philosophy: view.design_philosophy && typeof view.design_philosophy === 'object'
      ? {
        ...view.design_philosophy,
        why_appropriate: keep('design_philosophy.why_appropriate', view.design_philosophy.why_appropriate),
      }
      : (view.design_philosophy ?? null),
  };

  return { view: next, corrections, context };
}

export default checkInterpretationAgainstEvidence;