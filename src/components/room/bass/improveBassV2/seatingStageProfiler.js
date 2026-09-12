// seatingStageProfiler.js
// Lightweight instrumentation for the seating position search stage.
//
// Records timing for the seating-batch worker phase:
//   - preparedSourceRoomMs: time to prepare the immutable source/room field
//   - receiverEvaluationMs per offset: time to evaluate receivers from prepared field
//   - batchWorkerMs: total worker round-trip time
//   - proxyEvalMs: time to compute proxy metrics per offset
//   - confirmationMs: canonical confirmation time
//
// This is a read-only profiler — it does NOT alter the search algorithm,
// candidate generation, or ranking. It only records timings for diagnostic
// purposes.
//
// Usage:
//   const profiler = createSeatingProfiler();
//   profiler.recordBatchTiming({ preparedSourceRoomMs, batchWorkerMs, perOffsetMs });
//   profiler.recordCandidate(offsetMm, { proxyEvalMs });
//   profiler.recordConfirmation(offsetMm, { confirmMs });
//   const report = profiler.getReport();

/**
 * Create a seating stage profiler instance.
 */
export function createSeatingProfiler() {
  const candidates = [];
  let batchTiming = null;
  let confirmationRecorded = null;

  return {
    recordCandidate(offsetMm, { proxyEvalMs, receiverEvalMs }) {
      candidates.push({
        offsetMm,
        proxyEvalMs: Number(proxyEvalMs) || 0,
        receiverEvalMs: Number(receiverEvalMs) || 0,
      });
    },

    recordBatchTiming({ preparedSourceRoomMs, batchWorkerMs, perOffsetMs }) {
      batchTiming = {
        preparedSourceRoomMs: Number(preparedSourceRoomMs) || 0,
        batchWorkerMs: Number(batchWorkerMs) || 0,
        perOffsetMs: Array.isArray(perOffsetMs) ? perOffsetMs.map((t) => Number(t) || 0) : [],
      };
    },

    recordConfirmation(offsetMm, { confirmMs }) {
      confirmationRecorded = { offsetMm, confirmMs: Number(confirmMs) || 0 };
    },

    getReport() {
      const totalProxyEval = candidates.reduce((s, c) => s + c.proxyEvalMs, 0);
      const totalReceiverEval = candidates.reduce((s, c) => s + c.receiverEvalMs, 0);
      const confirmationMs = confirmationRecorded?.confirmMs || 0;
      const preparedSourceRoomMs = batchTiming?.preparedSourceRoomMs || 0;
      const batchWorkerMs = batchTiming?.batchWorkerMs || 0;

      return {
        candidateCount: candidates.length,
        preparedSourceRoomMs,
        batchWorkerMs,
        totalReceiverEvalMs: totalReceiverEval,
        totalProxyEvalMs: totalProxyEval,
        confirmationMs,
        confirmationOffsetMm: confirmationRecorded?.offsetMm ?? null,
        totalMs: batchWorkerMs + totalProxyEval + confirmationMs,
        perCandidate: candidates.map((c) => ({
          offsetMm: c.offsetMm,
          proxyEvalMs: c.proxyEvalMs,
          receiverEvalMs: c.receiverEvalMs,
        })),
        perOffsetMs: batchTiming?.perOffsetMs || [],
      };
    },
  };
}

/**
 * Format a profiler report as a human-readable diagnostic string.
 */
export function formatSeatingProfileReport(report) {
  if (!report) return "No seating profile data";
  const lines = [
    `Seating Stage Profile:`,
    `  Candidates: ${report.candidateCount}`,
    `  Total: ${report.totalMs.toFixed(1)} ms`,
    `  Prepared source/room field: ${report.preparedSourceRoomMs.toFixed(1)} ms`,
    `  Batch worker (round-trip): ${report.batchWorkerMs.toFixed(1)} ms`,
    `  Receiver evaluation (per-offset total): ${report.totalReceiverEvalMs.toFixed(1)} ms`,
    `  Proxy eval (computeProxyMetrics): ${report.totalProxyEvalMs.toFixed(1)} ms`,
    `  Canonical confirmation: ${report.confirmationMs.toFixed(1)} ms (offset ${report.confirmationOffsetMm} mm)`,
    `  Per-candidate:`,
  ];
  for (const c of report.perCandidate) {
    lines.push(
      `    ${c.offsetMm >= 0 ? "+" : ""}${c.offsetMm} mm: receiver=${c.receiverEvalMs.toFixed(1)}ms proxy=${c.proxyEvalMs.toFixed(1)}ms`,
    );
  }
  return lines.join("\n");
}