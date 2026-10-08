/**
 * writerOutputTextRules.js (shared)
 * ----------------------------------
 * The rules that read a draft's prose, section by section, against the pack the
 * writer was given. Four things are checked here, and each of them answers one
 * question about a sentence or a figure:
 *
 *   GROUNDING   is this claim supported by the claim IDs the section cites?
 *   FIGURES     is this figure, level or product one the pack states?
 *   BLOCKED     does this sentence claim a change or an improvement in an area
 *               the pack blocks as unchanged, or recommend where no
 *               recommendation is allowed? A head that is modifying a capability
 *               noun — "screen headroom", "screen, surround and height headroom"
 *               — is Dynamic Range language (P12/P13), not a claim that the area
 *               itself changed, so it is not read as one. A head that names its
 *               area itself — "a larger screen", "the screen is wider" — is read
 *               exactly as before.
 *   BASS        does this sentence claim the seat-to-seat bass consistency the
 *               P20 result does not support? Read in two passes: the pack's own
 *               prohibited phrasings, over the whole text, and the seat-to-seat
 *               claims a client reads as "there are no weak seats", sentence by
 *               sentence. Consistency named as an open item, and a claim that is
 *               denied, are not claims.
 *   SCOPE       is the seating scope this sentence names — the primary seats, the
 *               secondary seats, or the seating area — one the pack states a
 *               result for, at the level the sentence's own adjective claims? A
 *               result the evidence states for one group is never written as a
 *               result for every seat.
 *   STAGE       is this sentence design-stage commentary — what still needs
 *               attention, improvement, calibration, optimisation or further
 *               design work, or a correction to come? The proposal states the
 *               finished design, so that wording is refused rather than written:
 *               where an issue genuinely undermines the design, the refusal is
 *               what holds the copy for human review instead of the writer
 *               proposing a correction.
 *
 * Two boundaries are deliberate and worth stating plainly:
 *
 *   1. an option's OWN NAME is not a Performance Level claim. The saved reports
 *      name options "Level 1" and "Level 4", so those names are removed before
 *      levels are read. A level is read from the levels that remain ("L3",
 *      "Level 3" written about a parameter).
 *   2. naming the other option's product inside an explicit comparison ("rather
 *      than", "instead of") or naming that other option is a contrast, not an
 *      import, so it is not reported as an extra product.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { isBassConsistencyClaim } from '../proposalEvidence/proposalEvidenceWording.js';
import { WRITER_REJECTION, violation } from './writerContractSchema.js';
import {
  areaAnchorTerms,
  assertionKind,
  blockPatterns,
  blockedChangeBlocks,
  claimLevels,
  hasRecommendationClaim,
  isNarrowScopeClaim,
  isPackProse,
  isProductToken,
  isRecommendation,
  kindSatisfiesAssertion,
  levelTokens,
  measurementTokens,
  modelTokens,
  p20BlocksConsistency,
  packProseSentences,
  parameterIds,
  SCOPE_ADJECTIVE_LEVEL,
  scopeAdjectiveInText,
  seatScopeInText,
  sentenceParts,
  stripOptionNames,
} from './writerVocabulary.js';
import { directAreaDifference, screenLocationQualifier } from './writerClausePrecision.js';

/** A comparative in front of an area claims more of it: "a larger screen". */
const COMPARATIVES = 'more|larger|bigger|wider|greater|better|higher|superior|increased|additional|extra|further|stronger|deeper';

/**
 * The comparatives that stand as the area's own comparative as they are: "a
 * larger screen", "greater bass extension".
 */
const OWN_COMPARATIVES = 'larger|bigger|wider|greater|better|higher|superior|increased|additional|extra|further|stronger|deeper';

/**
 * A bare "more" is only a claim about an area when it opens a noun phrase —
 * "more channels" alongside "adds" is a change, while "more room to expand"
 * is room to work in, not a larger room. So "more" needs one of these in front
 * of it before it is read as claiming the area that follows.
 */
