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

import { useCallback, useEffect, useState } from 'react';
import {
  classifyAuthorityState,
  composeAuthoritySnapshot,
  buildDurableSnapshot,
  buildRatingEnvelope,
  extractEngineeringSummary,
  fetchDurablePublication,
  invalidateDurablePublicationRead,
  subscribeDurablePublication,
  isAuthorityAvailable,
  readLocalHandoff,
} from './versionedEngineeringAuthority';
import { subscribeDesignReviewHandoff } from '@/components/state/designReviewHandoff';
import { retryCompletedBassAuthority, useCompletedBassAuthority } from '@/components/room/bass/completedBassResultStore';
import { invalidateProjectAnalysisCacheRead, readProjectVersionRecord } from '@/components/state/projectReadCache';
import { applyRestoredBassAuthority } from './restoredBassOverlay';
import { assessEngineeringReportCompleteness } from './engineeringReportCompleteness';
import { useSharedBassAuthorityReconciliation } from '@/components/room/bass/useSharedBassAuthorityReconciliation';
import { useBassReconciliationStatus } from '@/components/room/bass/bassReconciliationStatus';
import { auditFinalReportAuthority } from '@/components/report/finalReportAuthorityGate';
import { auditDurablePublication } from './publicationGateAuthority';
import { usePublicationAttempt } from './publicationAcknowledgementStore';

