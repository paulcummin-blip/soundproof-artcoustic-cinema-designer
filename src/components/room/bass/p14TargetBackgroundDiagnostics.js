// p14TargetBackgroundDiagnostics.js — Pure diagnostic and decision functions
// for the P14 background target scheduler.
//
// This module does NOT:
//   - Change bass maths, optimiser, P19/P20, or target definitions
//   - Touch the cache schema, fingerprints, or completed authority
//   - Modify graph payload requirements or persistence architecture
//   - Change the contract-builder structure
//
// It provides pure functions for:
//   - resolveBackgroundTargetAdvance: advance/retry/fail/discard decision
//   - captureTargetFailureDiagnostics: compact diagnostic snapshot (no large arrays)
//   - formatDiagnosticLine: safeConsole-friendly summary string
//   - createSweepDiagnostics: fresh sweep tracking state

import { isAuthoritativeBassContract } from "./completedBassResultPersistence";
import { hasGraphPayload } from "./finishedGraphAdapter";
import { hasReadyCanonicalP19Contract } from "./p19Readiness";

export const MAX_BACKGROUND_TARGET_RETRIES = 1;

/**
 * Classify a worker pool result for the background scheduler.
 *
 * Mirrors the foreground classification order in bassBackgroundAnalysisStore.js:
 *   1. generationStatus exists AND !== "complete" → real generation status
 *      (e.g. "invalid-inputs", "invalid-anchor"). This is the actual failure
 *      reason — do NOT mask it as "empty-pool".
 *   2. generationStatus === "complete" (or absent) AND zero candidates →
 *      "no-candidates" fallback (structurally unusual; identity candidate
 *      should exist when generation completes).
 *   3. generationStatus === "complete" AND candidates present → null
 *      (normal processing — caller proceeds with contract build).
 *
 * @param {object|null|undefined} pool - the optimiser pool from the worker message
 * @returns {string|null} failureReason — null means proceed with normal processing
 */
export function classifyBackgroundPoolFailure(pool) {
  if (!pool) return 'no-pool';
  if (pool.generationStatus && pool.generationStatus !== 'complete') {
    return pool.generationStatus;
  }
  if (!Array.isArray(pool.candidates) || pool.candidates.length === 0) {
    return 'no-candidates';
  }
  return null;
}

/**
 * Capture compact diagnostics for a non-complete generationStatus failure.
 * Records only counts and lengths — never large curve arrays.
 *
 * @returns {object} compact diagnostic snapshot
 */
export function captureGenerationFailureDiagnostics({
  targetKey,
  pool,
  designContext,
  fingerprint,
  baseDesignFingerprint,
  retryCount,
}) {
  const ctx = designContext || {};
  return {
    targetKey,
    generationStatus: pool?.generationStatus || null,
    missingInputs: Array.isArray(pool?.missingInputs) ? [...pool.missingInputs] : [],
    rawCurveLength: Array.isArray(ctx.rspRawCurve) ? ctx.rspRawCurve.length : null,
    activeSubsCount: Array.isArray(ctx.sources) ? ctx.sources.length : null,
    verticalOffsetDb: ctx.payload?.verticalOffsetDb ?? null,
    requestFingerprint: fingerprint ? fingerprint.substring(0, 24) : null,
    baseDesignFingerprint: baseDesignFingerprint ? baseDesignFingerprint.substring(0, 24) : null,
    retryCount: retryCount || 0,
    warningMessage: pool?.warningMessage || null,
  };
}

/**
 * Format a generation-failure diagnostic snapshot as a single console line.
 * Does not include large arrays — only counts, lengths, and the missing-inputs list.
 */
export function formatGenerationFailureLine(diag) {
  if (!diag) return '';
  const parts = [
    `target ${diag.targetKey}: generation failure`,
    `status=${diag.generationStatus}`,
    `missingInputs=[${(diag.missingInputs || []).join(',')}]`,
    `rawCurveLen=${diag.rawCurveLength}`,
    `activeSubs=${diag.activeSubsCount}`,
    `verticalOffset=${diag.verticalOffsetDb}`,
    `retry=${diag.retryCount}`,
  ];
  if (diag.warningMessage) parts.push(`— ${diag.warningMessage}`);
  return parts.join(' ');
}

/**
 * Create a fresh sweep diagnostics tracker.
 */
export function createSweepDiagnostics() {
  return {
    attempted: [],
    insertedFirstTry: [],
    retried: [],
    failedAfterRetry: [],
    failures: [],
  };
}

/**
 * Pure decision function: given insertion result, readback, retry count,
 * fingerprint state, and cancellation state, decide the next scheduler action.
 *
 * Priority:
 *   1. cancelled -> discard (not a failure)
 *   2. fingerprintChanged -> discard (not a failure, design moved on)
 *   3. insertResult && readbackResult -> advance (success)
 *   4. retryCount < maxRetries -> retry (bounded)
 *   5. else -> fail (exhausted retries)
 *
 * A target is considered complete ONLY when setTargetCacheEntry returns true
 * AND getTargetCacheEntry readback returns the same authoritative entry.
 *
 * @returns {{ action: 'advance'|'retry'|'fail'|'discard', retryCount: number }}
 */