const NP_LEADS = 'a|an|the|this|that|these|those|its|their|our|your|his|her|any|every|each|such';

/**
 * A head that is only MODIFYING the word after it is naming something else:
 * "screen stage" is the front stage, not the screen, and "surround channels" are
 * the surround layer. A term in that position is not the area claiming anything
 * itself, so it is not read as a claim about the area.
 */
const HEAD_NOT_RENAMED = '(?!\\s+(?:stage|stages|channel|channels|speaker|speakers|wall|walls|plane|planes|array|arrays|layer|layers|format|formats|position|positions|field)\\b)';

/** Words that are themselves an improvement or a change in the area. */
const CLAIM_VERBS = 'improve[sd]?|improvements?|gains?|increases?|increased|boosts?|enhances?|exceeds?|solves?|fixes?|resolves?|adds?|added|changes?|changed|upgrades?|upgraded|replaces?|exchanges?|introduces?';

/**
 * The wording that actually claims a CHANGE to a channel set or a layout: an
 * addition, a replacement, a difference or a comparative. A capability benefit
 * predicated of the area's own channels or layers — "the surround channels gain
 * headroom" — is a performance claim about those channels, judged by the gain
 * and figure rules, and not a claim that the channel set itself changed.
 */
export const CHANGE_SIGNAL = /\b(?:adds?|added|adding|extra|additional|more|increases?|increased|upgrades?|upgraded|replaces?|replacement|changed|changes?|differs?|different|instead\s+of|rather\s+than|larger|bigger|wider|greater|higher|superior|deeper|stronger)\b/i;

/**
 * A word that names the channel set, a layer of it or a loudspeaker position
 * rather than a capability of its own. A change block is raised by one of these
 * only where the sentence claims the set itself changed.
 */
export const CHANNEL_FAMILY = /^(?:channels?|formats?|layers?|speakers?|positions?)$/i;

/** Verbs that carry a benefit to the area without asserting one themselves. */
const LINK_VERBS = 'is|are|was|were|has|have|had|offers?|provides?|gives?|giving|delivers?|records?|shows?|reaches?|achieves?|supports?|remains?|scores?|performs?|states?|holds?|keeps?';

/** The words that turn a keyword into a claimed improvement about it. */
const BENEFIT_WORDS = 'improve[sd]?|improvements?|gains?|better|greater|more|increas\\w*|enhanc\\w*|exceeds?|superior|boosts?|advantages?|benefits?|stronger|higher|larger|bigger|wider|deeper';

/**
 * The layer and family words a capability can belong to. In "greater screen,
 * surround and height headroom" the words in front of "headroom" name the layers
 * that headroom belongs to, so "screen" there is not claiming a change to the
 * screen itself.
 */
const ATTRIBUTED_LAYERS = 'screen|screens|surround|surrounds|height|heights|overhead|overheads|front|rear|wide|wides|bed|beds|lcr|centre|center|subwoofer|subwoofers|subs|bass';

/**
 * The nouns that name what the system DELIVERS — headroom, output capability,
 * dynamic range, authority, impact — rather than an area of it. A head that is
 * modifying one of these is Dynamic Range language: "screen headroom" is a
 * capability claim about the screen stage, judged by the grounding and figure
 * rules, and not a claim that the screen, its size or its timbre changed. None of
 * these nouns names a size, a dimension or a tone, so "a larger screen", "the
 * screen is wider" and "improves the screen size" are read exactly as before.
 */
const ATTRIBUTED_CAPABILITY = 'headroom|output|outputs|capability|capabilities|authority|reserve|dynamics|dynamic\\s+range|impact|weight|scale|punch|effects?|levels?|spl|pressure';

/**
 * The words between a head and the capability noun it modifies: a list of layers,
 * one claim or link verb, or both. The head is only read as capability language
 * when a capability noun actually follows it, so ordinary size wording — where
 * nothing but the end of the claim follows the head — is untouched.
 */
