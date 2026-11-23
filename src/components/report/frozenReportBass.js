import { syntheticContractFromRetainedEvidence } from '@/lib/bassEvidencePublication';
import { isAuthoritativeBassContract } from '@/components/room/bass/completedBassResultPersistence';
import { verifyFrozenBassAuthority } from './frozenBassAuthorityVerification';

/**
 * Read the immutable bass contract named by the report's publication — never
 * the current bass store. Authority order for GRAPH RENDERING:
 *
 *   1. publication-retained bass evidence (publication.bass_evidence) — PRIMARY.
 *      The immutable publication carries a copy of the authoritative graphPayload
 *      frozen at publish time, so the report renders its own P19 graph even after
 *      the bounded completed_by_fingerprint map has evicted the matching
 *      contract. No recalculation, no current-design substitution.
 *   2. completed_by_fingerprint matching the publication's bass fingerprint —
 *      LEGACY FALLBACK for publications created before retained evidence existed.
 *   3. unavailable — reported honestly; no graph is fabricated or substituted.
 *
 * AUTHORITY VERIFICATION is separate from graph rendering. The frozen bass
 * authority is verified against the matching complete saved cache contract and
 * authority receipt (verifyFrozenBassAuthority). Only when that proof
 * establishes the same authoritative calculation is `authoritative` set to
 * true and `authorityStatus` set to 'AUTHORITATIVE'.
 *
 * @param {Array<object>} rows - ProjectAnalysisCache records for the version
 * @param {object} publication - the immutable engineering publication (cleaned)
 */
export default function frozenReportBass(rows, publication) {
  const fingerprint = publication?.provenance?.bass_fingerprint;
  const retainedContract = syntheticContractFromRetainedEvidence(publication);
  const cacheContract = (rows || [])
    .map(row => row.completed_by_fingerprint?.[fingerprint])
    .find(Boolean) || null;

  // The retained contract is for graph rendering; the cache contract is
  // used for authority verification. Use the retained contract for the
  // graph if available, fall back to the cache contract.
  let contract = retainedContract || cacheContract;
  const fromRetained = !!retainedContract;

  // Verify against the matching complete saved cache contract and authority
  // receipt. Only when the proof establishes the same authoritative
  // calculation is the frozen authority accepted.
  let verification;
  try {
    verification = verifyFrozenBassAuthority(rows, publication, isAuthoritativeBassContract);
  } catch (e) {
    verification = { verified: false, reason: 'verification-error', contract: null };
  }

  if (verification.verified) contract = verification.contract;
  return {
    contract,
    authoritative: verification.verified,
    hydrationSettled: true,
    projectId: `${publication?.report_snapshot?.report_project?.project_id}::${publication?.report_snapshot?.report_project?.version_id}`,
    currentFingerprint: fingerprint,
    authorityStatus: verification.verified ? 'AUTHORITATIVE' : 'ERROR',
    source: fromRetained ? 'publication-retained' : (cacheContract ? 'legacy-cache' : 'unavailable'),
    verificationReason: verification.reason,
  };
}