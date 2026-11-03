import { syntheticContractFromRetainedEvidence } from '@/lib/bassEvidencePublication';

/**
 * Read the immutable bass contract named by the report's publication — never
 * the current bass store. Authority order:
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
 * @param {Array<object>} rows - ProjectAnalysisCache records for the version
 * @param {object} publication - the immutable engineering publication (cleaned)
 */
export default function frozenReportBass(rows, publication) {
  const fingerprint = publication?.provenance?.bass_fingerprint;
  const retainedContract = syntheticContractFromRetainedEvidence(publication);
  const contract = retainedContract
    || (rows || []).map(row => row.completed_by_fingerprint?.[fingerprint]).find(Boolean)
    || null;
  const fromRetained = !!retainedContract;
  return {
    contract,
    authoritative: !!contract,
    hydrationSettled: true,
    projectId: `${publication?.report_snapshot?.report_project?.project_id}::${publication?.report_snapshot?.report_project?.version_id}`,
    currentFingerprint: fingerprint,
    authorityStatus: contract ? 'CURRENT' : 'ERROR',
    source: fromRetained ? 'publication-retained' : (contract ? 'legacy-cache' : 'unavailable'),
  };
}