/**
 * Load version metadata and consume the ONE version-scoped engineering
 * authority.
 *
 * This hook is intentionally read-only: it does not hydrate AppState and does
 * not mount a second RP22, bass, rating, grouping, or grading engine.
 *
 * Authority order (see versionedEngineeringAuthority.js):
 *   1. durable DB publication — ProjectVersion.published_fingerprint →
 *      ProjectAnalysisCache.engineering_publications["eng:v1:…"]
 *   2. same-window/ browser handoff — an optimisation only
 *
 * A cold load with empty site storage therefore still resolves the settled
 * engineering result, so Proposal Centre no longer reports "not calculated"
 * for a project that has been calculated.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { runReadinessRead } from '@/components/proposal/sourceAuthority/proposalReadDeadline';
import {
  readProjectRecord,
  readProjectVersionRecord,
  invalidateProjectRead,
  invalidateProjectVersionRead,
} from '@/components/state/projectReadCache';
import { mergeProjectAndVersion } from '@/lib/versionAuthority';
import { selectCanonicalReportSnapshotsByKey } from '@/components/report/reportSnapshotCanonical';
import { useEngineeringSnapshot } from './useEngineeringSnapshot';
import { useVersionedEngineeringAuthority } from '@/components/engineering/useVersionedEngineeringAuthority';

export function useVersionedEngineeringSnapshot(projectId, versionId, options = {}) {
  const [readAttempt, setReadAttempt] = useState(0);
  const [loading, setLoading] = useState(!!projectId);
  const [error, setError] = useState(null);
  const [project, setProject] = useState(null);
  const [version, setVersion] = useState(null);
  // The saved Project Report's priceData — the commercial pricing the report
  // actually documents, frozen at generation time against the Product Master
  // then current. Preferred over the engineering publication's earlier-frozen
  // priceData so the Proposal Centre receives the pricing associated with the
  // same project/version and report snapshot.
  const [savedReportPriceData, setSavedReportPriceData] = useState(null);

  // The single version-scoped engineering authority (durable first).
  const authority = useVersionedEngineeringAuthority(projectId, versionId);
  const publishedEngineering = authority.snapshot;

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      setLoading(false);
      setError(null);
      setProject(null);
      setVersion(null);
      return undefined;
    }

    setLoading(true);
    setError(null);
    (async () => {
      try {
        const nextProject = await runReadinessRead('project details', () => readProjectRecord(projectId));
        if (cancelled) return;
        if (!nextProject) throw new Error('Project not found.');

        const targetVersionId = versionId || nextProject.active_version_id || null;
        let nextVersion = null;
        if (targetVersionId) {
          nextVersion = await runReadinessRead('selected design version', () => readProjectVersionRecord(targetVersionId));
          if (cancelled) return;
        }

        setProject(nextProject);
        setVersion(nextVersion);
        setLoading(false);

        // The Proposal Centre's commercial pricing comes from the SAME saved
        // Project Report the readiness gate judges. Its priceData was frozen at
        // report generation time against the Product Master then current, so it
        // carries the prices the report actually documents (£4,500 ex / £5,400
        // inc / 0 incomplete). The engineering publication's own priceData is
        // frozen earlier — at publication time — and grows stale when prices
        // change after publication, so it is only a fallback when no saved
        // report exists for this version.
        try {
          const targetVersionIdForReport = versionId || nextProject.active_version_id || null;
          if (targetVersionIdForReport) {
            const snapshotPage = await base44.entities.ReportSnapshot.filter(
              { project_id: projectId, version_id: targetVersionIdForReport, report_type: 'project' },
              { sort: '-generated_at', limit: 50 },
            );
            if (cancelled) return;
            const snapshotRows = Array.isArray(snapshotPage) ? snapshotPage : (snapshotPage?.items || []);
            const currentFingerprintByVersion = new Map([
              [targetVersionIdForReport, nextVersion?.published_fingerprint || null],
            ]);
            const byKey = selectCanonicalReportSnapshotsByKey(snapshotRows, { currentFingerprintByVersion });
            const savedReport = byKey.get(`${targetVersionIdForReport}::project`) || null;
            setSavedReportPriceData(savedReport?.payload?.presentation?.priceData || null);
          }
        } catch {
          if (!cancelled) setSavedReportPriceData(null);
        }
      } catch (err) {
        if (cancelled) return;
        setProject(null);
        setVersion(null);
        setLoading(false);
        setError(err?.message || 'Failed to load project/version metadata.');
      }
    })();

    return () => { cancelled = true; };
  }, [projectId, versionId, readAttempt]);

  const effectiveVersionId = versionId || version?.id || project?.active_version_id || null;
  const mergedProject = useMemo(
    () => (project ? mergeProjectAndVersion(project, version) : null),
    [project, version],
  );

  const snapshotResult = useEngineeringSnapshot({
    projectId,
    versionId: effectiveVersionId,
    project,
    version,
    mergedProject,
    publishedEngineering,
    seats: publishedEngineering?.seatingPositions || [],
    placedSpeakers: publishedEngineering?.placedSpeakers || [],
    priceCalculation: savedReportPriceData || publishedEngineering?.priceData || null,
    proposalAssets: options.proposalAssets,
    brandAsset: options.brandAsset,
    proposalMetadata: options.proposalMetadata,
    assumedLevels: options.assumedLevels,
    assessmentModes: options.assessmentModes,
  });

  const retry = useCallback(() => {
    invalidateProjectRead(projectId);
    if (versionId) invalidateProjectVersionRead(versionId);
    authority.retry();
    setReadAttempt(value => value + 1);
  }, [projectId, versionId, authority.retry]);

  const finalError = authority.readFailed
    ? (authority.readError || 'Saved engineering results could not be read.')
    : error || snapshotResult.error;
  return {
    snapshot: snapshotResult.snapshot,
    loading: !finalError && (loading || authority.loading || snapshotResult.loading),
    error: finalError,
    project,
    version,
    authorityState: authority.state,
    authoritySource: authority.source,
    readFailed: authority.readFailed || !!error,
    retry,
    isReady: !loading && !authority.loading && !!snapshotResult.snapshot && !finalError,
  };
}