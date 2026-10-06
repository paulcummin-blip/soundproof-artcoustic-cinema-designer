// TEMPORARY audit helper: prints the Marquee proposalEvidence pack fingerprint
// from the pre-fix code (snapshotted in ./.pack-old) and from the fixed code, so
// the Phase 1 safety fix can state a before/after. Deleted once recorded.
import { test } from 'vitest';
import { EVIDENCE_AT, marqueeOptions } from './fixtures/proposalEvidenceFixtures.mjs';
import { buildProposalEvidence as buildAfter } from '../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildProposalEvidence as buildBefore } from './.pack-old/shared/proposalEvidence/proposalEvidenceBuilder.js';

test('marquee pack fingerprint, before and after', () => {
  const before = buildBefore({ versions: marqueeOptions(), generatedAt: EVIDENCE_AT });
  const after = buildAfter({ versions: marqueeOptions(), generatedAt: EVIDENCE_AT });
  console.log(`MARQUEE_FINGERPRINT_BEFORE=${before.pack_fingerprint}`);
  console.log(`MARQUEE_FINGERPRINT_AFTER=${after.pack_fingerprint}`);
});