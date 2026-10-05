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
import { readStoredEvidence, validateReportEvidence } from './reportEvidenceAuthority';
import { buildParityRecord, checkReportEvidenceParity } from './reportEvidenceParity';
import { loadReportSnapshot, saveReportSnapshot } from './reportSnapshotStore';
import { fetchDurablePublication } from '@/components/engineering/versionedEngineeringAuthority';
import { auditReportSaveAuthority } from '@/components/engineering/publicationGateAuthority';
import {
  REPORT_SNAPSHOT_STATUS,
  buildSavedSourceFingerprints,
  buildSnapshotRecord,
  buildSourceFingerprints,
  resolveSnapshotStatus,
  shouldRefreshEvidence,
} from './reportSnapshotAuthority';

/** The object's own keys, minus the ones stated as nothing at all. */
function definedOnly(source) {
  if (!source || typeof source !== 'object') return {};
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== null && value !== undefined),
  );
}

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
  const mountedRef = useRef(true);
  // Whether this report's evidence snapshot passed its parity check. A report
  // whose evidence disagrees with what the report itself shows is still saved,
  // but is never proposal-ready.
  const [evidenceIncomplete, setEvidenceIncomplete] = useState(false);
  const [evidenceMismatches, setEvidenceMismatches] = useState([]);
  // Why a report snapshot may not be written: no durable engineering publication
  // for this version. Blocked reports say so instead of pretending to be current.
  const [publicationBlocked, setPublicationBlocked] = useState(null);

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

      // ── DURABLE AUTHORITY GATE ───────────────────────────────────────────
      // A report snapshot may only exist when the engineering assessment has
      // been durably published for this version. Read at generation time (not
      // from any browser store), so a design calculated in this session but
      // never saved can never produce a report that claims to be current.
      const durableRead = await fetchDurablePublication(projectId, versionId, { force: true });
      const saveGate = auditReportSaveAuthority(durableRead, {
        versionName: version.version_name || null,
      });
      if (!saveGate.allowed) {
        if (mountedRef.current) setPublicationBlocked(saveGate.reason);
        console.warn('[reportSnapshot] generation blocked:', saveGate.reason);
        return null;
      }
      if (mountedRef.current) setPublicationBlocked(null);
      // The report's own live authority is the geometry it renders from — the
      // loaded app state states the room dimensions and the screen
      // configuration, which the trimmed project details passed to this hook do
      // not. Reading them here, at the moment the report freezes its capture, is
      // what makes the evidence state the same room and screen the report shows
      // instead of a null room. The version's design state still wins for every
      // per-version value.
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
        seatingPublication: durableRead.publication,
        project: {
          ...definedOnly(reportSource?.app),
          ...definedOnly(reportSource?.project),
          ...definedOnly(version.design_state),
          version_name: version.version_name,
        },
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

      const refreshing = !!saved?.id && !readStoredEvidence(saved);
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
      // A report that already exists and carries no evidence is REFRESHED, not
      // regenerated: its evidence is added to the report that is already saved,
      // so its own generation time, author and status are preserved untouched.
      if (refreshing) {
        record.generated_at = saved.generated_at ?? record.generated_at;
        record.generated_by = saved.generated_by ?? record.generated_by;
        record.status = saved.status ?? record.status;
        record.status_reason = saved.status_reason ?? record.status_reason;
        record.status_updated_at = saved.status_updated_at ?? record.status_updated_at;
      }
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
    // A report that has no snapshot is saved; a report that exists, is CURRENT
    // and carries no evidence gets that evidence written once, in place. A
    // report the project has moved past is never written automatically.
    if (!shouldRefreshEvidence({
      saved,
      status: resolution.status,
      hasEvidence: !!readStoredEvidence(saved),
    })) return;
    if (!reportSource?.project) return;

    const key = `${projectId}::${versionId}::${reportType}::${readStoredEvidence(saved) ? 'evidence' : 'save'}`;
    if (autoSaveKeyRef.current === key) return;
    autoSaveKeyRef.current = key;
    persist();
  }, [loading, ready, payload, projectId, versionId, reportType, resolution.status, currentFp.engineeringFingerprint, reportSource, persist, saved]);

  // Evidence refresh uses the version's durable publication in persist().
  // Historical proposalSource is never an authority recovery path.

  // The evidence this report carries, and whether a proposal may read it. Read
  // from the SAVED report itself, so a report whose parity check failed shows as
  // incomplete the moment it is opened — not only after a save in this session.
  const storedEvidence = readStoredEvidence(saved);
  const storedValidation = validateReportEvidence(storedEvidence, reportType, {
    projectId, versionId, snapshotFingerprint: saved?.source_fingerprints?.engineeringFingerprint,
    sourceFingerprint: currentFp.engineeringFingerprint,
  });
  const evidenceIncompleteNow = saved ? !storedValidation.complete : evidenceIncomplete;

  return {
    saved,
    status: evidenceIncompleteNow && resolution.status === REPORT_SNAPSHOT_STATUS.CURRENT
      ? 'incomplete' : resolution.status,
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
    evidenceMismatches: [...evidenceMismatches, ...storedValidation.missing.map(field => ({ area: field + ' is missing' }))],
    // Set when the report could not be saved because the engineering assessment
    // has not been durably published for this version.
    publicationBlocked,
    regenerate: persist,
  };
}

export default useReportSnapshot;