/**
 * useProposalReadiness
 * --------------------
 * Reads the readiness of EVERY selected version, from the authorities that
 * already exist in the app:
 *
 *   - the saved report per project + version + report type (ReportSnapshot),
 *     judged by the SAME fingerprint comparison the report pages use, so this
 *     gate and a report's own Current badge can never disagree
 *   - the version's engineering authority (published engineering result plus
 *     report completeness), read through buildSelectedVersionSnapshots — the
 *     same reader the wizard uses at generation time
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
import { buildSelectedVersionSnapshots } from '@/components/proposal/engineeringAuthority/buildSelectedVersionSnapshots';
import { extractEngineeringSummary } from '@/components/engineering/versionedEngineeringAuthority';
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

/** Engineering authority state per version → a readiness cell. */
function buildEngineeringCell(entry) {
  const state = entry?.engineeringState || (entry?.snapshot ? READINESS_STATE.CURRENT : READINESS_STATE.MISSING);
  switch (state) {
    case READINESS_STATE.CURRENT:
      return buildReadinessCell({ state: READINESS_STATE.CURRENT, generatedAt: entry?.publishedAt || null });
    case READINESS_STATE.STALE:
      return buildReadinessCell({ state: READINESS_STATE.STALE, reason: entry?.engineeringReason || null });
    case READINESS_STATE.INCOMPLETE:
      return buildReadinessCell({ state: READINESS_STATE.INCOMPLETE, reason: entry?.engineeringReason || null });
    case READINESS_STATE.UNAVAILABLE:
      return buildReadinessCell({ state: READINESS_STATE.UNAVAILABLE, reason: entry?.engineeringReason || null });
    default:
      return buildReadinessCell({ state: READINESS_STATE.MISSING, reason: entry?.engineeringReason || null });
  }
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
        const [versionRecords, snapshotPage] = await Promise.all([
          base44.entities.ProjectVersion.filter({ project_id: projectId }),
          base44.entities.ReportSnapshot.filter(
            { project_id: projectId, version_id: { $in: ids } },
            { sort: '-generated_at', limit: 200 },
          ),
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

        const entries = await buildSelectedVersionSnapshots({ projectId, versionIds: ids });
        if (cancelled) return;

        const liveSeatPriorityFingerprint = readSeatPriorityFingerprint(projectId);
        const nextRows = ids.map((versionId, index) => {
          const entry = entries.find((item) => String(item.version_id) === String(versionId)) || null;
          const version = versionsById.get(versionId) || null;
          const currentFingerprints = currentSourceFingerprints({
            authoritySnapshot: entry?.authoritySnapshot || null,
            engineeringSummary: extractEngineeringSummary(entry?.authoritySnapshot || null),
            liveSeatPriorityFingerprint,
          });

          return resolveVersionReadinessRow({
            versionId,
            versionName: versionDisplayName(version || {
              version_name: entry?.version_name || null,
              version_number: index + 1,
            }),
            versionNumber: version?.version_number ?? index + 1,
            cells: {
              visual: reportCell(savedByKey.get(`${versionId}::visual`), currentFingerprints),
              technical: reportCell(savedByKey.get(`${versionId}::technical`), currentFingerprints),
              engineering: buildEngineeringCell(entry),
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