export function useVersionedEngineeringAuthority(projectId, versionId, { finalReport = false } = {}) {
  const [localSnapshot, setLocalSnapshot] = useState(
    () => (projectId && versionId ? readLocalHandoff(projectId, versionId) : null),
  );
  const [durable, setDurable] = useState(null);
  const [durableSnapshot, setDurableSnapshot] = useState(null);
  const [durableLoading, setDurableLoading] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);

  useEffect(() => subscribeDurablePublication(projectId, versionId, () => {
    setDurable(null); setDurableSnapshot(null); setReadAttempt(value => value + 1);
  }), [projectId, versionId]);

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
        const version = await readProjectVersionRecord(versionId);
        designState = version?.design_state || null;
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
  }, [projectId, versionId, readAttempt]);

  // The saved bass authority is restored here — on every page that reads the
  // engineering authority, not only where the Room Designer (and its Bass
  // section) is mounted. Acquiring it starts the one durable hydration for this
  // project version and re-renders when it lands. The overlay then fills in the
  // bass results of a saved summary that does not state them, from the restored
  // contract, so a report never has to wait for the Bass section to hydrate.
  const completedBassAuthority = useCompletedBassAuthority(projectId || 'free', versionId || 'free');
  // Bass-authority reconciliation runs on THIS shared path, so a report, Design
  // Review or proposal source read opened directly repairs the same saved row the
  // Room Designer would — without the Room Designer or any bass panel mounting.
  // Identity only: it calculates nothing and never starts a worker.
  useSharedBassAuthorityReconciliation(projectId, versionId);
  // No-match and eligibility outcomes also refresh the gate, not just promotions.
  useBassReconciliationStatus(projectId, versionId);
  const composedSnapshot = composeAuthoritySnapshot({ localSnapshot, durableSnapshot, finalReport });
  const composedSummary = extractEngineeringSummary(composedSnapshot);
  const publishedBassMatches = !finalReport || !durable?.publication
    || durable.publication.provenance?.bass_fingerprint === completedBassAuthority?.currentFingerprint;
  const restoredSummary = publishedBassMatches ? applyRestoredBassAuthority(
    composedSummary,
    { projectId, versionId, completedBassAuthority },
  ) : composedSummary;
  // The bass overlay operates on the engineering summary, not the outer
  // handoff-shaped snapshot. Reinsert the restored summary at both compatibility
  // paths so Technical Report, Compliance, Visual Report and Proposal all read
  // the same restored authority without mounting the Bass UI.
  const restoredRating = restoredSummary && restoredSummary !== composedSummary
    ? buildRatingEnvelope(restoredSummary)
    : null;
  const snapshot = composedSnapshot && restoredSummary !== composedSummary
    ? {
        ...composedSnapshot,
        calculationFingerprint: restoredSummary?.bassAuthorityFingerprint ?? composedSnapshot.calculationFingerprint,
        engineeringSummary: restoredSummary,
        rating: composedSnapshot.rating
          ? { ...composedSnapshot.rating, ...(restoredRating || {}), engineeringSummary: restoredSummary }
          : restoredRating,
        p19SeatAuthority: restoredSummary?.p19SeatAuthority
          ?? composedSnapshot.p19SeatAuthority
          ?? null,
      }
    : composedSnapshot;
  const state = classifyAuthorityState({ durable, localSnapshot });
  const readFailed = durable?.status === 'read_failed';
  const readError = readFailed
    ? (durable?.error || 'Saved engineering authority could not be read.')
    : null;
  const summaryCompleteness = assessEngineeringReportCompleteness(extractEngineeringSummary(snapshot));
  const finalAuthorityGate = finalReport ? auditFinalReportAuthority(durable?.publication) : { allowed: true };
  const reportCompleteness = !publishedBassMatches
    ? { ...summaryCompleteness, complete:false, reason:'Saved publication stale: its bass fingerprint differs from the current version authority. Publish the completed current assessment before generating reports.' }
    : finalAuthorityGate.allowed ? summaryCompleteness
      : { ...summaryCompleteness, complete:false, reason:finalAuthorityGate.reason };

  // ── DURABLE PUBLICATION GATE ─────────────────────────────────────────────
  // A report or proposal may only be generated from a DURABLY PUBLISHED
  // engineering assessment for this exact version. The browser handoff stays a
  // preview path: it can show a design, but it can never be final report
  // authority, so no report, reportEvidence or "Current" state is allowed
  // without the publication the version pointer references.
  const publicationAttempt = usePublicationAttempt(projectId, versionId);
  const publicationGate = auditDurablePublication({
    durable,
    versionName: durable?.version?.version_name || null,
    authorityComplete: reportCompleteness.complete,
    authorityReason: reportCompleteness.reason,
    attempt: publicationAttempt,
    assessmentExists: !!extractEngineeringSummary(localSnapshot) || !!durable?.publication,
    assessmentComplete: assessEngineeringReportCompleteness(extractEngineeringSummary(localSnapshot)).complete,
  });
  const gatedCompleteness = publicationGate.allowed
    ? reportCompleteness
    : {
        ...reportCompleteness,
        complete: false,
        publicationBlocked: true,
        publicationStatus: publicationGate.status,
        reason: publicationGate.reason,
      };
  const localHasSummary = !!extractEngineeringSummary(localSnapshot);
  const bassHydrationPending = !!projectId
    && !!versionId
    && completedBassAuthority?.hydrationSettled !== true;
  const bassRestoreFailed = !!projectId
    && !!versionId
    && completedBassAuthority?.hydrationSettled === true
    && completedBassAuthority?.authorityStatus === 'ERROR'
    && !completedBassAuthority?.contract;
  // Durable engineering and durable bass are one report-readiness boundary.
  // A report must not render a partial saved summary while the bass contract is
  // still hydrating independently of the Room Designer/Bass UI.
  const loading = !readFailed && (
    (!localHasSummary && (durableLoading || durable === null))
    || bassHydrationPending
  );

  const retry = useCallback(() => {
    if (!projectId || !versionId) return;
    invalidateDurablePublicationRead(projectId, versionId);
    invalidateProjectAnalysisCacheRead(projectId, versionId);
    retryCompletedBassAuthority(projectId, versionId);
    setDurable(null);
    setDurableSnapshot(null);
    setReadAttempt((value) => value + 1);
  }, [projectId, versionId]);

  return {
    snapshot,
    state,
    loading,
    readFailed,
    readError,
    retry,
    bassHydrationPending,
    bassRestoreFailed,
    completedBassAuthority,
    bassAuthorityStatus: completedBassAuthority?.authorityStatus || null,
    bassAuthorityOutOfDate: reportCompleteness.bassAuthorityOutOfDate === true,
    bassAuthorityRejectionReason: reportCompleteness.bassAuthorityRejectionReason || null,
    reportCompleteness: gatedCompleteness,
    reportComplete: gatedCompleteness.complete,
    // The one durability verdict every report and proposal surface reads.
    publicationGate,
    publicationStatus: publicationGate.status,
    durablyPublished: publicationGate.allowed,
    publicationAttempt,
    durable,
    publication: durable?.publication || null,
    version: durable?.version || null,
    source: snapshot?.source || (localHasSummary ? 'browser-handoff' : null),
    available: isAuthorityAvailable(state),
  };
}

export default useVersionedEngineeringAuthority;