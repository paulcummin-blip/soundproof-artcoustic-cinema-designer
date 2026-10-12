/** Existing prose checks, with clause-independent grounding and internal attribution. */
import { isBassConsistencyClaim } from '../proposalEvidence/proposalEvidenceWording.js';
import { WRITER_REJECTION, violation } from './writerContractSchema.js';
import { claimLevels, hasRecommendationClaim, isPackProse, isRecommendation, kindSatisfiesAssertion, levelTokens, measurementTokens, p20BlocksConsistency, packProseSentences, parameterIds, seatScopeInText, sentenceParts, stripOptionNames, blockedChangeBlocks, blockPatterns } from './writerVocabulary.js';
import { anchorPatternFor, assertedKind, assumedParameterIssue, claimsArea, isDenied, isConsistencyCaveat, seatConsistencyClaim, scopedClaimIssue, referencePositionScopeIssue, CHANNEL_FAMILY, CHANGE_SIGNAL, CONSISTENCY_ANCHOR, NEGATION_SHAPED_CLAIM } from './writerOutputTextRules.js';
import { productScopeViolations } from './writerProductScope.js';
import { frontStageScopeViolations } from './writerFrontStageRules.js';
import { designStageCommentary } from './writerDesignStageRules.js';
import { verificationDisclaimer } from './writerVerificationDisclaimerRules.js';
import { validationRegisterPhrase } from './writerValidationRegister.js';
import { framingContrastGrounded, independentClauses, supportedChangeClause } from './writerClausePrecision.js';
import {
  displayTerminologyIssue,
  displayTypeOfPack,
  installationStateClaim,
  isSingleOptionProposal,
  reportVoicePhrase,
  unsupportedComparative,
} from './writerEditorialRules.js';
import { attributeViolation } from './writerViolationAudit.js';
import { internalLevelLanguage, unexplainedOverhead, singleOptionFraming, tonalScopeStretch, proposalSentences } from './writerSalesPolishRules.js';
import { emDashAt, genericClaimPhrase, stockConnective } from './writerNaturalWritingRules.js';
import { timbreInterGroupMatchIssue } from './writerTimbreMetricAuthority.js';

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

  // THE PUNCTUATION RULE, read on the section text as written, before any clause
  // reading: client-facing copy carries no em dash (U+2014) at all. Nothing is
  // normalised or rewritten here, and the figure, product and evidence tokens in
  // the sentence are left exactly as the writer wrote them: the copy is refused so
  // the sentence itself is rewritten.
  const dashAt = emDashAt(text);
  if (dashAt !== null) {
    context = { text, sentence: text.slice(Math.max(0, dashAt - 40), dashAt + 40), match: text.slice(dashAt, dashAt + 1) };
    report(WRITER_REJECTION.EM_DASH_IN_NARRATIVE, { section, detail: 'em_dash_in_client_facing_copy' });
    context = { text };
  }
  // A RESULT-LED draft (the single-option proposal path) cites strength stories
  // and, where the designer's own brief asked for a result the ranked stories do
  // not carry, the supporting result minted for that request. There is no
  // comparison in it, so it mints no shared-result, material-gain, factual-change
  // or recommendation claim at all: nothing in the pack could satisfy a gain, a
  // same or a recommendation assertion, so those assertions are grounded by the
  // ranked story and the brief's supporting results instead. A supporting result
  // only carries that bypass in a SINGLE-option pack, where no other claim kind
  // exists; a comparison pack keeps the ordinary kind rules for it. The gain and
  // recommendation rules below therefore apply only where the draft is not
  // result-led.
  const singleOptionPack = isSingleOptionProposal(
    input?.section_structure?.proposal_mode ?? input?.evidence_pack?.mode,
  );
  const resultLed = citedKinds.length > 0 && citedKinds.every((kind) => kind === 'strength_story'
    || (singleOptionPack && kind === 'supporting_result'));
  // The proposal mode and the frozen display the pack states. A single-option
  // proposal has nothing to compare against, and a TV is never written as a
  // screen, an aspect ratio or a projector.
  const singleOption = singleOptionPack;
  const displayType = displayTypeOfPack(input?.evidence_pack);

  // Read complete sentences before clause splitting: tonal scope can stretch in a second clause.
  for (const sentence of proposalSentences(text)) {
    const named = stripOptionNames(sentence, vocabulary.optionNames);
    // Opt-in by the frozen agreement; earlier generations gain no new rejection.
    const register = input?.editorial_rules?.validation_register && validationRegisterPhrase(named);
    if (register) {
      context = { text, sentence, match: register.match, ruleId: `validation_register:${register.rule}` };
      report(WRITER_REJECTION.VALIDATION_REGISTER, { section, detail: register.rule });
    }
    const checks = [
      [internalLevelLanguage(named), WRITER_REJECTION.INTERNAL_LEVEL_LANGUAGE, 'narrative_level_language'],
      [unexplainedOverhead(sentence), WRITER_REJECTION.UNEXPLAINED_ABBREVIATION, 'unexplained_OH'],
      [singleOption && singleOptionFraming(named), WRITER_REJECTION.SINGLE_OPTION_FRAMING, 'single_option_decision_filler'],
      [tonalScopeStretch(sentence, citedClaims), WRITER_REJECTION.TONAL_SCOPE_STRETCH, 'tonal_evidence_is_not_whole_experience_equality'],
    ];
    for (const [applies, code, rule] of checks) {
      if (!applies) continue;
      context = { text, sentence, ruleId: `sales_polish:${rule}` };
      report(code, { section, detail: rule });
    }
  }

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
      } else if (kind && !framingGrounded && ((!kindSatisfiesAssertion(kind, citedKinds) && !resultLed)
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
      if (isRecommendation(clause) && !hasRecommendationClaim(input) && !resultLed) {
        report(WRITER_REJECTION.UNSUPPORTED_RECOMMENDATION, { section, detail: 'the_pack_allows_no_recommendation' });
      }
      const designStage = designStageCommentary(claimed);
      if (designStage) {
        context.ruleId = `design_stage_commentary:${designStage.rule}`;
        report(WRITER_REJECTION.DESIGN_STAGE_COMMENTARY, { section, detail: `design_stage_commentary:${designStage.rule}` });
      }
      // A capability is never made conditional on a future process: the proposal
      // states what the design provides, confidently, and stops there.
      const verification = verificationDisclaimer(claimed);
      if (verification) {
        context.ruleId = `verification_disclaimer:${verification.rule}`;
        report(WRITER_REJECTION.VERIFICATION_DISCLAIMER, { section, detail: `verification_disclaimer:${verification.rule}` });
      }
      // The natural-writing standard: a natural transition instead of a stock
      // connective, and a project-specific explanation instead of a generic claim.
      const connective = stockConnective(claimed);
      if (connective) {
        context.ruleId = `natural_writing:${connective.phrase.toLowerCase().split(' ').join('_')}`;
        report(WRITER_REJECTION.STOCK_CONNECTIVE, { section, detail: `stock_connective:${connective.phrase.toLowerCase().split(' ').join('_')}` });
      }
      const generic = genericClaimPhrase(claimed);
      if (generic) {
        context.ruleId = `natural_writing:${generic.phrase.split(' ').join('_')}`;
        report(WRITER_REJECTION.GENERIC_MARKETING_PHRASE, { section, detail: `generic_claim_phrase:${generic.phrase.split(' ').join('_')}` });
      }
      // ── the editorial rules of the proposal voice ──
      // These read HOW a supported fact is written, never whether it is
      // supported: the software-report register, the comparative language a
      // single-option proposal has nothing to compare against, an
      // installation-state claim, and terminology that misdescribes the frozen
      // display. Grounding is untouched.
      const reportVoice = reportVoicePhrase(claimed, { section });
      if (reportVoice) {
        context.ruleId = `report_voice:${reportVoice.rule}`;
        report(WRITER_REJECTION.REPORT_VOICE, { section, detail: `report_voice:${reportVoice.rule}` });
      }
      const comparative = singleOption ? unsupportedComparative(claimed) : null;
      if (comparative) {
        context.ruleId = `unsupported_comparative:${comparative.rule}`;
        report(WRITER_REJECTION.UNSUPPORTED_COMPARATIVE, {
          section, detail: `single_option_has_no_baseline_to_compare_against:${comparative.rule}`,
        });
      }
      const installation = installationStateClaim(claimed);
      if (installation) {
        context.ruleId = `installation_state:${installation.rule}`;
        report(WRITER_REJECTION.INSTALLATION_STATE_CLAIM, { section, detail: `installation_state_claim:${installation.rule}` });
      }
      const displayIssue = displayTerminologyIssue({ text: claimed, displayType });
      if (displayIssue) {
        context.ruleId = `display_terminology:${displayIssue.rule}`;
        report(WRITER_REJECTION.DISPLAY_TERMINOLOGY, { section, detail: `tv_display_terminology:${displayIssue.rule}` });
      }
      // An assumed or administrative parameter is never referenced unless the
      // designer asked for it, and then only as a labelled assumption.
      const assumedIssue = assumedParameterIssue({
        sentence: claimed,
        policy: input?.assumed_parameter_policy || null,
        packProse,
      });
      if (assumedIssue) {
        context.ruleId = `assumed_parameter:${assumedIssue}`;
        report(WRITER_REJECTION.ASSUMED_PARAMETER_MENTION, { section, detail: assumedIssue });
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
      // A seat-to-seat frequency-response result is never a match between
      // loudspeaker groups: see writerTimbreMetricAuthority.js for what P16 and
      // P17 measure and the boundary this reads against the cited claims.
      const timbreIssue = timbreInterGroupMatchIssue({ text: claimed, claims: citedClaims, packProse });
      if (timbreIssue) {
        context.ruleId = `timbre_metric:${timbreIssue}`;
        report(WRITER_REJECTION.TIMBRE_INTER_GROUP_MATCH, { section, detail: timbreIssue });
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
  // The screen stage of a design whose centre channel is built from two physical
  // centre cabinets is never collapsed into one LCR of the left/right model —
  // see writerFrontStageRules.js for the rule and the pack fact it reads. A pack
  // that states no dual-centre stage reports nothing here.
  for (const issue of frontStageScopeViolations({ input, text, packProse })) {
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