export function resolveBackgroundTargetAdvance({
  insertResult,
  readbackResult,
  retryCount = 0,
  maxRetries = MAX_BACKGROUND_TARGET_RETRIES,
  fingerprintChanged = false,
  cancelled = false,
}) {
  if (cancelled) return { action: 'discard', retryCount };
  if (fingerprintChanged) return { action: 'discard', retryCount };
  if (insertResult && readbackResult) return { action: 'advance', retryCount: 0 };
  if (retryCount < maxRetries) return { action: 'retry', retryCount: retryCount + 1 };
  return { action: 'fail', retryCount };
}

/**
 * Capture a compact diagnostic snapshot of a failed target insertion.
 * Records gate pass/fail and key sub-fields without exposing large arrays.
 *
 * @returns {object} diagnostic snapshot
 */
export function captureTargetFailureDiagnostics({
  targetKey,
  compactContract,
  workerResult,
  fingerprint,
  calibrationFingerprint,
  baseDesignFingerprint,
  foregroundTargetKey,
  retryCount,
  cancelled,
  failureReason,
}) {
  const contract = compactContract || null;
  const gateA = isAuthoritativeBassContract(contract);
  const gateB = hasGraphPayload(contract);
  const gateC = hasReadyCanonicalP19Contract(contract);

  const job = contract?.job || {};
  const selectedCandidate = contract?.selectedCandidate || {};
  const metricPub = contract?.metricPublication || {};
  const provenance = contract?.provenance || {};
  const p19 = contract?.productAnalysis?.parameters?.p19 || {};
  const graph = contract?.graphPayload || {};

  return {
    targetKey,
    failureReason: failureReason || (contract ? 'insert-rejected' : 'contract-build-null'),
    cancelled: !!cancelled,
    retryCount: retryCount || 0,
    baseDesignFingerprint: baseDesignFingerprint ? baseDesignFingerprint.substring(0, 24) : null,
    foregroundTargetKey: foregroundTargetKey || null,
    workerCompleted: !!workerResult,
    compactContractExists: !!contract,
    fingerprint: fingerprint ? fingerprint.substring(0, 24) : null,
    calibrationFingerprint: calibrationFingerprint ? calibrationFingerprint.substring(0, 24) : null,
    gateA: {
      pass: gateA,
      jobStatus: job.status || null,
      selectedCandidateId: contract?.selectedCandidateId || null,
      resultFingerprint: job.resultFingerprint ? job.resultFingerprint.substring(0, 24) : null,
      currentJobFingerprint: job.currentJobFingerprint ? job.currentJobFingerprint.substring(0, 24) : null,
      instanceAuthorityVersion: contract?.instanceAuthorityVersion || null,
      metricSchemaVersion: contract?.metricSchemaVersion || null,
      resultSchemaVersion: job.resultSchemaVersion || null,
      canonicalMetricPublicationValid: metricPub.canonicalMetricPublicationValid ?? null,
      publicationRejectionReason: metricPub.publicationRejectionReason || null,
    },
    gateB: {
      pass: gateB,
      postEqRspCurveLength: graph.postEqRspCurve?.length ?? null,
      productionHouseCurveTargetLength: graph.productionHouseCurveTarget?.length ?? null,
      postEqPerSeatCurvesCount: graph.postEqPerSeatCurves?.length ?? null,
    },
    gateC: {
      pass: gateC,
      p19Status: p19.status || null,
      p19Value: Number.isFinite(p19.value) ? p19.value : null,
      p19Level: Number.isFinite(p19.level) ? p19.level : null,
      perSeatP19ResultsCount: selectedCandidate.perSeatP19Results?.length ?? null,
      realSeatCount: provenance.realSeatCount ?? null,
    },
  };
}

/**
 * Format a diagnostic snapshot as a single safeConsole-friendly line.
 * Does not include large arrays — only gate pass/fail and key counts.
 */
export function formatDiagnosticLine(diag) {
  if (!diag) return '';
  const ga = diag.gateA?.pass ? 'PASS' : 'FAIL';
  const gb = diag.gateB?.pass ? 'PASS' : 'FAIL';
  const gc = diag.gateC?.pass ? 'PASS' : 'FAIL';
  return `target ${diag.targetKey}: FAILED (reason=${diag.failureReason} retry=${diag.retryCount} gateA=${ga} gateB=${gb} gateC=${gc} contract=${diag.compactContractExists ? 'YES' : 'NO'} worker=${diag.workerCompleted ? 'YES' : 'NO'})`;
}