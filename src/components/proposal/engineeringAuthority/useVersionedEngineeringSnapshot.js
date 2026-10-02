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

import { useEffect, useMemo, useState } from 'react';
import {
  readProjectRecord,
  readProjectVersionRecord,
} from '@/components/state/projectReadCache';
import { mergeProjectAndVersion } from '@/lib/versionAuthority';
import { useEngineeringSnapshot } from './useEngineeringSnapshot';
import { useVersionedEngineeringAuthority } from '@/components/engineering/useVersionedEngineeringAuthority';

export function useVersionedEngineeringSnapshot(projectId, versionId, options = {}) {
  const [loading, setLoading] = useState(!!projectId);
  const [error, setError] = useState(null);
  const [project, setProject] = useState(null);
  const [version, setVersion] = useState(null);

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
        const nextProject = await readProjectRecord(projectId);
        if (cancelled) return;
        if (!nextProject) throw new Error('Project not found.');

        const targetVersionId = versionId || nextProject.active_version_id || null;
        let nextVersion = null;
        if (targetVersionId) {
          nextVersion = await readProjectVersionRecord(targetVersionId);
          if (cancelled) return;
        }

        setProject(nextProject);
        setVersion(nextVersion);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setProject(null);
        setVersion(null);
        setLoading(false);
        setError(err?.message || 'Failed to load project/version metadata.');
      }
    })();

    return () => { cancelled = true; };
  }, [projectId, versionId]);

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
    priceCalculation: publishedEngineering?.priceData || null,
    proposalAssets: options.proposalAssets,
    brandAsset: options.brandAsset,
    proposalMetadata: options.proposalMetadata,
    assumedLevels: options.assumedLevels,
    assessmentModes: options.assessmentModes,
  });

  const finalError = authority.readFailed
    ? (authority.readError || 'Saved engineering authority could not be read.')
    : error || snapshotResult.error;
  return {
    snapshot: snapshotResult.snapshot,
    loading: loading || authority.loading || snapshotResult.loading,
    error: finalError,
    project,
    version,
    authorityState: authority.state,
    authoritySource: authority.source,
    readFailed: authority.readFailed,
    retry: authority.retry,
    isReady: !loading && !authority.loading && !!snapshotResult.snapshot && !finalError,
  };
}