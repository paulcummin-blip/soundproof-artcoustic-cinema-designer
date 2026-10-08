/** Existing prose checks, with clause-independent grounding and internal attribution. */
import { isBassConsistencyClaim } from '../proposalEvidence/proposalEvidenceWording.js';
import { WRITER_REJECTION, violation } from './writerContractSchema.js';
import { claimLevels, hasRecommendationClaim, isPackProse, isRecommendation, kindSatisfiesAssertion, levelTokens, measurementTokens, p20BlocksConsistency, packProseSentences, parameterIds, seatScopeInText, sentenceParts, stripOptionNames, blockedChangeBlocks, blockPatterns } from './writerVocabulary.js';
import { anchorPatternFor, assertedKind, claimsArea, isDenied, isConsistencyCaveat, seatConsistencyClaim, scopedClaimIssue, referencePositionScopeIssue, CHANNEL_FAMILY, CHANGE_SIGNAL, CONSISTENCY_ANCHOR, NEGATION_SHAPED_CLAIM } from './writerOutputTextRules.js';
import { productScopeViolations } from './writerProductScope.js';
import { designStageCommentary } from './writerDesignStageRules.js';
import { framingContrastGrounded, independentClauses, supportedChangeClause } from './writerClausePrecision.js';
import { attributeViolation } from './writerViolationAudit.js';

