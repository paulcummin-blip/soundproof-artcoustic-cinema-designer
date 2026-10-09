/**
 * useProposalReadiness
 * --------------------
 * Reads the readiness of EVERY selected version, from the ONE authority that
 * already exists in the app:
 *
 *   - the canonical saved PROJECT REPORT per project + version (ReportSnapshot),
 *     judged by the SAME fingerprint comparison the report page uses, so this
 *     gate and the report's own Current badge can never disagree. The legacy
 *     Visual and Technical Reports are retired and never consulted.
 *   - the version's calculated engineering result, read from the two durable
 *     forms of the same result: the PUBLISHED engineering publication
 *     (ProjectVersion.published_fingerprint → the publication) and the version's
 *     COMPLETED calculation authority (ProjectAnalysisCache.completed_by_fingerprint).
 *     A browser-session handoff is never consulted: the server cannot see one, so
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
import { currentSourceFingerprints } from '@/components/report/reportSnapshotAuthority';
import { readSeatPriorityFingerprint } from '@/components/state/designReviewHandoff';
import { readProjectAnalysisCacheRecord } from '@/components/state/projectReadCache';
import { subscribeReportSourceStored } from './reportSourceSignal';
import { selectCanonicalReportSnapshotsByKey } from '@/components/report/reportSnapshotCanonical';
import {
  resolveCalculationAuthority,
  resolveSavedReportCell,
  resolveVersionReadinessRow,
  versionDisplayName,
} from './proposalReadinessAuthority';

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

        // The CANONICAL saved report per version and report type — the same rule
        // the report pages, Project Library and the server gate use. Complete
        // evidence comes first, then the row frozen against the version's CURRENT
        // published authority, and only then the newest: a complete, evidence-
        // carrying report is never displaced by a newer duplicate that is stale or
        // carries no evidence, so a report the designer generated cannot stop being
        // usable because a second row was written later.
        const snapshotRows = Array.isArray(snapshotPage) ? snapshotPage : (snapshotPage?.items || []);
        const publishedFingerprintByVersionId = new Map(ids.map((versionId) => [
          versionId,
          versionsById.get(versionId)?.published_fingerprint || null,
        ]));
        const savedByKey = selectCanonicalReportSnapshotsByKey(snapshotRows, {
          currentFingerprintByVersion: publishedFingerprintByVersionId,
        });

        const liveSeatPriorityFingerprint = readSeatPriorityFingerprint(projectId);
        const nextRows = ids.map((versionId, index) => {
          const version = versionsById.get(versionId) || null;
          const durable = durableReads[index] || null;
          // THE canonical saved Project Report — the only report source a
          // proposal is gated on. The legacy Visual and Technical Reports are
          // never consulted here.
          const savedProjectReport = savedByKey.get(`${versionId}::project`) || null;
          // The version's calculated engineering result: the publication when it
          // has one, otherwise the completed calculation authority of the SAME
          // design the saved Project Report was generated from.
          const calculationAuthority = resolveCalculationAuthority({
            cacheRecord: cacheRecords[index] || null,
            savedProjectReport,
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
              project: resolveSavedReportCell({ saved: savedProjectReport, currentFingerprints }),
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