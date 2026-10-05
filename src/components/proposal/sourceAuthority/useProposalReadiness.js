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
import { validateReportEvidence } from '../../../../base44/shared/reportEvidenceCompleteness.js';
import { base44 } from '@/api/base44Client';
import {
  buildDurableSnapshot,
  extractEngineeringSummary,
  fetchDurablePublication,
} from '@/components/engineering/versionedEngineeringAuthority';
import {
  compareSourceFingerprints,
  currentSourceFingerprints,
} from '@/components/report/reportSnapshotAuthority';
import { readSeatPriorityFingerprint } from '@/components/state/designReviewHandoff';
import { readProjectAnalysisCacheRecord } from '@/components/state/projectReadCache';
import { subscribeReportSourceStored } from './reportSourceSignal';
import { selectCanonicalReportSnapshotsByKey } from '@/components/report/reportSnapshotCanonical';
import {
  PUBLICATION_STATUS,
  READINESS_STATE,
  buildReadinessCell,
  hasProposalEvidence,
  resolveCalculationAuthority,
  resolveEngineeringCell,
  resolveEvidenceState,
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
  if (durable?.publication && durable?.version?.published_fingerprint
    && durable.publication.engineering_fingerprint === durable.version.published_fingerprint
    && durable?.acknowledgement?.durably_published === true) return PUBLICATION_STATUS.PUBLISHED;
  if (durable?.status === 'stale') return PUBLICATION_STATUS.STALE;
  return PUBLICATION_STATUS.NOT_CALCULATED;
}

function reportCell(saved, currentFingerprints) {
  // No saved report for this project version and report type: genuinely Missing.
  if (!saved) return buildReadinessCell({ state: READINESS_STATE.MISSING });

  // The saved report's own stored status is the first authority: a report the
  // project has moved past is Stale, not merely in need of a refresh.
  if (saved.status !== 'current') return buildReadinessCell({ state: READINESS_STATE.STALE });

  // Staleness is the SAME fingerprint comparison the report page's own Current
  // badge uses: the design the report was generated from is compared with the
  // design the version holds NOW. The version record's own modified time is
  // never consulted — opening the project, exporting a PDF or storing a library
  // asset all touch that record without changing the design, so it cannot say
  // whether the report's source moved on. A fingerprint unreadable on either
  // side never manufactures staleness.
  const { changed } = compareSourceFingerprints(saved.source_fingerprints, currentFingerprints);
  if (changed.length > 0) {
    return buildReadinessCell({ state: READINESS_STATE.STALE, generatedAt: saved.generated_at });
  }

  // The proposal evidence this report carries — the only thing a proposal reads
  // from it. A report whose evidence is stored but does not agree with what the
  // report shows may not be used: it is Incomplete, not Missing.
  const evidenceState = resolveEvidenceState(saved);
  const completeness = validateReportEvidence(saved.payload?.reportEvidence, saved.report_type, {
    projectId: saved.project_id, versionId: saved.version_id,
    snapshotFingerprint: saved.source_fingerprints?.engineeringFingerprint,
    sourceFingerprint: currentFingerprints?.engineeringFingerprint,
  });
  if (saved.payload?.reportEvidence && !completeness.complete) {
    return buildReadinessCell({
      state: READINESS_STATE.INCOMPLETE,
      generatedAt: saved.generated_at,
      reason: completeness.reason
        || 'This report’s evidence does not match what the report shows. Regenerate it.',
    });
  }

  // The design has not moved on, so this report can be used for a proposal. It
  // was written before the proposal evidence capture, so it carries no
  // reportEvidence: a ONE-TIME evidence refresh — never a missing report and
  // never recurring maintenance.
  if (evidenceState !== 'ready') {
    return buildReadinessCell({
      state: READINESS_STATE.LEGACY,
      generatedAt: saved.generated_at,
      reason: 'This report is current, but it needs a one-time evidence refresh for proposal comparison.',
    });
  }
  return buildReadinessCell({ state: READINESS_STATE.CURRENT, generatedAt: saved.generated_at });
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

        // The CANONICAL saved report per version and report type — the same rule
        // the report pages, Project Library and the server gate use. A complete,
        // evidence-carrying row is never displaced by a newer duplicate that
        // carries no evidence, so a report the designer generated cannot stop
        // being usable because a second row was written later.
        const snapshotRows = Array.isArray(snapshotPage) ? snapshotPage : (snapshotPage?.items || []);
        const savedByKey = selectCanonicalReportSnapshotsByKey(snapshotRows);

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
              visual: reportCell(savedByKey.get(`${versionId}::visual`), currentFingerprints),
              technical: reportCell(savedTechnical, currentFingerprints),
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