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
      // Saved with the version's published engineering fingerprint whenever the
      // handoff carried none, so the design this report was generated from is
      // stated in full and a later design change is detected. Saving this at
      // generation time is what keeps a new report Current for proposal
      // generation without it ever being opened again.
      const savedFingerprints = buildSavedSourceFingerprints({
        currentFingerprints: currentFp,
        publishedFingerprint: version.published_fingerprint,
      });
      const captured = captureReportProposalSource({ projectId, versionId, ...reportSource,
        project: { ...reportSource?.project, ...version.design_state, version_name: version.version_name },
        presentation: reportSource?.presentation,
        reportType,
        sourceFingerprint: savedFingerprints,
      });
      if (!captured) throw new Error('The report evidence is not ready to save.');

      // ── PARITY, before the evidence is marked proposal-ready ──
      // The evidence is compared against what this report actually shows: every
      // visible parameter value, every Products Selected row and every viewing
      // value. A mismatch never fails the report — it is logged, the evidence is
      // stored with proposal_ready = false, and the report is shown as incomplete
      // for proposal use, so a proposal can never read evidence the report itself
      // does not state.
      const { reportEvidence, ...proposalSource } = captured;
      const parity = checkReportEvidenceParity({ evidence: reportEvidence, captured, reportType });
      if (!parity.passed) {
        console.warn('[reportEvidence] parity check failed:', {
          reportType,
          missing: parity.missing,
          mismatches: parity.mismatches,
        });
      }
      const evidence = reportEvidence
        ? { ...reportEvidence, proposal_ready: parity.passed === true }
        : null;

      const record = buildSnapshotRecord({
        projectId,
        versionId,
        accountId,
        reportType,
        sourceFingerprints: savedFingerprints,
        generatedBy: user?.full_name || user?.email || null,
        payload: {
          ...payload,
          proposalSource,
          reportEvidence: evidence,
          evidence_parity: buildParityRecord(parity),
        },
      });
      const written = await saveReportSnapshot({ existing: saved, record });
      if (mountedRef.current) {
        setSaved(written || { ...record, id: saved?.id || null });
        setEvidenceIncomplete(!parity.passed);
        setEvidenceMismatches([...parity.mismatches, ...parity.missing.map((field) => ({ area: field }))]);
      }
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

  // ── Legacy path: recover the evidence from the report's OWN frozen source ──
  // A report saved before the evidence capture carries no reportEvidence. Its own
  // stored frozen source IS the authority it was generated from, so the evidence
  // is derived from that stored source ALONE — offline, never from the current
  // project. Nothing is regenerated and no report content changes: the same
  // record gains the evidence it should have carried, once.
  //
  // A report with NO stored frozen source cannot be recovered. It stays blocked
  // as a legacy report whose evidence needs a one-time refresh, and only
  // regenerating it from the current design can produce evidence.
  useEffect(() => {
    if (loading || !projectId || !versionId || !reportType) return;
    if (!saved?.id) return;
    if (resolution.status !== REPORT_SNAPSHOT_STATUS.CURRENT) return;
    if (readStoredEvidence(saved)) return;
    const stored = saved.payload?.proposalSource;
    if (!stored) return;

    const key = `${projectId}::${versionId}::${reportType}::evidence`;
    if (evidenceBackfillKeyRef.current === key) return;
    evidenceBackfillKeyRef.current = key;

    (async () => {
      try {
        const evidence = buildReportEvidence({
          reportType,
          captured: stored,
          sourceFingerprint: saved.source_fingerprints,
        });
        if (!evidence) return;
        const parity = checkReportEvidenceParity({ evidence, captured: stored, reportType });
        const record = {
          ...saved,
          payload: {
            ...saved.payload,
            reportEvidence: { ...evidence, proposal_ready: parity.passed === true },
            evidence_parity: buildParityRecord(parity),
          },
        };
        const written = await saveReportSnapshot({ existing: saved, record });
        if (!mountedRef.current) return;
        setSaved(written || record);
        setEvidenceIncomplete(!parity.passed);
        setEvidenceMismatches([...parity.mismatches, ...parity.missing.map((field) => ({ area: field }))]);
      } catch (error) {
        // Recovery is best effort: a report that cannot be recovered stays
        // blocked as a legacy report, and is never reported as missing.
        console.warn('[reportEvidence] legacy recovery failed:', error?.message || error);
      }
    })();
  }, [loading, saved, resolution.status, projectId, versionId, reportType]);

  // The evidence this report carries, and whether a proposal may read it. Read
  // from the SAVED report itself, so a report whose parity check failed shows as
  // incomplete the moment it is opened — not only after a save in this session.
  const storedEvidence = readStoredEvidence(saved);
  const evidenceIncompleteNow = storedEvidence
    ? storedEvidence.proposal_ready !== true
    : evidenceIncomplete;

  return {
    saved,
    status: resolution.status,
    changedKeys: resolution.changedKeys,
    generatedAt: resolution.generatedAt,
    generatedBy: resolution.generatedBy,
    loading,
    saving,
    // The report's own evidence snapshot, and whether it may be used by a
    // proposal. A report whose parity check failed is still saved and fully
    // visible here — it is simply never proposal-ready.
    evidence: storedEvidence,
    evidenceIncomplete: evidenceIncompleteNow,
    evidenceMismatches,
    regenerate: persist,
  };
}

export default useReportSnapshot;