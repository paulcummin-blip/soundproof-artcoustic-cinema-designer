/** Internal audit identity. The source manifest is SHA-256 checked by regression tests. */
import { proposalEvidenceFingerprint } from '../proposalEvidence/proposalEvidenceBuilder.js';
import { VALIDATOR_SOURCE_MANIFEST } from './validatorSourceManifest.js';
/**
 * Bumped to 4 for the natural-writing pass: the em dash, the stock connective, the
 * generic marketing phrase and the mechanically repeated paragraph opener are
 * refused, so a draft written under the standard and one written before it stay
 * distinguishable in the append-only audit history.
 */
export const VALIDATOR_VERSION = 'proposal-validator-4';
export function validatorProvenance(input = null) {
  return {
    validator_version: VALIDATOR_VERSION,
    validator_rules_fingerprint: `vr4-${proposalEvidenceFingerprint(VALIDATOR_SOURCE_MANIFEST)}`,
    validator_source_manifest: { ...VALIDATOR_SOURCE_MANIFEST },
    writer_rules_fingerprint: input ? `wr-${proposalEvidenceFingerprint(input.writing_rules || [])}` : null,
    deployed_function_revision: null,
  };
}