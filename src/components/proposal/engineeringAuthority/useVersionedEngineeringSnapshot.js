/**
 * Load version metadata and consume the Room Designer's published engineering
 * authority. This hook is intentionally read-only: it does not hydrate AppState
 * and does not mount a second RP22, bass, rating, grouping, or grading engine.
 */

import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { mergeProjectAndVersion } from '@/lib/versionAuthority';
import {
  readDesignReviewHandoff,
  subscribeDesignReviewHandoff,
} from '@/components/state/designReviewHandoff';
import { useEngineeringSnapshot } from './useEngineeringSnapshot';

export function useVersionedEngineeringSnapshot(projectId, versionId, options = {}) {
  const [loading, setLoading] = useState(!!projectId);
  const [error, setError] = useState(null);
  const [project, setProject] = useState(null);
  const [version, setVersion] = useState(null);
  const [publishedEngineering, setPublishedEngineering] = useState(
    () => (projectId ? readDesignReviewHandoff(projectId) : null),
  );

  useEffect(() => {
    if (!projectId) {
      setPublishedEngineering(null);
      return undefined;
    }
    setPublishedEngineering(readDesignReviewHandoff(projectId));
    return subscribeDesignReviewHandoff(projectId, (snapshot, fromStorage) => {
      setPublishedEngineering(
        snapshot || (fromStorage ? readDesignReviewHandoff(projectId, { preferStored: true }) : null),
      );
    });
  }, [projectId]);

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
        const projects = await base44.entities.Project.filter({ id: projectId });
        if (cancelled) return;
        const nextProject = Array.isArray(projects) && projects.length ? projects[0] : null;
        if (!nextProject) throw new Error('Project not found.');

        const targetVersionId = versionId || nextProject.active_version_id || null;
        let nextVersion = null;
        if (targetVersionId) {
          const versions = await base44.entities.ProjectVersion.filter({ id: targetVersionId });
          if (cancelled) return;
          nextVersion = Array.isArray(versions) && versions.length ? versions[0] : null;
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

  const finalError = error || snapshotResult.error;
  return {
    snapshot: snapshotResult.snapshot,
    loading: loading || snapshotResult.loading,
    error: finalError,
    project,
    version,
    isReady: !loading && !!snapshotResult.snapshot && !finalError,
  };
}
