// p14BgTimingsBuffer.js — Bounded read-only diagnostics ring buffer for P14
// background completion timings.
//
// Exposed as window.__P14_BG_TIMINGS__ in preview/testing so the Work audit
// can observe per-function completion costs WITHOUT DEV-gated console logs
// (the Base44 preview is a production build, so import.meta.env.DEV is false
// and the p14-bg-timing console lines are stripped).
//
// Each record contains ONLY: targetKey, timestamp, and per-function ms
// durations. No curves, no project/client identifying data, no payloads.
//
// Bounded to the most recent ~20 records (ring buffer).

const MAX_RECORDS = 20;
const records = [];

function expose() {
  if (typeof window !== "undefined") {
    window.__P14_BG_TIMINGS__ = records;
  }
}

/**
 * Push a pre-built timing record onto the ring buffer.
 */
export function pushP14BgTimingRecord(record) {
  records.push(record);
  if (records.length > MAX_RECORDS) records.shift();
  expose();
}

/**
 * Build and push a timing record from the scheduler's internal timings map.
 * Maps internal short keys to the full diagnostic field names expected by
 * the Work audit. Always called (not DEV-gated) so the ring buffer is
 * populated in the preview environment.
 */
export function pushP14BgTimingRecordFromTimings(targetKey, timings) {
  if (!timings) return;
  const total =
    (timings.select || 0) +
    (timings.finalResponse || 0) +
    (timings.authority || 0) +
    (timings.applyAuthority || 0) +
    (timings.metricAuthority || 0) +
    (timings.publication || 0) +
    (timings.adapter || 0) +
    (timings.compact || 0) +
    (timings.graphPayload || 0) +
    (timings.cacheInsert || 0) +
    (timings.readback || 0);
  pushP14BgTimingRecord({
    targetKey,
    timestamp: Date.now(),
    selectCandidateFromPoolMs: timings.select || 0,
    buildFinalOptimisedBassResponseMs: timings.finalResponse || 0,
    evaluateCanonicalBassAuthorityMs: timings.authority || 0,
    applyAuthorityToCanonicalResultMs: timings.applyAuthority || 0,
    buildCanonicalCompletedBassMetricAuthorityMs: timings.metricAuthority || 0,
    buildMetricPublicationReceiptMs: timings.publication || 0,
    adaptCurrentBassOptimisationResultMs: timings.adapter || 0,
    compactCompletedBassContractMs: timings.compact || 0,
    buildGraphPayloadMs: timings.graphPayload || 0,
    setTargetCacheEntryMs: timings.cacheInsert || 0,
    readbackMs: timings.readback || 0,
    totalMainThreadCompletionMs: total,
  });
}

export function getP14BgTimings() {
  return records.slice();
}

export function resetP14BgTimingsForTest() {
  records.length = 0;
  expose();
}