/* TEMPORARY PROBE — deleted after reading. Prints the real pack surface. */
import { describe, it } from 'vitest';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { option, EVIDENCE_AT } from './fixtures/proposalEvidenceFixtures.mjs';
import { buildDesignIntentWriterInput } from '../base44/shared/reportDesignIntent/buildDesignIntentWriterInput.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { hasRecommendationClaim, packProseSentences, wordCount } from '../base44/shared/proposalWriter/writerVocabulary.js';

describe('probe', () => {
  it('prints the pack surface', () => {
    const pack = buildProposalEvidence({ versions: [option('a')], generatedAt: EVIDENCE_AT });
    const input = buildDesignIntentWriterInput({ pack });
    console.log('PROBE_MODE ' + pack.mode + ' | ' + (input.section_structure?.proposal_mode || 'none'));
    console.log('PROBE_CONTRACT ' + input.contract_version + ' PACK ' + pack.pack_fingerprint);
    console.log('PROBE_RECOMMENDATION_CLAIM ' + hasRecommendationClaim(input));
    console.log('PROBE_ALLOWED ' + JSON.stringify((input.allowed_claims || []).map((c) => ({
      id: c.claim_id, kind: c.kind, level: c.level, statement: c.statement,
    }))));
    console.log('PROBE_BLOCKED ' + JSON.stringify((input.blocked_claims || []).map((b) => ({ id: b.block_id, reason: b.reason }))));
    console.log('PROBE_PACK_PROSE ' + JSON.stringify(packProseSentences(input)));
    console.log('PROBE_SECTION ' + JSON.stringify(input.section_requirements[0]));
    const raw = JSON.stringify({
      contract_version: input.contract_version,
      pack_fingerprint: input.evidence_pack.pack_fingerprint,
      sections: [{ section: 'decision_summary', text: 'This room is served by a cinema built around the projection screen the seating is planned from.', claim_ids: [] }],
    });
    const v = validateWriterOutput({ input, output: raw });
    console.log('PROBE_VALID ' + v.valid + ' HAS_OUTPUT_KEY ' + Object.prototype.hasOwnProperty.call(v, 'output'));
    console.log('PROBE_VIOLATIONS ' + JSON.stringify(v.violations.map((x) => `${x.code}|${x.detail}`)));
    console.log('PROBE_SECTIONS ' + JSON.stringify(v.sections));
    console.log('PROBE_WORDCOUNT ' + wordCount('one two three four'));
  });
});