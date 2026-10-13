/** TEMPORARY diagnostic (removed after the run). */
import { test } from 'vitest';
import { buildProposalEvidence } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../base44/shared/proposalWriter/writerInputBuilder.js';
import { validateWriterOutput } from '../base44/shared/proposalWriter/writerOutputValidator.js';
import { EVIDENCE_AT as AT, twoOptions } from './fixtures/proposalEvidenceFixtures.mjs';
import { amend } from './fixtures/proposalWriterFixtures.mjs';

const SENTENCES = [
  'Distributing subwoofers between the front and rear helps manage room resonances that produce bass peaks and dips.',
  'The arrangement is intended to improve bass consistency between seating positions.',
  'Four subwoofers provide substantial low-frequency output capability.',
  'The system delivers identical bass at every seat.',
  'The four-subwoofer layout achieves excellent P20 consistency.',
  'The arrangement improves bass response by 6 dB compared with two subwoofers.',
  'Four subwoofers guarantee the elimination of room modes.',
];

test('diagnose every sentence', () => {
  const input = buildWriterInput({ pack: buildProposalEvidence({ versions: twoOptions(), generatedAt: AT }) });
  for (const sentence of SENTENCES) {
    const result = validateWriterOutput({ input, output: amend(input, { section: 'overall_design', sentence }) });
    const own = result.violations.filter((entry) => String(entry.sentence || '').trim() === sentence.trim());
    const noise = result.violations.filter((entry) => String(entry.sentence || '').trim() !== sentence.trim());
    console.log(`SENT: ${sentence}`);
    console.log(`  OWN: ${JSON.stringify(own.map((v) => ({ c: v.code, d: v.detail, s: v.section })))}`);
    console.log(`  NOISE_COUNT: ${noise.length}`);
  }
  const cap = 'Four subwoofers provide substantial low-frequency output capability.';
  const p14 = input.allowed_claims.find((claim) => claim.area === 'p14');
  const supported = validateWriterOutput({
    input,
    output: amend(input, { section: 'dynamic_range', sentence: cap, claim_ids: [p14.claim_id] }),
  });
  console.log('CAPABILITY_CITED:', JSON.stringify(supported.violations
    .filter((v) => String(v.sentence || '').trim() === cap)
    .map((v) => ({ c: v.code, d: v.detail }))));
});