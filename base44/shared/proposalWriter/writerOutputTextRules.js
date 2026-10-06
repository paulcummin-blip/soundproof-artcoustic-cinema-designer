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
 *               recommendation is allowed?
 *   BASS        does this sentence claim the seat-to-seat bass consistency the
 *               P20 result does not support?
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
  hasRecommendationClaim,
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
  sentenceParts,
  stripOptionNames,
} from './writerVocabulary.js';

/** A comparative in front of an area claims more of it: "a larger screen". */
const COMPARATIVES = 'more|larger|bigger|wider|greater|better|higher|superior|increased|additional|extra|further|stronger|deeper';

/** Words that are themselves an improvement or a change in the area. */
const CLAIM_VERBS = 'improve[sd]?|improvements?|gains?|increases?|increased|boosts?|enhances?|exceeds?|solves?|fixes?|resolves?|adds?|added|changes?|changed|upgrades?|upgraded|replaces?|exchanges?|introduces?';

/** Verbs that carry a benefit to the area without asserting one themselves. */
const LINK_VERBS = 'is|are|was|were|has|have|had|offers?|provides?|gives?|giving|delivers?|records?|shows?|reaches?|achieves?|supports?|remains?|scores?|performs?|states?|holds?|keeps?';

/** The words that turn a keyword into a claimed improvement about it. */
const BENEFIT_WORDS = 'improve[sd]?|improvements?|gains?|better|greater|more|increas\\w*|enhanc\\w*|exceeds?|superior|boosts?|advantages?|benefits?|stronger|higher|larger|bigger|wider|deeper';

/** Any word that carries a claim: an improvement, a change or a comparative. */
const CLAIM_WORDS = `${CLAIM_VERBS}|${COMPARATIVES}|${BENEFIT_WORDS}`;

/** A phrase that compares two options rather than importing from one into the other. */
const CONTRAST = /\b(?:rather than|instead of|compared (?:with|to)|against)\b/i;