const ATTRIBUTED_CAPABILITY_FOLLOW = new RegExp(
  `^(?:[\\s,]+(?:and|plus|or)?[\\s,]*(?:${ATTRIBUTED_LAYERS})\\b)*(?:[\\s,]+(?:and|plus|or)?[\\s,]*(?:${LINK_VERBS}|gains?|adds?)\\b)?[\\s,]+(?:and|plus|or)?[\\s,]*(?:(?:${COMPARATIVES})\\s+)?(?:${ATTRIBUTED_CAPABILITY})\\b`,
  'i',
);

/** Whether the head at `at` is modifying a capability noun rather than naming an area. */
function modifiesCapabilityNoun(sentence, at, term) {
  return ATTRIBUTED_CAPABILITY_FOLLOW.test(String(sentence).slice(at + String(term).length));
}

/** Any word that carries a claim: an improvement, a change or a comparative. */
const CLAIM_WORDS = `${CLAIM_VERBS}|${COMPARATIVES}|${BENEFIT_WORDS}`;

/** A phrase that compares two options rather than importing from one into the other. */
export const CONTRAST = /\b(?:rather than|instead of|compared (?:with|to)|against)\b/i;

/** The words that deny a claim, however they are written. */
const DENIAL = /\b(?:not|never|no|none|nor|neither|cannot|can't|doesn't|don't|isn't|aren't|without|lacks?)\b|\b(?:do|does|did|is|are|was|were|can|could|will|would|has|have|had)\s+not\b/i;

/** Where one clause ends and the next begins. */
const CLAUSE_BREAKS = /[.!?,;:]|\b(?:but|however|although|whereas|yet)\b/i;

/**
 * A rejected alternative: what follows "rather than" or "instead of" is what the
 * sentence says is NOT the case. A change word inside it — "everything is shared
 * rather than a different room" — is not the sentence claiming a change, so the
 * alternative is taken out before the sentence is classified. Only the
 * alternative goes: a change asserted before it is read exactly as before.
 */
const REJECTED_ALTERNATIVE = /\b(?:rather than|instead of)\b[^.;:!?]*/gi;

/** The sentence with every rejected alternative removed. */
function withoutRejectedAlternatives(sentence) {
  return String(sentence || '').replace(REJECTED_ALTERNATIVE, ' ');
}

/**
 * Bass wording that names seat-to-seat consistency as an open item rather than a
 * delivered result: what still needs attention, what is not yet solved. This is
 * the honest way to write about a P20 result that supports no consistency, so it
 * is never read as a claim that the bass is consistent.
 */
const CONSISTENCY_CAVEAT = /\b(?:needs?\s+(?:calibration\s+)?attention|calibration\s+attention|requires?\s+attention|not\s+solved|unsolved|remains?\s+an?\s+(?:area|item|point)|remains?\s+open|to\s+be\s+addressed)\b/i;

/**
 * Where a sentence states consistency, so the clause it sits in can be read: the
 * position the denial and the open-item checks are anchored on.
 */
export const CONSISTENCY_ANCHOR = /\b(?:consisten\w+|uniform|identical|even|same|similar|equal)\b/i;

/** The claim written as its own negation: "there are no bad seats in this design". */
export const NEGATION_SHAPED_CLAIM = /\bno\s+(?:bad|poor|weak|cheap|second[- ]class|compromised)\s+seats?\b/i;

/** The clause a position sits in: from the break before it to the break after it. */
function clauseAt(sentence, at) {
  if (!Number.isFinite(at) || at < 0) return '';
  const text = String(sentence);
  const before = text.slice(0, at).split(CLAUSE_BREAKS).pop() || '';
  const after = text.slice(at).split(CLAUSE_BREAKS)[0] || '';
  return `${before} ${after}`;
}

/**
 * Whether the clause the match sits in denies it: "the bass results do not
 * indicate improved...", "the distinction is not the format...", "the screen is
 * not larger...". The whole clause is read, so a denial written either side of
 * the matched words counts — and a denial in the NEXT clause does not.
 */
export function isDenied(sentence, at) {
  return DENIAL.test(clauseAt(sentence, at));
}

/** Whether the clause the match sits in names consistency as an open item. */
export function isConsistencyCaveat(sentence, at) {
  return CONSISTENCY_CAVEAT.test(clauseAt(sentence, at));
}

/**
 * The seat-to-seat bass consistency claims P20 has to support before a draft may
 * make one. Each is an affirmative statement that the bass is the same at every
 * seat — the phrasings a client reads as "there are no weak seats in this room",
 * which is exactly what the pack's own prohibited-wording patterns do not catch.
 *
 * The rules are deliberately narrow: a claim about bass output authority, impact,
 * extension or the response at the reference seating position names no
 * consistency and matches nothing here.
 */const SEAT_CONSISTENCY_CLAIMS = Object.freeze([
  {
    rule: 'the_same_bass_at_every_seat',
    pattern: /\b(?:even|uniform|identical|the\s+same|consistent|similar|equal)\s+bass\b(?:\s+\w+){0,2}\s+(?:across|throughout|in|at|between)\s+(?:all\s+|every\s+|each\s+|the\s+)?(?:seat\w*|seating|rows?|listeners?|audience|room)\b/i,
  },
  {
    rule: 'consistent_across_the_seats',
    pattern: /\b(?:consisten\w+|even|uniform|identical)\b(?:\s+\w+){0,3}\s+(?:across|throughout|between|in|at|from)\s+(?:all\s+|every\s+|each\s+|the\s+)?(?:seat\w*|seating|rows?|listeners?|audience)\b/i,
  },
  {
    rule: 'every_seat_gets_the_same_bass',
    pattern: /\b(?:every|each|all)\s+seats?\b[^.;:]{0,30}\b(?:same|identical|equal|even)\b[^.;:]{0,12}\bbass\b/i,
  },
  {
    rule: 'no_bad_seats',
    pattern: /\bno\s+(?:bad|poor|weak|cheap|second[- ]class|compromised)\s+seats?\b/i,
    // The claim is itself written as a negation ("there are no bad seats"), so a
    // denial in the same clause cannot mean the sentence is not making it.
    negationShaped: true,
  },
]);

/** The rule ids behind the seat-consistency claims, for an audit to assert against. */
export const SEAT_CONSISTENCY_RULES = Object.freeze(SEAT_CONSISTENCY_CLAIMS.map((entry) => entry.rule));

/**
 * The seat-to-seat consistency claim a sentence makes, or null. The first rule
 * that matches is the one reported, so one sentence raises one claim.
 *
 * @param {string} text
 * @returns {{ rule: string, at: number, negationShaped: boolean }|null}
 */
export function seatConsistencyClaim(text) {
  const sentence = String(text || '');
  if (sentence.length === 0) return null;
  for (const entry of SEAT_CONSISTENCY_CLAIMS) {
    const match = entry.pattern.exec(sentence);
    if (match) return { rule: entry.rule, at: match.index, negationShaped: entry.negationShaped === true };
  }
  return null;
}

/**
 * The areas the evidence states at ONE reference position rather than at the
 * seats, and the terms a sentence names them by. P19 is the reference-position
 * bass response against the house target: it has no seat-group result at all, so
 * a sentence that scopes it to a seat group describes a result the evidence does
 * not state — including where the pack does state a result for another bass area
 * at that scope, which the general scope rule cannot see.
 */
const REFERENCE_POSITION_AREA_PATTERNS = Object.freeze([
  { area: 'p19', pattern: /\bP19\b/i },
  { area: 'p19', pattern: /\bbass\s+response\b/i },
  { area: 'p19', pattern: /\bresponse\s+quality\b/i },
]);

/** The area keys assessed at one reference position, for an audit to assert against. */
export const REFERENCE_POSITION_AREA_KEYS = Object.freeze(['p19']);

/**
 * Whether a sentence claims a seat-group result for an area the evidence states
 * at one reference position only.
 *
 * A claim that is denied in its own clause is not a claim, so "the bass response
 * is not even across every seat" is not reported; the pack's own prose is
 * exempt, exactly as it is for the other prose rules.
 *
 * @param {Object} params
 * @param {string} params.sentence
 * @param {string|null} params.scope — the seat group the sentence names, or null
 * @param {Array<string>} [params.packProse] — the pack's own sentences
 * @returns {string|null} the reason, or null when the sentence is sound
 */
export function referencePositionScopeIssue({ sentence, scope, packProse = [] } = {}) {
  if (!scope) return null;
  const text = String(sentence || '');
  if (text.length === 0) return null;
  if (isPackProse(text, packProse)) return null;

  const match = REFERENCE_POSITION_AREA_PATTERNS
    .map((entry) => ({ ...entry, at: text.search(entry.pattern) }))
    .filter((entry) => entry.at >= 0)
    .sort((left, right) => left.at - right.at)[0];
  if (!match) return null;
  if (isDenied(text, match.at)) return null;

  return `${match.area}_is_assessed_at_the_reference_seating_position_not_across_the_seats`;
}

/** One pattern for every term the pack's areas are named by. */
export function anchorPatternFor(input) {
  const terms = areaAnchorTerms(input?.evidence_pack);
  return terms.length > 0 ? new RegExp(`\\b(?:${terms.join('|')}|equipment|loudspeaker)\\w*\\b`, 'i') : /$^/;
}

/**
 * Whether a sentence claims a change or an improvement in ONE area, read from
 * the area itself: the area's own phrase, or one of its distinctive terms
 * carrying the claim as its subject. A term that merely occurs in the sentence —
 * inside another area's phrase, inside an option's name, or as a compound
 * modifier of something else — is not a claim about this area.
 *
 * @returns {{ at: number, keyword: string, phrase: boolean }|null}
 */
export function claimsArea(sentence, { heads = [], phrases = [] } = {}) {
  for (const phrase of phrases) {
    const at = sentence.toLowerCase().indexOf(phrase);
    if (at < 0) continue;
    const before = sentence.slice(Math.max(0, at - 40), at);
    const after = sentence.slice(at + phrase.length, at + phrase.length + 40);
    const claimed = new RegExp(`\\b(?:${CLAIM_WORDS})\\b`, 'i').test(before)
      || new RegExp(`\\b(?:${BENEFIT_WORDS})\\b`, 'i').test(after);
    if (claimed) return { at, keyword: phrase, phrase: true, matched: phrase };
  }

  for (const head of heads) {
    const difference = directAreaDifference(sentence, head);
    if (difference) return difference;
    const term = `\\b${head}\\w*\\b`;
    const head2 = `${term}${HEAD_NOT_RENAMED}`;
    const patterns = [
      // the area carries the comparative itself: "a larger screen"
      new RegExp(`\\b(?:${OWN_COMPARATIVES})\\b\\s+(?:\\w+\\s+){0,1}?${head2}`, 'i'),
      // a determiner-led "more": "the more capable screen"
      new RegExp(`\\b(?:${NP_LEADS})\\s+more\\b\\s+(?:\\w+\\s+){0,1}?${head2}`, 'i'),
      // the area is the subject of the claim: "the screen improves"
      new RegExp(`${head2}(?:\\s+\\w+){0,2}\\s+(?:${CLAIM_VERBS})\\b`, 'i'),
      // the claim is predicated of the area: "adds more channels"
      new RegExp(`\\b(?:${CLAIM_VERBS})\\b(?:\\s+\\w+){0,3}\\s+${head2}`, 'i'),
      // the area is the subject of a benefit: "the screen gives more headroom"
      new RegExp(`${head2}(?:\\s+\\w+){0,2}\\s+(?:${LINK_VERBS})\\b(?:\\s+\\w+){0,3}\\s+(?:${BENEFIT_WORDS})\\b`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(sentence);
      if (!match) continue;
      // Where the head itself sits inside the match, so the words that follow the
      // head decide whether it names the area or modifies a capability of it.
      const within = new RegExp(term, 'i').exec(match[0]);
      const headAt = match.index + (within ? within.index : 0);
      const headText = within ? within[0] : head;
      if (modifiesCapabilityNoun(sentence, headAt, headText)
        || screenLocationQualifier(sentence, headAt, headText)) continue;
      return { at: match.index, keyword: head, phrase: false, matched: match[0] };
    }
  }

  return null;
}

/**
 * What a sentence asserts, once the areas and the denials are read. A sentence
 * that names no area of the evidence asserts nothing about it, and a sentence
 * that denies its own claim is not making it — so neither is a grounded claim
 * that a section has to have cited a claim for.
 */
export function assertedKind(sentence, anchors) {
  // Classified with the rejected alternatives taken out: "shared, rather than a
  // different room" is a statement of sameness, not a claim that a room changed.
  const kind = assertionKind(withoutRejectedAlternatives(sentence));
  if (!kind) return null;
  if (kind === 'result' || kind === 'same') {
    // A stated result or a shared statement that denies itself in its own clause
    // is not making the claim: "No claim is made for identical bass in every
    // seat." The sentence is read from its opening clause, so a denial stated
    // later never excuses the claim it follows.
    return isDenied(sentence, 0) ? null : kind;
  }
  if (!anchors.test(sentence)) return null;
  const at = kind === 'change'
    ? sentence.search(CHANGE_SIGNAL)
    : sentence.search(new RegExp(`\\b(?:${CLAIM_WORDS})\\b`, 'i'));
  return isDenied(sentence, at) ? null : kind;
}

/**
 * Whether a sentence makes a seat-group claim at a scope the pack does not state.
 *
 * A sentence naming the primary seats has to cite a claim the pack states for the
 * primary seats; one naming the secondary seats, a claim for the secondary seats;
 * and a sentence about the seating area or the room has to cite support that is
 * not scoped to one group at all — so a strong result for one group can never be
 * presented as a result for every seat. Where the sentence carries one of the
 * scoped adjectives, a cited claim for that scope has to state the level the
 * adjective reads as, so a result cannot be written one grade higher than the
 * evidence states it.
 *
 * @returns {string|null} the reason, or null when the sentence is sound
 */
export function scopedClaimIssue({ sentence, scope, claims }) {
  if (!scope) return null;

  const adjective = scopeAdjectiveInText(sentence);
  // Only a sentence that states a seat-group result is held to this rule.
  if (!adjective && !seatConsistencyClaim(sentence)) return null;

  const cited = Array.isArray(claims) ? claims : [];
  const supporting = scope === 'all'
    ? cited.filter((claim) => !isNarrowScopeClaim(claim))
    : cited.filter((claim) => isNarrowScopeClaim(claim) && claim.scope === scope);

  if (supporting.length === 0) {
    return scope === 'all'
      ? 'the_seating_area_needs_evidence_that_is_not_scoped_to_one_group'
      : `no_${scope}_seat_result_is_stated_for_this_pack`;
  }

  if (!adjective) return null;
  const required = SCOPE_ADJECTIVE_LEVEL[adjective];
  const stated = supporting.some((claim) => claimLevels(claim).has(required));
  return stated
    ? null
    : `${adjective.toLowerCase()}_is_not_stated_for_${scope === 'all' ? 'every_seat' : `the_${scope}_seats`}`;
}

/** The option a version ID belongs to, as the draft would name it. */
export function optionNameById(input, versionId) {
  const option = (Array.isArray(input?.evidence_pack?.options) ? input.evidence_pack.options : [])
    .find((entry) => entry?.version_id === versionId) || null;
  return option?.version_name || null;
}

// Preserve the public scanner import while keeping rules and scanner modular.
export { scanProse, scanProse as default } from './writerProseScanner.js';