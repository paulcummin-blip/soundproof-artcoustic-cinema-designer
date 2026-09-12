// seatingStageProfiler.js
// Lightweight instrumentation for the seating position search stage.
//
// Records per-candidate timing for the 11 seating offsets:
//   - proxy preparation time (placement worker call)
//   - transfer preparation time (inside placement worker)
//   - proxy evaluation time (computeProxyMetrics)
//   - canonical confirmation time (confirmation worker call)
//   - cache hit/miss
//
// This is a read-only profiler — it does NOT alter the search algorithm,
// candidate generation, or ranking. It only records timings for diagnostic
// purposes so we can identify the exact bottleneck in the ~5.87 s seating stage.
//
// Usage:
//   const profiler = createSeatingProfiler();
//   profiler.recordCandidate(offsetMm, { proxyPrepMs, proxyEvalMs, cacheHit });
//   profiler.recordConfirmation(offsetMm, { confirmMs });
//   const report = profiler.getReport();

/**
 * Create a seating stage profiler instance.
 */
export function createSeatingProfiler() {
  const candidates = [];
  let confirmationRecorded = null;

  return {
    recordCandidate(offsetMm, { proxyPrepMs, proxyEvalMs, cacheHit, transferPrepMs }) {
      candidates.push({
        offsetMm,
        proxyPrepMs: Number(proxyPrepMs) || 0,
        proxyEvalMs: Number(proxyEvalMs) || 0,
        transferPrepMs: Number(transferPrepMs) || 0,
        cacheHit: !!cacheHit,
      });
    },

    recordConfirmation(offsetMm, { confirmMs }) {
      confirmationRecorded = { offsetMm, confirmMs: Number(confirmMs) || 0 };
    },

    getReport() {
      const totalProxyPrep = candidates.reduce((s, c) => s + c.proxyPrepMs, 0);
      const totalProxyEval = candidates.reduce((s, c) => s + c.proxyEvalMs, 0);
      const totalTransferPrep = candidates.reduce((s, c) => s + c.transferPrepMs, 0);
      const cacheHits = candidates.filter((c) => c.cacheHit).length;
      const cacheMisses = candidates.length - cacheHits;

      return {
        candidateCount: candidates.length,
        totalProxyPrepMs: totalProxyPrep,
        totalProxyEvalMs: totalProxyEval,
        totalTransferPrepMs: totalTransferPrep,
        confirmationMs: confirmationRecorded?.confirmMs || 0,
        confirmationOffsetMm: confirmationRecorded?.offsetMm ?? null,
        cacheHits,
        cacheMisses,
        totalMs: totalProxyPrep + totalProxyEval + (confirmationRecorded?.confirmMs || 0),
        perCandidate: candidates.map((c) => ({
          offsetMm: c.offsetMm,
          proxyPrepMs: c.proxyPrepMs,
          proxyEvalMs: c.proxyEvalMs,
          transferPrepMs: c.transferPrepMs,
          cacheHit: c.cacheHit,
        })),
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
    `  Proxy prep (placement worker): ${report.totalProxyPrepMs.toFixed(1)} ms`,
    `  Proxy eval (computeProxyMetrics): ${report.totalProxyEvalMs.toFixed(1)} ms`,
    `  Transfer prep (inside worker): ${report.totalTransferPrepMs.toFixed(1)} ms`,
    `  Canonical confirmation: ${report.confirmationMs.toFixed(1)} ms (offset ${report.confirmationOffsetMm} mm)`,
    `  Cache: ${report.cacheHits} hits / ${report.cacheMisses} misses`,
    `  Per-candidate:`,
  ];
  for (const c of report.perCandidate) {
    lines.push(
      `    ${c.offsetMm >= 0 ? "+" : ""}${c.offsetMm} mm: prep=${c.proxyPrepMs.toFixed(1)}ms eval=${c.proxyEvalMs.toFixed(1)}ms ${c.cacheHit ? "[cached]" : "[fresh]"}`,
    );
  }
  return lines.join("\n");
}