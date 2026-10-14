/**
 * narrativePillarLeadAuthority.js (base44/shared — CANONICAL)
 * -----------------------------------------------------------
 * TWO LEVELS OF IMPORTANCE, NEVER ONE.
 *
 * 1 · GLOBAL NARRATIVE PRIORITY — how much space a subject gets in the proposal
 *     overall. That is decided in narrativePriorityAuthority.js (ASDR weight, brief
 *     relevance, the designer's steer) and travels as the pillar's own role.
 *
 * 2 · PILLAR EVIDENCE PRIORITY — which result leads each of the three pillars. That
 *     is decided here, from the results the pillar itself holds: within a pillar the
 *     strongest result that may be told at all leads it, and it is written in the
 *     strong language its own achieved result has earned.
 *
 * WHY THE TWO ARE SEPARATE. Marquee Home carries heavier bass evidence, so Dynamic
 * Range is the dominant overall story — but P16 and P17 are both L4 and are the
 * strongest evidence beneath Timbre Matching, so they lead that pillar in its own
 * right. A whole pillar is never demoted because another pillar's evidence is
 * heavier, and a pillar's lead evidence never makes that pillar the dominant story
 * of the proposal: the space follows the global priority, the language follows the
 * pillar's own lead.
 *
 * WHAT IT READS. The classified members of one pillar (level, emphasis, seat scope),
 * as narrativePillarGrouping.js already reads them, plus the approved register in
 * performanceLanguageAuthority.js for the language a result has earned. Every result
 * tied at the pillar's strongest level is lead evidence, so two equally strong tonal
 * results lead Timbre Matching together. Evidence that may not be told at all — a
 * context result, or one the designer steered out — never leads a pillar.
 *
 * WHAT IT NEVER DOES. No figure, level or scope is changed, averaged or invented: the
 * clause handed over is the register's own clause at the member's own published
 * result, and a member with no register area simply contributes none.
 *
 * Pure: no React, no SDK, no storage, no recalculation, no side effects.
 */

import { levelRank } from './strengthImportance.js';
import { performancePhrase, performanceSentence } from './performanceLanguageAuthority.js';
import { PARAMETER_PHRASE_AREA } from './narrativePriorityAuthority.js';
import { EVIDENCE_EMPHASIS, PILLAR_LEAD_RULE } from './narrativePillars.js';
import { SEAT_SCOPE } from './seatScopeNarrativeAuthority.js';

/** The generation of this authority, so a draft is traceable to the rule it was written under. */
export const PILLAR_LEAD_VERSION = 1;

/** The emphases that may be told at all: a context or excluded result never leads. */
const TELLABLE = Object.freeze([
  EVIDENCE_EMPHASIS.LEAD,
  EVIDENCE_EMPHASIS.SUPPORTING,
  EVIDENCE_EMPHASIS.CONTRIBUTING,
]);

/**
 * The result a leading member states. A consistency result scoped to the primary
 * seats states the PRIMARY seats' own result, never the weakest seat in the room.
 */
export function partLevel(row) {
  if (row?.seat_scope === SEAT_SCOPE.PRIMARY && row.primary_seat_result) return row.primary_seat_result;
  return row?.level ?? null;
}

/** The clause a member's own published result has earned, from the register, or null. */
function clauseOf(member) {
  const area = PARAMETER_PHRASE_AREA[member.key];
  if (!area) return null;
  return performancePhrase(area, partLevel(member)) || null;
}

/** The register's sentence form behind that clause, which names the seating, or null. */
function sentenceOf(member) {
  const area = PARAMETER_PHRASE_AREA[member.key];
  if (!area) return null;
  return performanceSentence(area, partLevel(member)) || null;
}

/**
 * ONE PILLAR'S LEAD EVIDENCE, read from the pillar's own ordered members.
 *
 * ONLY A CARRYING RESULT LEADS A PILLAR. Where the pillar names its carrying
 * parameters, the lead is read from those alone: the bass control and consistency
 * readings qualify the story the system's own capability tells, so they are told
 * inside it and never become its headline. Dynamic Range therefore stays the whole
 * system's story — the front stage, the surrounds and the bass output and depth —
 * instead of collapsing into a story about the subwoofers.
 *
 * @param {Array<Object>} ordered — the pillar's members, strongest first
 * @param {Array<string>} [carryingKeys] — the pillar's carrying parameters; when
 *   given, only these may lead it (a qualifier still tells, it never leads)
 * @returns {{ids: Array<string>, level: string|null, clauses: Array<string>,
 *   sentences: Array<string>, members: Array<Object>, rule: string}}
 */
export function pillarLeadEvidence(ordered = [], carryingKeys = null) {
  const list = Array.isArray(ordered) ? ordered : [];
  const carrying = Array.isArray(carryingKeys) && carryingKeys.length > 0
    ? list.filter((member) => carryingKeys.includes(String(member?.key)))
    : list;
  const eligible = carrying.filter((member) => (
    member?.level != null && TELLABLE.includes(member.emphasis)
  ));
  if (eligible.length === 0) {
    return { ids: [], level: null, clauses: [], sentences: [], members: [], rule: PILLAR_LEAD_RULE };
  }
  const best = eligible.reduce((acc, member) => (
    (levelRank(member.level) ?? 0) > (levelRank(acc.level) ?? 0) ? member : acc
  ), eligible[0]);
  const members = eligible.filter((member) => levelRank(member.level) === levelRank(best.level));
  return {
    ids: members.map((member) => String(member.key).toUpperCase()),
    level: best.level,
    clauses: [...new Set(members.map(clauseOf).filter(Boolean))],
    sentences: [...new Set(members.map(sentenceOf).filter(Boolean))],
    members,
    rule: PILLAR_LEAD_RULE,
  };
}

/**
 * What the pillar's own evidence decides about language, stated for the writer beside
 * the instruction that decides its space. The two never override one another.
 */
export function leadNoteOf(leads, roleLabel = null) {
  const label = roleLabel || 'Technical evidence';
  if (!leads || leads.ids.length === 0) {
    return 'No result beneath this pillar is strong enough to lead it: state what the evidence genuinely supports, in plain client language, and keep it brief.';
  }
  const level = leads.level ? ` at ${leads.level}` : '';
  return `THIS PILLAR'S LEAD EVIDENCE IS ${leads.ids.join(', ')}${level}: tell it as this pillar's own lead, in the strongest language its achieved result has earned, and keep the pillar's length in proportion to its overall place in the story (its global narrative role is "${label}"). A pillar is never demoted because another pillar's evidence is heavier, and this pillar's lead evidence never makes this pillar the dominant story of the whole proposal.`;
}

/** Anything that narrates the seating layout, for the case the seating is ruled out. */
const SEAT_NARRATION_PATTERN = /\bseats?\b|\bseating\b|\brows?\b|listening positions?|reference position|primary or secondary/i;

/**
 * Pillar wording with any seating narration removed. Used only where the designer has
 * ruled the seating out of the narrative: the evidence itself is untouched.
 */
export function withoutSeatNarration(lines) {
  return (Array.isArray(lines) ? lines : []).filter((line) => !SEAT_NARRATION_PATTERN.test(String(line)));
}

export default pillarLeadEvidence;