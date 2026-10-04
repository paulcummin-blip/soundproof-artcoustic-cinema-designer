/**
 * useProposalReadiness
 * --------------------
 * Reads the readiness of EVERY selected version, from the authorities that
 * already exist in the app:
 *
 *   - the saved report per project + version + report type (ReportSnapshot),
 *     judged by the SAME fingerprint comparison the report pages use, so this
 *     gate and a report's own Current badge can never disagree
 *   - the version's PUBLISHED engineering result, read from the one durable
 *     authority (ProjectVersion.published_fingerprint → the publication) — the
 *     same source the server's gate reads. A browser-session handoff is never
 *     consulted: the server cannot see one, so the table must never report
 *     Current on account of it.
 *
 * ONE authority: the derivation lives in proposalReadinessAuthority (mirrored by
 * base44/shared/proposalReadinessAuthority.js, which the server gate uses). The
 * panel, the blocking text, the Generate gate and the server therefore all state
 * the same verdict, for the same version, in the saved version's own name.
 *
 * It recalculates nothing and generates no report content. Reading only.
 *
 * @param {Object} params
 * @param {string|null} params.projectId
 * @param {Array<string>} params.versionIds — every selected version
 * @returns {{ rows, gate, loading, error }}
 */

import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  buildDurableSnapshot,
  extractEngineeringSummary,
  fetchDurablePublication,
} from '@/components/engineering/versionedEngineeringAuthority';
import {
  REPORT_SNAPSHOT_STATUS,
  currentSourceFingerprints,
  resolveSnapshotStatus,
} from '@/components/report/reportSnapshotAuthority';
import { readSeatPriorityFingerprint } from '@/components/state/designReviewHandoff';
import {
  READINESS_STATE,
  buildReadinessCell,
  resolveReportCellState,
  resolveVersionReadinessRow,
  versionDisplayName,
} from './proposalReadinessAuthority';

/**
 * The durable published-engineering read → a readiness cell. This is the same
 * rule the server gate applies: a publication is Current, a pointer with no
 * publication is Stale, nothing is Missing, a failed read is Unavailable.
 */
function buildEngineeringCell(durable) {
  if (durable?.readState === 'failed') {
    return buildReadinessCell({
      state: READINESS_STATE.UNAVAILABLE,
      reason: 'The saved engineering result could not be read.',
    });
  }
  if (durable?.publication) {
    return buildReadinessCell({
      state: READINESS_STATE.CURRENT,
      generatedAt: durable.publication.published_at || null,
    });
  }
  if (durable?.status === 'stale') {
    return buildReadinessCell({
      state: READINESS_STATE.STALE,
      reason: 'The saved engineering result no longer matches this version. Recalculate it in Room Designer.',
    });
  }
  return buildReadinessCell({
    state: READINESS_STATE.MISSING,
    reason: 'No saved engineering result was found for this version.',
  });
}

function reportCell(saved, currentFingerprints) {
  if (!saved) return buildReadinessCell({ state: READINESS_STATE.MISSING });
  const resolution = resolveSnapshotStatus({ saved, currentFingerprints });
  const state = resolveReportCellState({
    hasSaved: resolution.restorable,
    snapshotStatus: resolution.status === REPORT_SNAPSHOT_STATUS.NONE ? null : resolution.status,
  });
  return buildReadinessCell({ state, generatedAt: resolution.generatedAt });
}

export function useProposalReadiness({ projectId = null, versionIds = [] } = {}) {
  const ids = useMemo(
    () => (Array.isArray(versionIds) ? versionIds.filter(Boolean) : []),
    [versionIds],
  );
  const idsKey = ids.join('|');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (!projectId || !idsKey) {
      setRows([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [versionRecords, snapshotPage, durableReads] = await Promise.all([
          base44.entities.ProjectVersion.filter({ project_id: projectId }),
          base44.entities.ReportSnapshot.filter(
            { project_id: projectId, version_id: { $in: ids } },
            { sort: '-generated_at', limit: 200 },
          ),
          // The durable published-engineering read, one per selected version,
          // shared with every other consumer of the authority (session-cached).
          Promise.all(ids.map((versionId) => fetchDurablePublication(projectId, versionId))),
        ]);
        if (cancelled) return;

        const versionsById = new Map(
          (Array.isArray(versionRecords) ? versionRecords : []).map((version) => [version.id, version]),
        );

        // One saved report per version and report type; the sorted read means
        // the first row seen per key is the newest.
        const savedByKey = new Map();
        const snapshotRows = Array.isArray(snapshotPage) ? snapshotPage : (snapshotPage?.items || []);
        snapshotRows.forEach((row) => {
          const key = `${row.version_id}::${row.report_type}`;
          if (!savedByKey.has(key)) savedByKey.set(key, row);
        });

        const liveSeatPriorityFingerprint = readSeatPriorityFingerprint(projectId);
        const nextRows = ids.map((versionId, index) => {
          const version = versionsById.get(versionId) || null;
          const durable = durableReads[index] || null;
          // The current fingerprints come from the publication this version has
          // actually saved — the same values the server gate compares against.
          const durableSnapshot = durable?.publication
            ? buildDurableSnapshot({
              projectId,
              versionId,
              publication: durable.publication,
              designState: version?.design_state,
            })
            : null;
          const currentFingerprints = currentSourceFingerprints({
            authoritySnapshot: durableSnapshot,
            engineeringSummary: extractEngineeringSummary(durableSnapshot),
            liveSeatPriorityFingerprint,
          });

          return resolveVersionReadinessRow({
            versionId,
            versionName: versionDisplayName(version || { version_number: index + 1 }),
            versionNumber: version?.version_number ?? index + 1,
            cells: {
              visual: reportCell(savedByKey.get(`${versionId}::visual`), currentFingerprints),
              technical: reportCell(savedByKey.get(`${versionId}::technical`), currentFingerprints),
              engineering: buildEngineeringCell(durable),
            },
          });
        });

        setRows(nextRows);
        setLoading(false);
      } catch (readError) {
        if (cancelled) return;
        console.warn('[proposalReadiness] read failed:', readError?.message || readError);
        setRows([]);
        setError(readError?.message || 'Readiness could not be read.');
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [projectId, idsKey]);

  return { rows, loading, error };
}

export default useProposalReadiness;