export function scanProse({ input, vocabulary, section, text, claims = [], claimKinds = [] }) {
  const found = [];
  const citedKinds = Array.isArray(claimKinds) ? claimKinds : [];
  const citedClaims = Array.isArray(claims) ? claims : [];
  const sentences = sentenceParts(text);
  const packProse = packProseSentences(input);
  const anchors = anchorPatternFor(input);
  const blocks = blockedChangeBlocks(input).map(block => ({ block, patterns: blockPatterns(block, input.evidence_pack) }));
  let context = { text };
  const report = (code, details) => found.push(attributeViolation(violation(code, details), context));

  for (const sentence of sentences) {
    for (const { clause } of independentClauses(sentence)) {
      context = { text, sentence, clause };
      const claimed = stripOptionNames(clause, vocabulary.optionNames)
        .replace(/\bLevel\s?[1-4]\b(?:\s+versions?)?/gi, ' ');
      const kind = assertedKind(claimed, anchors);
      // A contrast sentence that places the difference between the options is
      // grounded by the input's own change evidence for the families it names.
      // Never an exemption: with no such evidence the clause stays unsupported,
      // and a clause that asserts a named area changed is never framing.
      const framingGrounded = kind === 'change' && framingContrastGrounded(claimed, input, citedKinds);
      if (kind && citedKinds.length === 0) {
        report(WRITER_REJECTION.MISSING_CLAIM_ID, { section, detail: `${kind}_claim_without_a_claim_id` });
      } else if (kind && !framingGrounded && (!kindSatisfiesAssertion(kind, citedKinds)
        || (kind === 'change' && !supportedChangeClause(claimed, citedClaims)))) {
        report(WRITER_REJECTION.INVENTED_BENEFIT, { section, detail: `${kind}_claim_not_supported_by_the_cited_claims` });
      }
      const fromPack = isPackProse(clause, packProse);
      for (const { block, patterns } of fromPack ? [] : blocks) {
        const match = claimsArea(claimed, patterns);
        if (!match || isDenied(claimed, match.at)) continue;
        if (CHANNEL_FAMILY.test(match.keyword) && !CHANGE_SIGNAL.test(claimed)) continue;
        context = { text, sentence, clause, match: match.matched, ruleId: `blocked_area:${block.reason}`, blockId: block.block_id };
        report(WRITER_REJECTION.UNSUPPORTED_IMPROVEMENT, {
          section, detail: `${block.reason}:${block.block_id}`, claim_ids: [block.block_id],
        });
      }
      context = { text, sentence, clause };
      if (isRecommendation(clause) && !hasRecommendationClaim(input)) {
        report(WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION, { section, detail: 'the_pack_allows_no_recommendation' });
      }
      const designStage = designStageCommentary(claimed);
      if (designStage) {
        context.ruleId = `design_stage_commentary:${designStage.rule}`;
        report(WRITER_REJECTION.DESIGN_STAGE_COMMENTARY, { section, detail: `design_stage_commentary:${designStage.rule}` });
      }
      context = { text, sentence, clause };
      const seatScope = seatScopeInText(claimed);
      if (p20BlocksConsistency(input) && seatScope !== 'primary' && seatScope !== 'secondary') {
        const claim = seatConsistencyClaim(claimed);
        if (claim) {
          const denied = !claim.negationShaped && isDenied(claimed, claim.at);
          if (!denied && !isConsistencyCaveat(claimed, claim.at)) {
            context.ruleId = `p20_seat_consistency:${claim.rule}`;
            report(WRITER_REJECTION.P20_BASS_CONTRADICTION, { section, detail: `p20_does_not_support_a_seat_consistency_claim:${claim.rule}` });
          }
        }
      }
      context = { text, sentence, clause };
      const scopedIssue = scopedClaimIssue({ sentence: claimed, scope: seatScope, claims: citedClaims });
      if (scopedIssue) report(WRITER_REJECTION.SCOPE_MISMATCH, { section, detail: scopedIssue });
      // An area the evidence states at one reference position only — P19 — has
      // no seat-group result, so a sentence that scopes it to the seats claims a
      // result the pack does not state.
      const referenceOnlyIssue = referencePositionScopeIssue({ sentence: claimed, scope: seatScope, packProse });
      if (referenceOnlyIssue) {
        context.ruleId = `reference_position_scope:${referenceOnlyIssue}`;
        report(WRITER_REJECTION.SCOPE_MISMATCH, { section, detail: referenceOnlyIssue });
      }
    }
  }

  context = { text };
  for (const token of measurementTokens(text)) {
    if (vocabulary.measurements.has(token)) continue;
    report(WRITER_REJECTION.CHANGED_PARAMETER_VALUE, { section, detail: `figure_not_stated_by_the_reports:${token}` });
  }
  for (const sentence of sentenceParts(text)) {
    context = { text, sentence };
    const claimed = stripOptionNames(sentence, vocabulary.optionNames);
    const ids = parameterIds(claimed);
    for (const level of levelTokens(claimed)) {
      const supported = ids.length > 0
        ? ids.every(id => (vocabulary.parameters.get(id) || new Set()).has(level))
        : vocabulary.levels.has(level);
      if (supported) continue;
      report(WRITER_REJECTION.CHANGED_LEVEL, { section, detail: `${ids.length > 0 ? ids.map(id => `P${id}`).join(',') : 'no_parameter_named'}:${level}` });
    }
  }
  const citedOptionIds = new Set(citedClaims.filter(c => c?.option?.version_id).map(c => c.option.version_id));
  const oneOptionOnly = citedOptionIds.size === 1 && citedClaims.some(c => c?.option?.version_id)
    && citedClaims.every(c => !c?.option?.version_id || citedOptionIds.has(c.option.version_id));
  // A product is scoped by option, role and quantity, never by its name alone —
  // the same product may legitimately appear in more than one option. See
  // writerProductScope.js for the rule and the evidence it reads.
  for (const issue of productScopeViolations({ input, vocabulary, text, citedOptionIds, oneOptionOnly })) {
    context = { text, sentence: issue.sentence, match: issue.token };
    report(issue.code, { section, detail: issue.detail });
  }
  if (p20BlocksConsistency(input)) {
    for (const sentence of sentences) {
      const denied = stripOptionNames(sentence, vocabulary.optionNames);
      if (!isBassConsistencyClaim(denied)) continue;
      const at = Math.max(0, denied.search(CONSISTENCY_ANCHOR));
      if (!NEGATION_SHAPED_CLAIM.test(denied) && (isDenied(denied, at) || isConsistencyCaveat(denied, at))) continue;
      context = { text, sentence, ruleId: 'p20_bass_consistency' };
      report(WRITER_REJECTION.P20_BASS_CONTRADICTION, { section, detail: 'p20_does_not_support_a_bass_consistency_claim' });
      break;
    }
  }
  return found;
}
export default scanProse;