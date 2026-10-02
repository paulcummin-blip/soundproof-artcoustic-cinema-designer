/**
 * useVersionedEngineeringAuthority
 * --------------------------------
 * Version-scoped engineering authority hook.
 *
 * Reads the DURABLE DB publication (ProjectVersion.published_fingerprint →
 * ProjectAnalysisCache.engineering_publications) as the authority, and overlays
 * the same-window browser handoff as an optimisation. On a cold load with empty
 * site storage the durable read still resolves, so consumers no longer report
 * "not calculated" for a project that has been calculated.
 *
 * Read-only: mounts no engine, recalculates nothing, publishes nothing.
 */

import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  classifyAuthorityState,
  composeAuthoritySnapshot,
  buildDurableSnapshot,
  extractEngineeringSummary,
  fetchDurablePublication,
  isAuthorityAvailable,
  readLocalHandoff,
} from './versionedEngineeringAuthority';
import { subscribeDesignReviewHandoff } from '@/components/state/designReviewHandoff';
import { useCompletedBassAuthority } from '@/components/room/bass/completedBassResultStore';
import { applyRestoredBassAuthority } from './restoredBassOverlay';

export function useVersionedEngineeringAuthority(projectId, versionId) {
  const [localSnapshot, setLocalSnapshot] = useState(
    () => (projectId && versionId ? readLocalHandoff(projectId, versionId) : null),
  );
  const [durable, setDurable] = useState(null);
  const [durableSnapshot, setDurableSnapshot] = useState(null);
  const [durableLoading, setDurableLoading] = useState(false);

  // ── Browser handoff (fast path) — unchanged live/session transport ──────
  useEffect(() => {
    if (!projectId || !versionId) {
      setLocalSnapshot(null);
      return undefined;
    }
    setLocalSnapshot(readLocalHandoff(projectId, versionId));
    return subscribeDesignReviewHandoff(projectId, versionId, (snapshot, fromStorage) => {
      setLocalSnapshot(
        snapshot || (fromStorage ? readLocalHandoff(projectId, versionId, { preferStored: true }) : null),
      );
    });
  }, [projectId, versionId]);

  // ── Durable DB publication (authority) ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!projectId || !versionId) {
      setDurable(null);
      setDurableSnapshot(null);
      setDurableLoading(false);
      return undefined;
    }

    setDurableLoading(true);
    (async () => {
      const result = await fetchDurablePublication(projectId, versionId);
      if (cancelled) return;
      setDurable(result);

      const publication = result?.publication;
      if (!publication) {
        setDurableSnapshot(null);
        setDurableLoading(false);
        return;
      }

      // design_state supplies the version's own seat/speaker/subwoofer data when
      // the publication has no report payload yet (publications written before
      // report_snapshot existed).
      let designState = null;
      try {
        const versions = await base44.entities.ProjectVersion.filter({ id: versionId });
        if (Array.isArray(versions) && versions.length) {
          designState = versions[0]?.design_state || null;
        }
      } catch (error) {
        console.warn('[engineeringAuthority] design_state read failed:', error?.message || error);
      }
      if (cancelled) return;

      setDurableSnapshot(
        buildDurableSnapshot({ projectId, versionId, publication, designState }),
      );
      setDurableLoading(false);
    })();

    return () => { cancelled = true; };
  }, [projectId, versionId]);

  // The saved bass authority is restored here — on every page that reads the
  // engineering authority, not only where the Room Designer (and its Bass
  // section) is mounted. Acquiring it starts the one durable hydration for this
  // project version and re-renders when it lands. The overlay then fills in the
  // bass results of a saved summary that does not state them, from the restored
  // contract, so a report never has to wait for the Bass section to hydrate.
  const completedBassAuthority = useCompletedBassAuthority(projectId || 'free', versionId || 'free');
  const snapshot = applyRestoredBassAuthority(
    composeAuthoritySnapshot({ localSnapshot, durableSnapshot }),
    { projectId, versionId, completedBassAuthority },
  );
  const state = classifyAuthorityState({ durable, localSnapshot });
  const localHasSummary = !!extractEngineeringSummary(localSnapshot);
  // Still resolving when the browser has no summary and the durable read has
  // not settled yet — consumers must wait rather than report "not calculated".
  const loading = !localHasSummary && (durableLoading || durable === null);

  return {
    snapshot,
    state,
    loading,
    durable,
    publication: durable?.publication || null,
    version: durable?.version || null,
    source: snapshot?.source || (localHasSummary ? 'browser-handoff' : null),
    available: isAuthorityAvailable(state),
  };
}

export default useVersionedEngineeringAuthority;