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

export function useVersionDocumentStatus({ projectId, enabled = false, versions = [] } = {}) {
  const [snapshots, setSnapshots] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [publicationsByVersion, setPublicationsByVersion] = useState(null);
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

        // Read each version's engineering_publications map so a fingerprint
        // mismatch is judged by the SAME canonical design-fact comparison the
        // Document Workflow cards use. One cache record per version; the
        // switcher is only open momentarily and the version count is small.
        const versionList = (Array.isArray(versions) ? versions : [])
          .filter((v) => v?.id && v.published_fingerprint);
        if (versionList.length > 0) {
          const cacheEntries = await Promise.all(
            versionList.map(async (version) => {
              try {
                const cachePage = await base44.entities.ProjectAnalysisCache.filter(
                  { project_id: projectId, version_id: version.id },
                  { limit: 1 },
                );
                const cache = asItems(cachePage)[0] || null;
                return [version.id, cache?.engineering_publications || null];
              } catch {
                return [version.id, null];
              }
            }),
          );
          if (!cancelled) {
            setPublicationsByVersion(new Map(cacheEntries));
          }
        } else {
          setPublicationsByVersion(null);
        }
      } catch (error) {
        console.error('[useVersionDocumentStatus] Status read failed:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, enabled, versions]);

  const statusByVersionId = useMemo(
    () => deriveVersionDocumentStatus({
      snapshots,
      proposals,
      // Each version's CURRENT durable authority, so the canonical report row is
      // resolved against the design the version holds now.
      currentFingerprintByVersion: new Map(
        (Array.isArray(versions) ? versions : []).map((version) => [
          version.id,
          version.published_fingerprint || null,
        ]),
      ),
      // The same engineering_publications the Document Workflow cards read, so a
      // fingerprint mismatch is judged by the same canonical design-fact
      // comparison — not a second independent calculation.
      publicationsByVersion,
    }),
    [snapshots, proposals, versions, publicationsByVersion],
  );

  return { loading, statusByVersionId };
}

export default useVersionDocumentStatus;