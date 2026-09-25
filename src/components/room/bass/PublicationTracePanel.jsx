/**
 * PublicationTracePanel.jsx — TEMPORARY developer-only trace panel.
 *
 * Shows the captured publication trace without requiring DevTools.
 * Gated behind ?pubTrace=1 URL param so normal users never see it.
 *
 * Remove after the root cause is identified and fixed.
 */

import React, { useSyncExternalStore } from "react";
import { getPublicationTrace, subscribePublicationTrace, clearPublicationTrace } from "./publicationTraceStore";

function Row({ label, value, ok }) {
  const color = ok === true ? "text-green-700" : ok === false ? "text-red-700 font-bold" : "text-gray-800";
  return (
    <div className="flex gap-2 text-[11px] py-0.5 border-b border-gray-100">
      <span className="w-56 flex-shrink-0 text-gray-500">{label}</span>
      <span className={color + " break-all"}>{String(value ?? "—")}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-3">
      <div className="text-[12px] font-bold text-[#213428] mb-1 border-b-2 border-[#213428] pb-0.5">{title}</div>
      <div>{children}</div>
    </div>
  );
}

export default function PublicationTracePanel() {
  const trace = useSyncExternalStore(subscribePublicationTrace, getPublicationTrace, getPublicationTrace);

  if (typeof window === "undefined") return null;
  const enabled = new URLSearchParams(window.location.search).get("pubTrace") === "1";
  if (!enabled) return null;

  return (
    <div className="fixed bottom-2 right-2 z-[9999] max-w-[680px] max-h-[80vh] overflow-auto bg-white border-2 border-[#213428] rounded-lg shadow-2xl p-3 text-[11px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-bold text-[#213428]">Publication Trace (TEMP)</span>
        <button onClick={clearPublicationTrace} className="text-[10px] px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100">Clear</button>
      </div>

      {!trace ? (
        <div className="text-gray-500 text-[11px] py-4 text-center">No trace captured yet. Press "Update Bass Performance" to capture.</div>
      ) : (
        <>
          <Section title="Trace sequence">
            {(trace.events || []).map((event, index) => (
              <Row key={index} label={`${index + 1}. ${event.capturedAt}`} value={`${event.effectPhase || "unknown"}${event.firstGuard ? ` — ${event.firstGuard}` : ""}`} />
            ))}
            <Row label="latest phase" value={trace.latestPhase} />
            <Row label="first failure phase" value={trace.firstFailurePhase} />
            <Row label="first failure guard" value={trace.firstFailureGuard} />
          </Section>
          <Section title="1. Request Identity">
            <Row label="cacheKey" value={trace.cacheKey} />
            <Row label="manualAnalysisRequest.fingerprint" value={trace.manualRequestFingerprint} />
            <Row label="dispatchedManualRequestRef.current" value={trace.dispatchedRef} />
            <Row label="manualRequestMatchesCurrent" value={trace.manualRequestMatchesCurrent} ok={trace.manualRequestMatchesCurrent} />
            <Row label="requestId" value={trace.requestId} />
            <Row label="authoritative.status" value={trace.authoritativeStatus} />
            <Row label="authoritative.reason" value={trace.authoritativeReason} />
            <Row label="requestManual.action" value={trace.requestManualAction} />
            <Row label="workerFactoryAvailable" value={trace.workerFactoryAvailable} />
          </Section>

          <Section title="2. Worker / Lifecycle">
            <Row label="lifecycle.status" value={trace.lifecycleStatus} />
            <Row label="lifecycle.resultFingerprint" value={trace.lifecycleResultFingerprint} />
            <Row label="lifecycle.currentJobFingerprint" value={trace.lifecycleCurrentJobFingerprint} />
            <Row label="workerStatus" value={trace.workerStatus} />
            <Row label="activeJobId" value={trace.activeJobId} />
            <Row label="calculationInProgress" value={trace.calculationInProgress} />
            <Row label="calculationOutcome" value={trace.calculationOutcome} />
            <Row label="lastTerminalOutcome" value={trace.lastTerminalOutcome} />
          </Section>

          <Section title="3. Contract Job">
            <Row label="contract.job.status" value={trace.contractJobStatus} />
            <Row label="contract.job.resultFingerprint" value={trace.contractJobResultFingerprint} />
            <Row label="contract.job.currentJobFingerprint" value={trace.contractJobCurrentJobFingerprint} />
            <Row label="contract.job.metricSchemaVersion" value={trace.contractJobMetricSchemaVersion} />
            <Row label="contract.version" value={trace.contractVersion} />
            <Row label="contract.metricSchemaVersion" value={trace.contractMetricSchemaVersion} />
          </Section>

          <Section title="4. Contract Content">
            <Row label="hasSelectedCandidate" value={trace.hasSelectedCandidate} ok={trace.hasSelectedCandidate} />
            <Row label="hasSelectedCandidateId" value={trace.hasSelectedCandidateId} ok={trace.hasSelectedCandidateId} />
            <Row label="hasGraphPayload" value={trace.hasGraphPayload} ok={trace.hasGraphPayload} />
            <Row label="hasP14Parameter" value={trace.hasP14Parameter} ok={trace.hasP14Parameter} />
            <Row label="hasP18Parameter" value={trace.hasP18Parameter} ok={trace.hasP18Parameter} />
            <Row label="p19.status" value={trace.p19Status} />
            <Row label="p19.level" value={trace.p19Level} />
            <Row label="p19.value" value={trace.p19Value} />
            <Row label="p19.notAssessable" value={trace.p19NotAssessable} />
            <Row label="p19.reason" value={trace.p19Reason} />
            <Row label="p20.status" value={trace.p20Status} />
            <Row label="p20.level" value={trace.p20Level} />
            <Row label="p20.value" value={trace.p20Value} />
            <Row label="p20.notAssessable" value={trace.p20NotAssessable} />
            <Row label="p20.reason" value={trace.p20Reason} />
          </Section>

          <Section title="5. Validation Results">
            <Row label="isStructurallyCompleteBassContract" value={trace.structuralComplete} ok={trace.structuralComplete} />
            {trace.structuralDiagnosis && (
              <Row label="↳ failed condition" value={trace.structuralDiagnosis.reason + (trace.structuralDiagnosis.detail ? " (" + trace.structuralDiagnosis.detail + ")" : "")} ok={false} />
            )}
            <Row label="isAuthoritativeBassContract" value={trace.authoritative} ok={trace.authoritative} />
            {trace.authoritativeDiagnosis && !trace.authoritativeDiagnosis.pass && (
              <Row label="↳ failed stage" value={trace.authoritativeDiagnosis.stage + ": " + trace.authoritativeDiagnosis.reason + (trace.authoritativeDiagnosis.detail ? " (" + trace.authoritativeDiagnosis.detail + ")" : "")} ok={false} />
            )}
          </Section>

          <Section title="6. Publication">
            <Row label="publishCompletedBassContract ran" value={trace.publishRan} ok={trace.publishRan} />
            <Row label="cached contract fingerprint" value={trace.cachedContractFingerprint} />
            <Row label="cached fingerprint matches current" value={trace.cachedFingerprintMatchesCurrent} />
            <Row label="cached contract authoritative" value={trace.cachedContractAuthoritative} />
            <Row label="cached graph payload" value={trace.cachedGraphPayload} />
            <Row label="cached P14 matches current" value={trace.cachedP14MatchesCurrent} />
            <Row label="cached publish returned" value={trace.cachePublishReturned} />
            <Row label="fresh contract structural" value={trace.freshContractStructural} />
            <Row label="fresh contract authoritative" value={trace.freshContractAuthoritative} />
            <Row label="published fingerprint" value={trace.publishedFingerprint} />
            <Row label="first guard that returned" value={trace.firstGuard} ok={false} />
          </Section>

          <Section title="7. Persistence">
            <Row label="syncPersistentBassAuthority ran" value={trace.syncRan} ok={trace.syncRan} />
            <Row label="canPersistCurrent" value={trace.canPersistCurrent} ok={trace.canPersistCurrent} />
            <Row label="completedContract resultFingerprint" value={trace.completedResultFingerprint} />
          </Section>

          <Section title="Meta">
            <Row label="capturedAt" value={trace.capturedAt} />
            <Row label="effectPhase" value={trace.effectPhase} />
          </Section>
        </>
      )}
    </div>
  );
}