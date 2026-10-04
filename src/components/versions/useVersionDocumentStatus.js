/**
 * useVersionDocumentStatus
 * ------------------------
 * The version switcher's data layer. When the switcher is opened it reads the
 * project's saved reports and saved proposals once, and derives per-version
 * status from them with versionDocumentStatus.js.
 *
 * The read is lazy (enabled only while the switcher is open), so opening Room
 * Designer costs nothing extra. No entity is written.
 */

import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { deriveVersionDocumentStatus } from '@/components/versions/versionDocumentStatus';

const REPORT_LIMIT = 100;
const PROPOSAL_LIMIT = 100;

const asItems = (result) => (Array.isArray(result) ? result : (result?.items || []));

export function useVersionDocumentStatus({ projectId, enabled = false } = {}) {
  const [snapshots, setSnapshots] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !projectId) return undefined;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [snapshotPage, proposalPage] = await Promise.all([
          base44.entities.ReportSnapshot.filter(
            { project_id: projectId },
            { sort: '-generated_at', limit: REPORT_LIMIT },
          ),
          base44.entities.Proposal.filter(
            { project_id: projectId },
            { sort: '-updated_date', limit: PROPOSAL_LIMIT },
          ),
        ]);
        if (cancelled) return;
        setSnapshots(asItems(snapshotPage));
        setProposals(asItems(proposalPage));
      } catch (error) {
        console.error('[useVersionDocumentStatus] Status read failed:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, enabled]);

  const statusByVersionId = useMemo(
    () => deriveVersionDocumentStatus({ snapshots, proposals }),
    [snapshots, proposals],
  );

  return { loading, statusByVersionId };
}

export default useVersionDocumentStatus;