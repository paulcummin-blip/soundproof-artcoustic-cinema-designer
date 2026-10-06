/**
 * useLibraryProposalReadiness
 * ---------------------------
 * The Project Library's readiness read, in the Project Library's words.
 *
 * The read itself is NOT re-implemented: it is the Proposal Centre's own
 * readiness contract (useProposalReadiness + resolveProposalReadinessGate), run
 * over the versions the Library is showing. One authority, so the banner can
 * never say Ready for Proposal while the Proposal Centre blocks, and the
 * Proposal Centre can never block while the banner says Ready.
 *
 * Presentation only on top of that read: reading, never writing.
 *
 * @param {Object} params
 * @param {string|null} params.projectId
 * @param {Array} params.versions — the project's design versions
 * @returns {Object} the Library readiness verdict, plus the read's error/retry
 */

import { useMemo } from 'react';
import { useProposalReadiness } from '@/components/proposal/sourceAuthority/useProposalReadiness';
import { buildLibraryProposalReadiness } from './libraryProposalReadiness';

export function useLibraryProposalReadiness({ projectId = null, versions = [] } = {}) {
  const versionIds = useMemo(
    () => (Array.isArray(versions) ? versions.map((version) => version.id).filter(Boolean) : []),
    [versions],
  );

  const { rows, loading, error, retry } = useProposalReadiness({ projectId, versionIds });

  const readiness = useMemo(
    () => buildLibraryProposalReadiness({ rows, loading, versions }),
    [rows, loading, versions],
  );

  return { ...readiness, error, retry };
}

export default useLibraryProposalReadiness;