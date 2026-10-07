/** Internal audit identity. The source manifest is SHA-256 checked by regression tests. */
import { proposalEvidenceFingerprint } from '../proposalEvidence/proposalEvidenceBuilder.js';
import { VALIDATOR_SOURCE_MANIFEST } from './validatorSourceManifest.js';
export const VALIDATOR_VERSION = 'proposal-validator-3';
export function validatorProvenance(input = null) {
  return {
    validator_version: VALIDATOR_VERSION,
    validator_rules_fingerprint: `vr3-${proposalEvidenceFingerprint(VALIDATOR_SOURCE_MANIFEST)}`,
    validator_source_manifest: { ...VALIDATOR_SOURCE_MANIFEST },
    writer_rules_fingerprint: input ? `wr-${proposalEvidenceFingerprint(input.writing_rules || [])}` : null,
    deployed_function_revision: null,
  };
}