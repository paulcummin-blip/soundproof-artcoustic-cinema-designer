/**
 * aiSummaryReadiness.js
 * ---------------------
 * The ONE canonical readiness gate for AI Client Summary generation.
 *
 * AI generation is enabled ONLY when the Design Rating authority is settled
 * and published. This gate consumes the same published Design Review handoff
 * snapshot that the sidebar, reports, and PDFs consume.
 *
 * A snapshot is AI-ready when:
 *   1. It exists for the requested project + version
 *   2. It carries a full Engineering Summary
 *   3. The Engineering Summary has finite DPI scores for Primary, Secondary,
 *      and All seats (proves the rating was publishable at publication time)
 *   4. It carries a bass calculation fingerprint
 *   5. It carries a seat-priority fingerprint
 *
 * If any check fails, the gate returns { ready: false, reason } so the UI can
 * show a neutral status and disable the Generate action.
 *
 * Pure: no React, no side effects, no recalculation.
 */

/**
 * @param {Object} params
 * @param {Object|null} params.publishedSnapshot - From readDesignReviewHandoff
 * @param {string} params.projectId            - Requested project ID
 * @param {string} params.versionId            - Requested version ID
 * @returns {{ ready: boolean, reason: string }}
 */
export function isAiSummaryReady({ publishedSnapshot, projectId, versionId }) {
  if (!publishedSnapshot) return { ready: false, reason: "waiting-for-analysis" };

  if (String(publishedSnapshot.projectId || "") !== String(projectId || ""))
    return { ready: false, reason: "project-mismatch" };

  if (String(publishedSnapshot.versionId || "") !== String(versionId || ""))
    return { ready: false, reason: "version-mismatch" };

  const summary = publishedSnapshot.engineeringSummary;
  if (!summary) return { ready: false, reason: "waiting-for-analysis" };

  // ── DPI scores must be present and finite (proves publishable state) ──
  // Number(null) === 0 which IS finite, so check null/undefined explicitly.
  const primaryDpi = summary.primary?.designPerformanceIndex;
  const secondaryDpi = summary.secondary?.designPerformanceIndex;
  const allDpi = summary.project?.designPerformanceIndex;

  if (primaryDpi == null || !Number.isFinite(Number(primaryDpi)))
    return { ready: false, reason: "waiting-for-analysis" };
  if (secondaryDpi == null || !Number.isFinite(Number(secondaryDpi)))
    return { ready: false, reason: "waiting-for-analysis" };
  if (allDpi == null || !Number.isFinite(Number(allDpi)))
    return { ready: false, reason: "waiting-for-analysis" };

  // ── Fingerprints must be present (proves settled bass + seat scope) ──
  const bassFingerprint = publishedSnapshot.calculationFingerprint;
  if (!bassFingerprint)
    return { ready: false, reason: "waiting-for-bass" };

  const seatPriorityFingerprint =
    publishedSnapshot.rating?.seatPriorityFingerprint ||
    summary.seatPriorityFingerprint;
  if (!seatPriorityFingerprint)
    return { ready: false, reason: "waiting-for-analysis" };

  return { ready: true, reason: "settled" };
}

/**
 * Human-readable neutral status for each non-ready reason.
 * Never exposes internal authority state — always client-safe.
 */
export function aiSummaryReadinessLabel(reason) {
  switch (reason) {
    case "settled":
      return null; // No label when ready
    case "waiting-for-analysis":
      return "Waiting for current design analysis";
    case "waiting-for-bass":
      return "Waiting for bass analysis to settle";
    case "project-mismatch":
    case "version-mismatch":
      return "Waiting for current design analysis";
    default:
      return "Waiting for current design analysis";
  }
}