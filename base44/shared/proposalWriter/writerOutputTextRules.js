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
  assertionKind,
  blockKeywords,
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

/** The words that turn a keyword into a claimed improvement about it. */
const BENEFIT_WORDS = 'improve\\w*|improvements?|gains?|better|greater|more|increas\\w*|enhanc\\w*|exceeds?|superior|boosts?|advantages?|benefits?';

/** The words that add or change something outright. */
const STRONG_CHANGE_WORDS = 'adds?|added|changes?|changed|upgrad\\w*|exchanges?';

/** A phrase that compares two options rather than importing from one into the other. */
const CONTRAST = /\b(?:rather than|instead of|compared (?:with|to)|against)\b/i;

/** Whether a sentence claims an improvement or a change in the area a keyword names. */
function claimsChangeOf(sentence, keyword) {
  const subjectFirst = new RegExp(`\\b${keyword}\\w*\\b[^.]{0,40}?\\b(?:${BENEFIT_WORDS})\\b`, 'i');
  const changeFirst = new RegExp(`\\b(?:${STRONG_CHANGE_WORDS})\\b[^.]{0,25}?\\b${keyword}\\w*\\b`, 'i');
  return subjectFirst.test(sentence) || changeFirst.test(sentence);
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

  for (const sentence of sentences) {
    const kind = assertionKind(sentence);

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
    for (const block of fromPack ? [] : blockedChangeBlocks(input)) {
      const matched = blockKeywords(block, input.evidence_pack)
        .some((keyword) => claimsChangeOf(sentence, keyword));
      if (!matched) continue;
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