/** The words that deny a claim, however they are written. */
const DENIAL = /\b(?:not|never|no|none|nor|neither|cannot|can't|doesn't|don't|isn't|aren't|without|lacks?)\b|\b(?:do|does|did|is|are|was|were|can|could|will|would|has|have|had)\s+not\b/i;

/** Whether the clause carrying a match denies it: "the bass results do not indicate improved...". */
function isDenied(sentence, at) {
  if (!Number.isFinite(at) || at < 0) return false;
  const clause = sentence.slice(0, at)
    .split(/[,;:]|\b(?:but|however|although|whereas|yet)\b/i)
    .pop() || '';
  return DENIAL.test(clause);
}

/** One pattern for every term the pack's areas are named by. */
function anchorPatternFor(input) {
  const terms = areaAnchorTerms(input?.evidence_pack);
  return terms.length > 0 ? new RegExp(`\\b(?:${terms.join('|')})\\w*\\b`, 'i') : /$^/;
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
function claimsArea(sentence, { heads = [], phrases = [] } = {}) {
  for (const phrase of phrases) {
    const at = sentence.toLowerCase().indexOf(phrase);
    if (at < 0) continue;
    const before = sentence.slice(Math.max(0, at - 40), at);
    const after = sentence.slice(at + phrase.length, at + phrase.length + 40);
    const claimed = new RegExp(`\\b(?:${CLAIM_WORDS})\\b`, 'i').test(before)
      || new RegExp(`\\b(?:${BENEFIT_WORDS})\\b`, 'i').test(after);
    if (claimed) return { at, keyword: phrase, phrase: true };
  }

  for (const head of heads) {
    const term = `\\b${head}\\w*\\b`;
    const patterns = [
      // the area carries the comparative itself: "a larger screen"
      new RegExp(`\\b(?:${COMPARATIVES})\\b\\s+(?:\\w+\\s+){0,1}?${term}`, 'i'),
      // the area is the subject of the claim: "the screen improves"
      new RegExp(`${term}(?:\\s+\\w+){0,2}\\s+(?:${CLAIM_VERBS})\\b`, 'i'),
      // the claim is predicated of the area: "adds more channels"
      new RegExp(`\\b(?:${CLAIM_VERBS})\\b(?:\\s+\\w+){0,3}\\s+${term}`, 'i'),
      // the area is the subject of a benefit: "the screen gives more headroom"
      new RegExp(`${term}(?:\\s+\\w+){0,2}\\s+(?:${LINK_VERBS})\\b(?:\\s+\\w+){0,3}\\s+(?:${BENEFIT_WORDS})\\b`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(sentence);
      if (match) return { at: match.index, keyword: head, phrase: false };
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
function assertedKind(sentence, anchors) {
  const kind = assertionKind(sentence);
  if (!kind || kind === 'result' || kind === 'same') return kind;
  if (!anchors.test(sentence)) return null;
  const at = sentence.search(new RegExp(`\\b(?:${CLAIM_WORDS})\\b`, 'i'));
  return isDenied(sentence, at) ? null : kind;
}

/** The option a version ID belongs to, as the draft would name it. */
function optionNameById(input, versionId) {
  const option = (Array.isArray(input?.evidence_pack?.options) ? input.evidence_pack.options : [])
    .find((entry) => entry?.version_id === versionId) || null;
  return option?.version_name || null;
}

/**
 * Read one section's prose against the pack.
 *
 * @param {Object} input — the writer input (carries the pack)
 * @param {Object} vocabulary — the pack's vocabulary (writerVocabulary)
 * @param {Object} section — { section, text, claims, claim_kinds }
 * @returns {Array<Object>} the rejections this section raises
 */
export function scanProse({ input, vocabulary, section, text, claims = [], claimKinds = [] }) {
  const found = [];
  const citedKinds = Array.isArray(claimKinds) ? claimKinds : [];
  const citedClaims = Array.isArray(claims) ? claims : [];
  const sentences = sentenceParts(text);
  const packProse = packProseSentences(input);
  const anchors = anchorPatternFor(input);
  const blocks = blockedChangeBlocks(input)
    .map((block) => ({ block, patterns: blockPatterns(block, input.evidence_pack) }));

  for (const sentence of sentences) {
    // An option's own name is an option's name: it is not a claim about an area
    // and it is not a Performance Level, so it is taken out before the sentence
    // is read for either.
    const claimed = stripOptionNames(sentence, vocabulary.optionNames)
      .replace(/\bLevel\s?[1-4]\b(?:\s+versions?)?/gi, ' ');

    // What the sentence asserts, once a sentence that names no area of the
    // evidence, and a sentence that denies its own claim, are read as asserting
    // nothing at all.
    const kind = assertedKind(claimed, anchors);

    // Grounding: a claim the section cites nothing for, or cites the wrong kind
    // of claim for, is not a claim this pack supports.
    if (kind && citedKinds.length === 0) {
      found.push(violation(WRITER_REJECTION.MISSING_CLAIM_ID, {
        section,
        detail: `${kind}_claim_without_a_claim_id`,
      }));
    } else if (kind && !kindSatisfiesAssertion(kind, citedKinds)) {
      found.push(violation(WRITER_REJECTION.INVENTED_BENEFIT, {
        section,
        detail: `${kind}_claim_not_supported_by_the_cited_claims`,
      }));
    }

    // Blocked areas: a change or an improvement the pack records as unchanged.
    // Prose the pack itself states is exempt — the pack's own claim wording is
    // permitted by definition, and quoting it is exactly what a draft should do.
    const fromPack = isPackProse(sentence, packProse);
    for (const { block, patterns } of fromPack ? [] : blocks) {
      const match = claimsArea(claimed, patterns);
      if (!match) continue;
      // A sentence that denies the claim is not making it.
      if (isDenied(claimed, match.at)) continue;
      found.push(violation(WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT, {
        section,
        detail: `${block.reason}:${block.block_id}`,
        claim_ids: [block.block_id],
      }));
    }

    // A recommendation where the pack allows none.
    if (isRecommendation(sentence) && !hasRecommendationClaim(input)) {
      found.push(violation(WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION, {
        section,
        detail: 'the_pack_allows_no_recommendation',
      }));
    }
  }

  // Figures: every measurement a draft states is a measurement the pack states.
  for (const token of measurementTokens(text)) {
    if (vocabulary.measurements.has(token)) continue;
    found.push(violation(WRITER_REJECTION.CHANGED_PARAMETER_VALUE, {
      section,
      detail: `figure_not_stated_by_the_reports:${token}`,
    }));
  }

  // Levels: read with the option names removed, so an option's name is never
  // mistaken for a result. Where the sentence names a parameter, the level must
  // be one that parameter's own reports state.
  for (const sentence of sentenceParts(stripOptionNames(text, vocabulary.optionNames))) {
    const ids = parameterIds(sentence);
    for (const level of levelTokens(sentence)) {
      const supported = ids.length > 0
        ? ids.every((id) => (vocabulary.parameters.get(id) || new Set()).has(level))
        : vocabulary.levels.has(level);
      if (supported) continue;
      found.push(violation(WRITER_REJECTION.CHANGED_LEVEL, {
        section,
        detail: `${ids.length > 0 ? ids.map((id) => `P${id}`).join(',') : 'no_parameter_named'}:${level}`,
      }));
    }
  }

  // Products: only those the pack lists, and only for the option they belong to.
  const citedOptionIds = new Set(
    citedClaims.filter((claim) => claim?.option?.version_id).map((claim) => claim.option.version_id),
  );
  const oneOptionOnly = citedOptionIds.size === 1
    && citedClaims.some((claim) => claim?.option?.version_id)
    && citedClaims.every((claim) => !claim?.option?.version_id || citedOptionIds.has(claim.option.version_id));

  for (const token of modelTokens(text)) {
    if (!isProductToken(token)) continue;
    if (!vocabulary.products.has(token)) {
      found.push(violation(WRITER_REJECTION.UNSELECTED_PRODUCT, { section, detail: token }));
      continue;
    }
    if (!oneOptionOnly) continue;
    const owners = vocabulary.owners.get(token) || new Set();
    const foreign = [...owners].filter((versionId) => !citedOptionIds.has(versionId));
    if (foreign.length === 0) continue;
    // The sentence the product is named in decides it: a sentence that compares
    // the two options, or names the other option, is a contrast rather than an
    // import of one option's product into the other's claim.
    const sentence = sentences.find((entry) => entry.includes(token)) || String(text);
    if (CONTRAST.test(sentence)) continue;
    const named = foreign.some((versionId) => {
      const name = optionNameById(input, versionId);
      return name && sentence.includes(name);
    });
    if (named) continue;
    found.push(violation(WRITER_REJECTION.EXTRA_PRODUCT, {
      section,
      detail: `product_belongs_to_another_option:${token}`,
    }));
  }

  // The bass rule: where P20 does not support seat-to-seat consistency, no
  // sentence may claim it, however it is worded.
  if (p20BlocksConsistency(input) && isBassConsistencyClaim(text)) {
    found.push(violation(WRITER_REJECTION.P20_BASS_CONTRADICTION, {
      section,
      detail: 'p20_does_not_support_a_bass_consistency_claim',
    }));
  }

  return found;
}

export default scanProse;