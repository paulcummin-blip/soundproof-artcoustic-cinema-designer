import React, { useEffect, useState } from "react";
import { readExportTimings, subscribeExportTimings } from "@/components/library/capturePerformanceTelemetry";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  card: "#FFFFFF",
};

function formatMs(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function Metric({ label, value }) {
  return (
    <div style={{ padding: "10px 12px", background: BRAND.bg, borderRadius: 8, border: `1px solid ${BRAND.border}` }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>{value}</div>
    </div>
  );
}

export default function ExportTimingSection() {
  const [timings, setTimings] = useState(() => readExportTimings());

  useEffect(() => {
    const unsubscribe = subscribeExportTimings(setTimings);
    setTimings(readExportTimings());
    return unsubscribe;
  }, []);

  const latest = timings[0];

  return (
    <div style={{
      background: BRAND.card, border: `1px solid ${BRAND.border}`,
      borderRadius: 12, overflow: "hidden", marginBottom: 20,
    }}>
      <div style={{
        padding: "14px 16px", borderBottom: `1px solid ${BRAND.border}`,
        fontSize: 14, fontWeight: 700, color: BRAND.text,
      }}>
        PDF Export Performance
      </div>
      {!latest ? (
        <div style={{ padding: "16px", fontSize: 13, color: BRAND.subtext }}>
          No export timings recorded yet. Export a Project Report to see performance data.
        </div>
      ) : (
        <div style={{ padding: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Metric label="Total time" value={formatMs(latest.total_ms)} />
            <Metric label="Page capture" value={formatMs(latest.capture_total_ms)} />
            <Metric label="Avg per page" value={latest.page_count > 0 ? formatMs(latest.capture_avg_ms) : "—"} />
            <Metric label="Slowest page" value={latest.capture_slowest?.page ? `#${latest.capture_slowest.page} (${formatMs(latest.capture_slowest.ms)})` : "—"} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Metric label="PDF assembly" value={formatMs(latest.assembly_ms)} />
            <Metric label="Upload" value={formatMs(latest.upload_ms)} />
            <Metric label="Verification" value={formatMs(latest.verify_ms)} />
            <Metric label="Pages" value={latest.page_count ?? "—"} />
          </div>
          <div style={{ fontSize: 11, color: BRAND.subtext }}>
            {latest.status === 'complete' ? '✓' : '⚠'} {latest.documentType || 'document'} · {latest.filename || '—'} · {latest.status || '—'}
          </div>
        </div>
      )}
    </div>
  );
}