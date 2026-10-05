/**
 * useReportSnapshot
 * -----------------
 * The saved-report lifecycle for ONE report type on ONE project version:
 * load the saved report, save it when it is first generated, and mark it stale
 * (without blanking it) when the design moves on afterwards.
 *
 * Rules
 *   - First generation saves the report against the project version.
 *   - Regeneration overwrites that same saved report.
 *   - A saved report that is out of date is NEVER overwritten automatically: it
 *     stays visible until the dealer chooses Regenerate.
 *   - Staleness is decided only from fingerprints that are readable on both
 *     sides, so an unreadable input never manufactures a false "out of date".
 *
 * Read/write only — no engineering value is computed, copied or re-graded here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import captureReportProposalSource from './captureReportProposalSource';
import { buildReportEvidence, readStoredEvidence } from './reportEvidenceAuthority';
import { buildParityRecord, checkReportEvidenceParity } from './reportEvidenceParity';
import { loadReportSnapshot, saveReportSnapshot } from './reportSnapshotStore';
import {
  REPORT_SNAPSHOT_STATUS,
  buildSavedSourceFingerprints,
  buildSnapshotRecord,
  buildSourceFingerprints,
  resolveSnapshotStatus,
} from './reportSnapshotAuthority';

export function useReportSnapshot({
  projectId = null,
  versionId = null,
  accountId = null,
  reportType = null,
  currentFingerprints = null,
  payload = null,
  reportSource = null,
  ready = false,
}) {
  const { user } = useAuth();
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const autoSaveKeyRef = useRef(null);
  // Bumped when a legacy snapshot's proposal evidence has been recovered in
  // place, so the backfill runs at most once per open report.
  const evidenceBackfillKeyRef = useRef(null);
  const mountedRef = useRef(true);
  // Whether this report's evidence snapshot passed its parity check. A report
  // whose evidence disagrees with what the report itself shows is still saved,
  // but is never proposal-ready.
  const [evidenceIncomplete, setEvidenceIncomplete] = useState(false);
  const [evidenceMismatches, setEvidenceMismatches] = useState([]);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const fingerprintKey = JSON.stringify(buildSourceFingerprints(currentFingerprints));
  const currentFp = useMemo(
    () => buildSourceFingerprints(currentFingerprints),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fingerprintKey],
  );

  // ── Load the saved report ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    if (!projectId || !versionId || !reportType) {
      setSaved(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    loadReportSnapshot({ projectId, versionId, reportType })
      .then((row) => { if (!cancelled) setSaved(row || null); })
      .catch((error) => {
        if (!cancelled) {
          // A saved report that cannot be read must never block the report.
          console.warn('[reportSnapshot] read failed:', error?.message || error);
          setSaved(null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [projectId, versionId, reportType]);

  const resolution = useMemo(
    () => resolveSnapshotStatus({ saved, currentFingerprints: currentFp }),
    [saved, currentFp],
  );

  const persist = useCallback(async () => {
    if (!projectId || !versionId || !reportType || !payload) return null;

    setSaving(true);
    try {
      const version = await base44.entities.ProjectVersion.get(versionId);
      if (version?.project_id !== projectId) throw new Error('Report version does not belong to this project.');
      const captured = captureReportProposalSource({ projectId, versionId, ...reportSource,
        project: { ...reportSource?.project, ...version.design_state, version_name: version.version_name },
        presentation: reportSource?.presentation,
      });
      if (!captured) throw new Error('The report evidence is not ready to save.');
      // Saved with the version's published engineering fingerprint whenever the
      // handoff carried none, so the design this report was generated from is
      // stated in full and a later design change is detected. Saving this at
      // generation time is what keeps a new report Current for proposal
      // generation without it ever being opened again.
      const record = buildSnapshotRecord({
        projectId,
        versionId,
        accountId,
        reportType,
        sourceFingerprints: buildSavedSourceFingerprints({
          currentFingerprints: currentFp,
          publishedFingerprint: version.published_fingerprint,
        }),
        generatedBy: user?.full_name || user?.email || null,
        payload: { ...payload, proposalSource: captured },
      });
      const written = await saveReportSnapshot({ existing: saved, record });
      if (mountedRef.current) setSaved(written || { ...record, id: saved?.id || null });
      return written;
    } catch (error) {
      console.warn('[reportSnapshot] save failed:', error?.message || error);
      return null;
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [projectId, versionId, accountId, reportType, currentFp, payload, reportSource, saved, user?.full_name, user?.email]);

  // ── Save on first generation only ───────────────────────────────────────
  // A stale saved report is left exactly as it is: keeping it visible and
  // marking it out of date is the point. Regenerate is the only overwrite path.
  //
  // The save waits for the project record the evidence capture reads. Waiting is
  // what makes a freshly generated report Current for proposal generation on the
  // SAME visit: saving without it would write a snapshot with no proposalSource
  // and leave the report reading as one that must be opened again.
  useEffect(() => {
    if (loading || !ready || !payload || !projectId || !versionId || !reportType) return;
    if (resolution.status !== REPORT_SNAPSHOT_STATUS.NONE) return;
    if (!reportSource?.project) return;

    const key = `${projectId}::${versionId}::${reportType}::${currentFp.engineeringFingerprint || 'na'}`;
    if (autoSaveKeyRef.current === key) return;
    autoSaveKeyRef.current = key;
    persist();
  }, [loading, ready, payload, projectId, versionId, reportType, resolution.status, currentFp.engineeringFingerprint, reportSource, persist]);

  // ── Compatibility path: recover the proposal evidence in place ───────────
  // A saved report that is CURRENT but predates the proposal evidence capture
  // carries no payload.proposalSource, so proposal comparison generation cannot
  // read it. Opening the report augments that SAME record in place — same
  // report, same fingerprints, plus the proposal evidence built from the same
  // frozen engineering authority the report renders from. Nothing is
  // regenerated, and no report content changes.
  //
  // A report that is not current is left exactly as it is: Regenerate remains
  // the only overwrite path for it, so a genuinely stale report is never
  // silently refreshed.
  useEffect(() => {
    if (loading || !ready || !payload || !projectId || !versionId || !reportType) return;
    if (resolution.status !== REPORT_SNAPSHOT_STATUS.CURRENT) return;
    if (saved?.payload?.proposalSource) return;
    if (!reportSource?.project) return;

    const key = `${projectId}::${versionId}::${reportType}`;
    if (evidenceBackfillKeyRef.current === key) return;
    evidenceBackfillKeyRef.current = key;
    persist();
  }, [loading, ready, payload, projectId, versionId, reportType, resolution.status, saved, reportSource, persist]);

  return {
    saved,
    status: resolution.status,
    changedKeys: resolution.changedKeys,
    generatedAt: resolution.generatedAt,
    generatedBy: resolution.generatedBy,
    loading,
    saving,
    regenerate: persist,
  };
}

export default useReportSnapshot;