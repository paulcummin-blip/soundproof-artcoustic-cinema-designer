/**
 * aiSummaryStaleDetection.js
 * --------------------------
 * Detects whether a previously generated AI Client Summary is stale — i.e.
 * the design has changed since generation.
 *
 * A summary is stale when its stored fingerprints (bass calculation
 * fingerprint, seat-priority fingerprint) no longer match the current
 * published Design Review snapshot's fingerprints.
 *
 * Pure: no React, no side effects.
 */

/**
 * @param {Object} params
 * @param {Object|null} params.summaryRecord   - Stored AiClientSummary record
 * @param {Object|null} params.currentSnapshot  - Current published Design Review snapshot
 * @returns {boolean}
 */
export function isAiSummaryStale({ summaryRecord, currentSnapshot }) {
  if (!summaryRecord || !currentSnapshot) return true;

  const stored = summaryRecord.generated_from_fingerprints || {};
  const currentBassFp = currentSnapshot.calculationFingerprint;
  const currentSeatFp =
    currentSnapshot.rating?.seatPriorityFingerprint ||
    currentSnapshot.engineeringSummary?.seatPriorityFingerprint;

  const bassMatch =
    String(stored.calculationFingerprint || "") === String(currentBassFp || "");
  const seatMatch =
    String(stored.seatPriorityFingerprint || "") === String(currentSeatFp || "");

  return !(bassMatch && seatMatch);
}

/**
 * Extract the fingerprint identity from a published snapshot for storage
 * on the AI summary record at generation time.
 */
export function extractGenerationFingerprints(snapshot) {
  if (!snapshot) return null;
  return {
    calculationFingerprint: snapshot.calculationFingerprint || null,
    seatPriorityFingerprint:
      snapshot.rating?.seatPriorityFingerprint ||
      snapshot.engineeringSummary?.seatPriorityFingerprint ||
      null,
  };
}