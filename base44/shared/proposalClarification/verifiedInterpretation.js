/**
 * verifiedInterpretation.js (shared)
 * ----------------------------------
 * THE check run on a SAVED design interpretation before ADI reads a reason from
 * it or asks a question about it.
 *
 * WHY IT EXISTS. An interpretation is written once and saved with a proposal, so
 * a statement in it can fall behind the canonical frozen Project Report — most
 * often where a projection screen was assumed before the frozen evidence stated
 * a television, or where a bass outcome was asserted that the reports do not
 * publish. Genesis is the worked example: the saved interpretation says
 * "Projection" while the canonical frozen report says a 115" TV, and it records
 * a four-subwoofer intention that is not a proven seat-to-seat consistency.
 *
 * WHAT IT DOES. It reads the display identity, the published bass results and the
 * seat-consistency grade from the frozen evidence alone, and removes ONLY the
 * interpretation statements that contradict it. Every removal is recorded with
 * its reason. The rest of the interpretation stands: a valid, project-specific
 * reading is never discarded because one field is wrong.
 *
 * WHAT IT NEVER DOES. It states no figure, calculates nothing, grades nothing and
 * rewrites nothing: the frozen evidence is the authority, and where the two
 * disagree the interpretation statement goes, not the evidence. A design
 * intention is never turned into a measured result here — in particular, neither
 * four subwoofers nor any other arrangement becomes "bass is consistent across
 * the seats" unless the frozen P20 result supports it.
 *
 * Pure: no React, no SDK, no writes.
 */

import {
  DISPLAY_TYPE_PROJECTOR,
  canonicalDisplayType,
  readDisplayIdentity,
} from '../canonicalDisplayIdentity.js';
import { normaliseLevel } from '../adiNarrativeFacts.js';

/** Why one interpretation statement was removed. Every removal is a stated reason. */
export const INTERPRETATION_DROP_REASON = Object.freeze({
  SCREEN_ASSUMPTION: 'contradicts_the_frozen_tv_display_identity',
  DISPLAY_IDENTITY: 'contradicts_the_frozen_projection_display',
  SEAT_CONSISTENCY: 'claims_seat_to_seat_consistency_the_frozen_p20_result_does_not_support',
  PROVISIONAL_BASS: 'states_a_bass_outcome_the_frozen_evidence_does_not_publish',
});

const PROJECTION_WORD = /\b(?:acoustically\s+transparent|projection|projector|screen|behind\s+the\s+screen)\b/i;
const TV_WORD = /\b(?:tv|television)\b/i;
const SEAT_TO_SEAT = /\bseat[- ]to[- ]seat\b|\bconsistent across (?:all|every) seats\b|\bconsistency across (?:the )?seats\b/i;
const BASS_SUBJECT = /\b(?:bass|subwoofer|subs|low[- ]frequency|lfe)\b/i;
const BASS_OUTCOME = /\b(?:result|response|extension|output|reliable|achiev|deliver|measured|calculated|proven)\b/i;

/** The string statements of an interpretation, each with the field it came from. */
export function interpretationStatements(interpretation) {
  if (!interpretation || typeof interpretation !== 'object') return [];
  const out = [];
  const push = (field, value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text) out.push({ field, statement: text });
  };
  for (const [field, keys] of Object.entries({
    presentation: ['presentation'],
    intended_use: ['primary_design_intent', 'intended_use'],
    defining_feature: ['defining_feature'],
    seating_story: ['primary_seating_story', 'seating_story'],
    room_type: ['room_type'],
  })) {
    for (const key of keys) {
      if (interpretation[key]) {
        push(field, interpretation[key]);
        break;
      }
    }
  }
  for (const field of ['important_design_decisions', 'main_constraints']) {
    for (const entry of Array.isArray(interpretation[field]) ? interpretation[field] : []) {
      push(field, entry);
    }
  }
  for (const entry of Array.isArray(interpretation.strongest_areas) ? interpretation.strongest_areas : []) {
    const area = typeof entry?.area === 'string' ? entry.area.trim() : '';
    const evidence = typeof entry?.evidence === 'string' ? entry.evidence.trim() : '';
    push('strongest_areas', [area, evidence].filter(Boolean).join(': '));
  }
  const philosophy = interpretation.design_philosophy;
  if (philosophy && typeof philosophy === 'object') {
    push('design_philosophy', philosophy.why_appropriate);
  }
  return out.filter((entry) => entry.statement.length > 0);
}

/** Why one statement cannot stand against the frozen evidence, or null. */
function dropReason(statement, context) {
  const text = String(statement || '');
  if (!text) return null;
  if (context.isTv && PROJECTION_WORD.test(text)) return INTERPRETATION_DROP_REASON.SCREEN_ASSUMPTION;
  if (context.isProjection && TV_WORD.test(text)) return INTERPRETATION_DROP_REASON.DISPLAY_IDENTITY;
  if (!context.consistencySupported && SEAT_TO_SEAT.test(text)) return INTERPRETATION_DROP_REASON.SEAT_CONSISTENCY;
  if (!context.bassPublished && BASS_SUBJECT.test(text) && BASS_OUTCOME.test(text)) {
    return INTERPRETATION_DROP_REASON.PROVISIONAL_BASS;
  }
  return null;
}

/**
 * The verified interpretation material for one frozen version.
 *
 * @param {Object} input
 * @param {Object} input.snapshot — the canonical frozen Engineering Snapshot
 * @param {Object} input.facts — buildNarrativeFacts output for that snapshot
 * @param {Object} input.interpretation — the saved ADI interpretation
 * @returns {{ text: string, dropped: Array<{field, statement, reason}>, context: Object }}
 *   `text` is the statements that survive, which is the only material ADI reads a
 *   reason from. An empty `text` means no reason is on record for this version.
 */
export function verifiedInterpretation({ snapshot = null, facts = null, interpretation = null } = {}) {
  const display = readDisplayIdentity(snapshot?.room?.screen);
  const statedType = canonicalDisplayType(snapshot?.room?.screen?.display_type);
  // A projection is claimed only where the frozen snapshot states one: a display
  // whose type is unstated is never turned into a projector here.
  const isProjection = display.isTv === false && statedType === DISPLAY_TYPE_PROJECTOR;
  const p20Level = normaliseLevel(facts?.parameters?.p20?.level);
  const context = {
    isTv: display.isTv === true,
    isProjection,
    consistencySupported: p20Level === 'L3' || p20Level === 'L4',
    bassPublished: Boolean(facts?.parameters?.p18 || facts?.parameters?.p19 || facts?.parameters?.p20),
    tvPhrase: display.tvPhrase,
  };

  const dropped = [];
  const kept = [];
  for (const entry of interpretationStatements(interpretation)) {
    const reason = dropReason(entry.statement, context);
    if (reason) {
      dropped.push({ ...entry, reason });
      continue;
    }
    kept.push(entry.statement);
  }

  return { text: kept.join('\n'), dropped, context };
}

export default verifiedInterpretation;