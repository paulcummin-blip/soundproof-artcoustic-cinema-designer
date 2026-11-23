/**
 * capturePerformanceTelemetry.js
 * ------------------------------
 * Structured timing diagnostics for the PDF export pipeline. Records per-page
 * capture durations, PDF assembly time, private-storage upload time and
 * readback verification time, and makes the summary available through an
 * in-memory store (and window.__SOUNDPROOF_EXPORT_TIMING__) so an administrator
 * can read it without relying solely on the browser console.
 *
 * No client content or sensitive data is recorded — only durations, page
 * numbers and document-type/filename identifiers.
 */

const MAX_RECORDS = 20;
const records = [];
const listeners = new Set();

function announce() {
  listeners.forEach((listener) => {
    try { listener(records.slice()); } catch { /* a listener must never fail the store */ }
  });
}

export function subscribeExportTimings(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readExportTimings() {
  return records.slice();
}

export function recordExportTiming(record) {
  if (!record || typeof record !== 'object') return null;
  try {
    records.unshift(record);
    if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
    console.info('[ReportExport] timing record', record);
    if (typeof window !== 'undefined') {
      window.__SOUNDPROOF_EXPORT_TIMING__ = records;
    }
    announce();
  } catch { /* nothing about diagnostics may fail the export */ }
  return record;
}

export function clearExportTimings() {
  records.length = 0;
  if (typeof window !== 'undefined') window.__SOUNDPROOF_EXPORT_TIMING__ = records;
  announce();
}

const nowFn = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

/**
 * A timing recorder for one export. Records stage boundaries and per-page
 * durations, then summarises them.
 */
export function createCaptureTelemetry() {
  const start = nowFn();
  const pageTimes = [];
  let _captureStart = null;
  let captureMs = null;
  let _assemblyStart = null;
  let assemblyMs = null;
  let _uploadStart = null;
  let uploadMs = null;
  let _verifyStart = null;
  let verifyMs = null;

  return {
    beginCapture() { _captureStart = nowFn(); },
    recordPage(pageNumber, durationMs) {
      pageTimes.push({ page: pageNumber, ms: Math.round(durationMs) });
    },
    endCapture() {
      if (_captureStart !== null) { captureMs = Math.round(nowFn() - _captureStart); _captureStart = null; }
    },
    beginAssembly() { _assemblyStart = nowFn(); },
    endAssembly() {
      if (_assemblyStart !== null) { assemblyMs = Math.round(nowFn() - _assemblyStart); _assemblyStart = null; }
    },
    beginUpload() { _uploadStart = nowFn(); },
    endUpload() {
      if (_uploadStart !== null) { uploadMs = Math.round(nowFn() - _uploadStart); _uploadStart = null; }
    },
    beginVerify() { _verifyStart = nowFn(); },
    endVerify() {
      if (_verifyStart !== null) { verifyMs = Math.round(nowFn() - _verifyStart); _verifyStart = null; }
    },
    summary(extra = {}) {
      const total = Math.round(nowFn() - start);
      const times = pageTimes.map((p) => p.ms);
      const totalCapture = times.reduce((a, b) => a + b, 0);
      const avgCapture = times.length > 0 ? Math.round(totalCapture / times.length) : 0;
      const slowest = pageTimes.reduce((max, p) => (p.ms > max.ms ? p : max), { page: 0, ms: 0 });
      return {
        total_ms: total,
        total_s: Math.round(total / 100) / 10,
        page_count: pageTimes.length,
        capture_total_ms: captureMs ?? totalCapture,
        capture_avg_ms: avgCapture,
        capture_slowest: slowest,
        assembly_ms: assemblyMs,
        upload_ms: uploadMs,
        verify_ms: verifyMs,
        ...extra,
      };
    },
  };
}