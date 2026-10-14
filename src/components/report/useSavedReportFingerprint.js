/**
 * useSavedReportFingerprint
 * -------------------------
 * Resolves the engineering fingerprint a SAVED report was generated from, so the
 * report can be rendered from that exact immutable publication instead of
 * whatever the version's current engineering pointer has since moved on to.
 *
 * TWO MODES, ONE BOUNDARY (read by every report route):
 *   VIEW SAVED REPORT      → the saved ReportSnapshot's own
 *                            source_fingerprints.engineeringFingerprint.
 *   GENERATE / UPDATE      → no saved report, so no fingerprint: the current
 *                            version authority is used, which is generation mode.
 *
 * A report that has just been generated or regenerated publishes that fact, so
 * this resolver re-reads and the document immediately renders from the authority
 * the NEW report was frozen against.
 *
 * Read-only: scoped entity reads, no writes, no recalculation.
 */

import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { readProjectRecord } from '@/components/state/projectReadCache';
import { fetchDurablePublication } from '@/components/engineering/versionedEngineeringAuthority';
import { engineeringDifferenceIsPresentationOnly } from './designIdentityComparison';
import { loadReportSnapshot } from './reportSnapshotStore';
import frozenReportRead from './frozenReportRead';

const EMPTY = { fingerprint: null, versionId: null, resolved: false, presentationOnlyMove: false };
const listeners = new Set();

/**
 * Whether the version's engineering publication moved past the saved report's
 * own fingerprint for PRESENTATION ONLY — a display or wording authority
 * revision, on a design the designer never changed.
 *
 * Decided from the two publications' own frozen physical facts, and only asked
 * when the two fingerprints actually differ. Any doubt — a publication that
 * states no frozen facts, an unreadable one, any physical difference — answers
 * false, so the strict verdict stands and a real design change is never excused.
 */
async function resolvePresentationOnlyMove(projectId, versionId, savedFingerprint) {
  try {
    const [saved, current] = await Promise.all([
      fetchDurablePublication(projectId, versionId, { engineeringFingerprint: savedFingerprint }),
      fetchDurablePublication(projectId, versionId),
    ]);
    return engineeringDifferenceIsPresentationOnly(saved?.publication, current?.publication);
  } catch (error) {
    console.warn('[savedReportFingerprint] presentation-only check failed:', error?.message || error);
    return false;
  }
}

/**
 * Called by the saved-report write boundary when a report is generated or
 * regenerated. It carries no value: the resolver re-reads the saved record, so
 * there is only ever one source for the fingerprint.
 */
export function publishSavedReportFingerprint() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.warn('[savedReportFingerprint] listener failed:', error?.message || error);
    }
  }
}

export function useSavedReportFingerprint({
  projectId = null,
  requestedVersionId = null,
  reportType = null,
}) {
  const [state, setState] = useState(EMPTY);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const listener = () => setRevision((value) => value + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!projectId || !reportType) {
      setState({ fingerprint: null, versionId: null, resolved: true });
      return () => { cancelled = true; };
    }

    setState((previous) => ({ ...previous, resolved: false }));

    (async () => {
      try {
        // The version the report was ASKED for, else the project's active version —
        // the same resolution every report route uses.
        let resolvedVersionId = requestedVersionId || null;
        if (!resolvedVersionId) {
          const project = await readProjectRecord(projectId);
          resolvedVersionId = project?.active_version_id || null;
        }
        if (!resolvedVersionId) {
          if (!cancelled) setState({ fingerprint: null, versionId: null, resolved: true });
          return;
        }
        const version = await base44.entities.ProjectVersion.get(resolvedVersionId);
        const currentFingerprint = version.published_fingerprint || null;
        const saved = await loadReportSnapshot({ projectId, versionId: resolvedVersionId, reportType, currentFingerprint });
        const fingerprint = saved ? frozenReportRead(saved, currentFingerprint).fingerprint : null;
        const presentationOnlyMove = fingerprint && currentFingerprint && fingerprint !== currentFingerprint
          ? await resolvePresentationOnlyMove(projectId, resolvedVersionId, fingerprint)
          : false;
        if (!cancelled) setState({ fingerprint, currentFingerprint, saved, versionId: resolvedVersionId, resolved: true, presentationOnlyMove, error: null });
      } catch (error) {
        // Fail closed: an unreadable saved report must never become current design.
        if (!cancelled) setState({ fingerprint: null, versionId: null, resolved: true,
          error: error?.message || 'Saved report could not be read.' });
      }
    })();

    return () => { cancelled = true; };
  }, [projectId, requestedVersionId, reportType, revision]);

  return state;
}

export default useSavedReportFingerprint;