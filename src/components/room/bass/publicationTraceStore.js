/**
 * publicationTraceStore.js — TEMPORARY diagnostic trace store.
 *
 * Captures the exact state of the publish effect at each decision point so
 * the exact failed handoff can be identified without DevTools.
 *
 * This module does NOT change publication rules, acoustics, optimiser maths,
 * lifecycle UX, or persistence behaviour. It is read-only instrumentation.
 *
 * Remove after the root cause is identified and fixed.
 */

import { BASS_ANALYSIS_CONTRACT_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } from "@/lib/bassAuthorityVersion";
import { validateAssessmentEnvelopeAuthority } from "./completedBassResultPersistence";
import { validateCanonicalBassResult } from "./canonicalBassResult";

// ── External store ──────────────────────────────────────────────────────

let _trace = null;
const _subscribers = new Set();

function notify() {
  for (const cb of _subscribers) {
    try { cb(_trace); } catch { /* swallow */ }
  }
}

export function capturePublicationTrace(snapshot) {
  _trace = { ...snapshot, capturedAt: new Date().toISOString() };
  notify();
}

export function getPublicationTrace() {
  return _trace;
}

export function subscribePublicationTrace(cb) {
  _subscribers.add(cb);
  return () => _subscribers.delete(cb);
}

export function clearPublicationTrace() {
  _trace = null;
  notify();
}

// ── Diagnostic helpers ──────────────────────────────────────────────────
// These replicate the logic of isStructurallyCompleteBassContract and
// isAuthoritativeBassContract but return the SPECIFIC failed sub-condition
// instead of a boolean. They do NOT change the actual gate functions.

export function diagnoseStructuralCompleteness(contract) {
  const status = contract?.job?.status;
  if (!["ready", "complete"].includes(status)) {
    return { pass: false, reason: "job-not-ready-or-complete", detail: `status=${status}` };
  }
  if (contract?.version !== BASS_ANALYSIS_CONTRACT_VERSION) {
    return { pass: false, reason: "contract-version-mismatch", detail: `got=${contract?.version}, expected=${BASS_ANALYSIS_CONTRACT_VERSION}` };
  }
  if (contract?.metricSchemaVersion !== RP22_BASS_METRIC_SCHEMA_VERSION) {
    return { pass: false, reason: "metric-schema-mismatch", detail: `got=${contract?.metricSchemaVersion}, expected=${RP22_BASS_METRIC_SCHEMA_VERSION}` };
  }
  if (contract?.job?.metricSchemaVersion !== RP22_BASS_METRIC_SCHEMA_VERSION) {
    return { pass: false, reason: "job-metric-schema-mismatch", detail: `got=${contract?.job?.metricSchemaVersion}, expected=${RP22_BASS_METRIC_SCHEMA_VERSION}` };
  }
  if (!contract?.selectedCandidate) {
    return { pass: false, reason: "selectedCandidate-missing", detail: null };
  }
  if (!contract?.selectedCandidateId) {
    return { pass: false, reason: "selectedCandidateId-missing", detail: null };
  }
  if (!contract?.job?.resultFingerprint) {
    return { pass: false, reason: "resultFingerprint-missing", detail: null };
  }
  if (!contract?.job?.currentJobFingerprint) {
    return { pass: false, reason: "currentJobFingerprint-missing", detail: null };
  }
  if (contract.job.resultFingerprint !== contract.job.currentJobFingerprint) {
    return { pass: false, reason: "fingerprint-mismatch", detail: `result=${contract.job.resultFingerprint}, current=${contract.job.currentJobFingerprint}` };
  }
  return { pass: true, reason: null, detail: null };
}

export function diagnoseAuthoritative(contract) {
  const structural = diagnoseStructuralCompleteness(contract);
  if (!structural.pass) {
    return { pass: false, stage: "structural", reason: structural.reason, detail: structural.detail };
  }
  // hasCanonicalSeatMetricAuthority (replicated — not exported from persistence)
  const realSeatCount = Number(contract?.provenance?.realSeatCount);
  if (!Number.isInteger(realSeatCount) || realSeatCount < 0) {
    return { pass: false, stage: "hasCanonicalSeatMetricAuthority", reason: "realSeatCount-invalid", detail: `realSeatCount=${realSeatCount}` };
  }
  const p19Param = contract?.productAnalysis?.parameters?.p19;
  const p19NotAssessable = p19Param?.notAssessable === true;
  const p19Seats = contract?.selectedCandidate?.perSeatP19Results;
  if (!p19NotAssessable && realSeatCount > 0 && (!Array.isArray(p19Seats)
    || p19Seats.length !== realSeatCount
    || p19Seats.some((seat) => !seat?.seatId || !Number.isFinite(seat?.variationDbRaw) || !Number.isFinite(seat?.level)))) {
    return { pass: false, stage: "hasCanonicalSeatMetricAuthority", reason: "p19-per-seat-invalid", detail: `seats=${Array.isArray(p19Seats) ? p19Seats.length : "not-array"}, expected=${realSeatCount}` };
  }
  const p20Param = contract?.productAnalysis?.parameters?.p20;
  const p20NotAssessable = p20Param?.notAssessable === true;
  const p20Seats = contract?.selectedCandidate?.perSeatP20Results;
  if (!p20NotAssessable && p20Param?.status === "complete" && (!Array.isArray(p20Seats)
    || p20Seats.length !== realSeatCount
    || p20Seats.some((seat) => !seat?.seatId || !Number.isFinite(seat?.variationDbRaw) || !Number.isFinite(seat?.level)))) {
    return { pass: false, stage: "hasCanonicalSeatMetricAuthority", reason: "p20-per-seat-invalid", detail: `seats=${Array.isArray(p20Seats) ? p20Seats.length : "not-array"}, expected=${realSeatCount}` };
  }
  // validateAssessmentEnvelopeAuthority
  const envelope = validateAssessmentEnvelopeAuthority(contract);
  if (!envelope.valid) {
    return { pass: false, stage: "validateAssessmentEnvelopeAuthority", reason: envelope.reason, detail: null };
  }
  // validateCanonicalBassResult (only for compact contracts)
  if (!contract?.finalOptimisedBassResponse) {
    const bassResult = validateCanonicalBassResult(contract);
    if (!bassResult.valid) {
      return { pass: false, stage: "validateCanonicalBassResult", reason: bassResult.reason, detail: null };
    }
  }
  // metric publication receipt
  const pub = contract?.metricPublication;
  if (!pub || pub.canonicalMetricPublicationValid !== true) {
    return { pass: false, stage: "metric-publication-receipt", reason: "canonicalMetricPublicationValid-not-true", detail: `pub=${!!pub}, valid=${pub?.canonicalMetricPublicationValid}` };
  }
  return { pass: true, stage: null, reason: null, detail: null };
}