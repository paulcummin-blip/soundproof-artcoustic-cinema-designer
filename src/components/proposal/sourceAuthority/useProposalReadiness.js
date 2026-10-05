/**
 * useProposalReadiness
 * --------------------
 * Reads the readiness of EVERY selected version, from the authorities that
 * already exist in the app:
 *
 *   - the saved report per project + version + report type (ReportSnapshot),
 *     judged by the SAME fingerprint comparison the report pages use, so this
 *     gate and a report's own Current badge can never disagree
 *   - the version's calculated engineering result, read from the two durable
 *     forms of the same result: the PUBLISHED engineering publication
 *     (ProjectVersion.published_fingerprint → the publication) and the version's
 *     COMPLETED calculation authority (ProjectAnalysisCache.completed_by_fingerprint)
 *     — the calculated result a Technical Report is generated from. A
 *     browser-session handoff is never consulted: the server cannot see one, so
 *     the table must never report Current on account of it.
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

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { readProjectAnalysisCacheRecord } from '@/components/state/projectReadCache';
import { subscribeReportSourceStored } from './reportSourceSignal';
import {
  PUBLICATION_STATUS,
  READINESS_STATE,
  buildReadinessCell,
  resolveCalculationAuthority,
  resolveEngineeringCell,
  resolveReportCellState,
  resolveVersionReadinessRow,
  versionDisplayName,
} from './proposalReadinessAuthority';

/**
 * The durable published-engineering read → the publication status the shared
 * engineering cell is judged by. This is the same rule the server gate applies:
 * a failed read is Unavailable, a pointer with no publication is Stale, nothing
 * is Missing.
 */
function publicationStatusOf(durable) {
  if (durable?.readState === 'failed') return PUBLICATION_STATUS.READ_FAILED;
  if (durable?.publication) return PUBLICATION_STATUS.PUBLISHED;
  if (durable?.status === 'stale') return PUBLICATION_STATUS.STALE;
  return PUBLICATION_STATUS.NOT_CALCULATED;
}

function reportCell(saved, currentFingerprints, version) {
  // No saved report for this project version and report type: genuinely Missing.
  if (!saved) return buildReadinessCell({ state: READINESS_STATE.MISSING });

  // The saved report's own stored status is the first authority: a report the
  // project has moved past is Stale, not merely in need of a refresh.
  if (saved.status !== 'current') return buildReadinessCell({ state: READINESS_STATE.STALE });

  // The report exists and is current, but it predates the proposal evidence
  // capture — it carries no payload.proposalSource. That is a legacy snapshot
  // that needs refreshing. It is never Missing: the report is not missing.
  if (!saved.payload?.proposalSource) {
    return buildReadinessCell({
      state: READINESS_STATE.LEGACY,
      generatedAt: saved.generated_at,
      reason: 'This report is current, but it needs refreshing for proposal comparison evidence.',
    });
  }

  // The version has been edited since this report was generated.
  if (new Date(saved.generated_at) < new Date(version?.updated_date)) {
    return buildReadinessCell({ state: READINESS_STATE.STALE });
  }
  // A report with a captured source is not judged against a lagging publication.
  if (saved.payload.proposalSource.report_source_version === 1) {
    return buildReadinessCell({ state: READINESS_STATE.CURRENT, generatedAt: saved.generated_at });
  }
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
  // Bumped when a saved report lands, so the read below runs again and the table
  // shows the report that has just been generated rather than the state before it.
  const [refreshToken, setRefreshToken] = useState(0);
  /**
   * Read again from the same authorities, for the one retry a failed read
   * offers. The wizard's retry action is this, and nothing else: the read that
   * decides the table and the Generate button is a single read.
   */
  const retry = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    if (!projectId) return undefined;
    return subscribeReportSourceStored((entry) => {
      if (entry?.projectId && String(entry.projectId) !== String(projectId)) return;
      setRefreshToken((value) => value + 1);
    });
  }, [projectId]);

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
        const [versionRecords, snapshotPage, durableReads, cacheRecords] = await Promise.all([
          base44.entities.ProjectVersion.filter({ project_id: projectId }),
          base44.entities.ReportSnapshot.filter(
            { project_id: projectId, version_id: { $in: ids } },
            { sort: '-generated_at', limit: 200 },
          ),
          // The durable published-engineering read, one per selected version,
          // shared with every other consumer of the authority (session-cached).
          Promise.all(ids.map((versionId) => fetchDurablePublication(projectId, versionId))),
          // The version's completed calculation authority — the calculated
          // engineering result a Technical Report is generated from. Read
          // through the same session-cached project read the report path uses.
          Promise.all(ids.map((versionId) => readProjectAnalysisCacheRecord(projectId, versionId))),
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
          const savedTechnical = savedByKey.get(`${versionId}::technical`) || null;
          // The version's calculated engineering result: the publication when it
          // has one, otherwise the completed calculation authority of the SAME
          // design its Technical Report was generated from. Both are durable, and
          // both are read by the server gate too.
          const calculationAuthority = resolveCalculationAuthority({
            cacheRecord: cacheRecords[index] || null,
            savedTechnicalReport: savedTechnical,
          });
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
          const savedFingerprints = currentSourceFingerprints({
            authoritySnapshot: durableSnapshot,
            engineeringSummary: extractEngineeringSummary(durableSnapshot),
            liveSeatPriorityFingerprint,
          });
          const currentFingerprints = {
            ...savedFingerprints,
            // When the version has no publication to speak for it, the completed
            // calculation authority supplies its bass fingerprint — so a report is
            // compared against the design the version actually holds instead of
            // against nothing. A version WITH a publication is left exactly as it
            // was: its own publication states what the reports are judged against.
            calculationFingerprint: savedFingerprints.calculationFingerprint
              || (durable?.publication ? null : calculationAuthority?.fingerprint)
              || null,
          };

          return resolveVersionReadinessRow({
            versionId,
            versionName: versionDisplayName(version || { version_number: index + 1 }),
            versionNumber: version?.version_number ?? index + 1,
            cells: {
              visual: reportCell(savedByKey.get(`${versionId}::visual`), currentFingerprints, version),
              technical: reportCell(savedTechnical, currentFingerprints, version),
              engineering: resolveEngineeringCell({
                publication: durable?.publication || null,
                publicationStatus: publicationStatusOf(durable),
                calculationAuthority,
              }),
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
  }, [projectId, idsKey, refreshToken]);

  return { rows, loading, error, retry };
}

export default useProposalReadiness;