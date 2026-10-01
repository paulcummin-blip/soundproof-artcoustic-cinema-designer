/**
 * useProposalSourceStatus
 * -----------------------
 * Resolves the proposal source status for one project version from the
 * authorities that already exist in the app:
 *
 *   - the durable Published Engineering Authority for the version
 *     (ProjectVersion.published_fingerprint → ProjectAnalysisCache publication)
 *     — this is the source both reports are rendered from
 *   - the frozen Engineering Snapshot identity (project + version verification)
 *   - the live design indicators (design moved on / recalculation in flight)
 *
 * It recalculates nothing and generates no report content. Reading only.
 *
 * @param {Object} params
 * @param {string|null} params.projectId
 * @param {string|null} params.versionId
 * @param {Object|null} [params.version]            — ProjectVersion record (for the name)
 * @param {Object|null} [params.engineeringSnapshot] — frozen snapshot from useVersionedEngineeringSnapshot
 * @param {boolean} [params.loading]                 — the snapshot read is still in flight
 * @returns {Object} { status, loading }
 */

import { useMemo } from 'react';
import { useVersionedEngineeringAuthority } from '@/components/engineering/useVersionedEngineeringAuthority';
import {
  readSeatPriorityFingerprint,
  readBassPendingIndicator,
  readAsdrUnavailableIndicator,
} from '@/components/state/designReviewHandoff';
import {
  resolveProposalSource,
  verifySourceIdentity,
  PROPOSAL_SOURCE_STATE,
} from './proposalSourceAuthority';

export function useProposalSourceStatus({
  projectId = null,
  versionId = null,
  version = null,
  engineeringSnapshot = null,
  loading = false,
} = {}) {
  const authority = useVersionedEngineeringAuthority(projectId, versionId);
  const publication = authority.publication || null;
  const pointer = authority.version?.published_fingerprint || null;

  const status = useMemo(() => {
    const hasSource = !!publication;
    const identity = verifySourceIdentity({
      projectId,
      versionId,
      sourceProjectId: engineeringSnapshot?.identity?.projectId || authority.snapshot?.projectId || null,
      sourceVersionId: engineeringSnapshot?.identity?.versionId || authority.snapshot?.versionId || null,
    });

    // The design moved on: the live seat-priority fingerprint no longer matches
    // the one the published report was generated from.
    const liveSeatPriority = readSeatPriorityFingerprint(projectId);
    const publishedSeatPriority =
      authority.snapshot?.rating?.seatPriorityFingerprint
      || authority.snapshot?.engineeringSummary?.seatPriorityFingerprint
      || null;
    const designMovedOn = !!(
      liveSeatPriority
      && publishedSeatPriority
      && liveSeatPriority !== publishedSeatPriority
    );

    const provisional = resolveProposalSource({
      projectId,
      versionId,
      versionName: version?.version_name || null,
      hasSource,
      identityVerified: identity.ok,
      identityMismatches: identity.mismatches,
      designMovedOn,
      recalculationPending: readBassPendingIndicator(projectId),
      unavailable: readAsdrUnavailableIndicator(projectId),
      reportGeneratedAt: publication?.published_at || authority.snapshot?.publishedAt || null,
      sourceFingerprint: publication?.engineering_fingerprint || authority.snapshot?.engineeringFingerprint || null,
    });

    // A dangling pointer with no publication behind it is stale, not missing:
    // something was generated and has since been superseded.
    if (!hasSource && pointer) {
      const stale = { ...provisional, state: PROPOSAL_SOURCE_STATE.STALE, ready: false };
      return {
        ...stale,
        reports: Object.fromEntries(
          Object.entries(stale.reports).map(([key, report]) => [key, {
            ...report,
            state: PROPOSAL_SOURCE_STATE.STALE,
            status: 'Stale',
            reason: `${report.label} was generated from an earlier design and no longer matches this version.`,
            action: `Regenerate ${report.label}`,
          }]),
        ),
        message: provisional.message,
      };
    }

    return provisional;
  }, [
    projectId,
    versionId,
    version?.version_name,
    publication,
    pointer,
    authority.snapshot,
    engineeringSnapshot,
  ]);

  return {
    status,
    loading: loading || authority.loading,
  };
}

export default useProposalSourceStatus;