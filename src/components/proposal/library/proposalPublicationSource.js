/**
 * Extend the existing proposal source verdict with the same conservative frozen
 * publication comparison used by Step 3. Reads only; never updates fingerprints.
 */
import { resolveProposalSourceState, proposalVersionIds } from './proposalSourceState.js';
import { proposalEvidenceDifferenceIsSafe } from '@/components/report/designIdentityComparison';

export async function resolveProposalPublicationSource({
  proposal, versionsById, savedReportsByVersionId, readPublication,
}) {
  const strict = resolveProposalSourceState({ proposal, versionsById, savedReportsByVersionId });
  const ids = proposalVersionIds(proposal);
  const frozen = proposal?.engineering_snapshot?.identity?.engineeringFingerprint
    || proposal?.engineering_snapshot?.engineeringFingerprint || null;
  const current = ids.length === 1 ? versionsById.get(ids[0])?.published_fingerprint : null;
  const exact = Boolean(frozen && current && frozen === current);
  // Comparison proposals retain their existing strict per-version verdict.
  if (ids.length !== 1 || !proposal?.project_id || !frozen || !current
    || strict.state === 'missing_source') return { ...strict, frozenProposalMatchesCurrent: exact };
  const reportFingerprint = savedReportsByVersionId.get(ids[0])?.project?.source_fingerprints?.engineeringFingerprint;
  if (!reportFingerprint) return { ...strict, frozenProposalMatchesCurrent: exact };
  const fingerprints = [...new Set([frozen, reportFingerprint])];
  if (fingerprints.every(fp => fp === current)) return { ...strict, frozenProposalMatchesCurrent: true };
  try {
    const read = fp => readPublication(proposal.project_id, ids[0], { engineeringFingerprint: fp });
    const [now, ...historical] = await Promise.all([read(current), ...fingerprints.map(read)]);
    if (now?.publication?.engineering_fingerprint !== current) return { ...strict, frozenProposalMatchesCurrent: exact };
    const safe = historical.every((entry, index) => entry?.publication?.engineering_fingerprint === fingerprints[index]
      && (fingerprints[index] === current || proposalEvidenceDifferenceIsSafe(entry.publication, now.publication)));
    if (!safe) return { ...strict, frozenProposalMatchesCurrent: exact };
    return {
      ...strict, state: 'current', label: 'Current', reason: null,
      changedVersionNames: [], missingVersionNames: [],
      versionStates: strict.versionStates.map(row => ({ ...row, state: 'current', reason: null })),
      frozenProposalMatchesCurrent: true,
    };
  } catch {
    // Failed or incomplete reads never establish equivalence.
    return { ...strict, frozenProposalMatchesCurrent: exact };
  }
}
