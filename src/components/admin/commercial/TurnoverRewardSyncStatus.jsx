import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const COLOURS = {
  border: "#DCDBD6",
  card: "#FFFFFF",
  text: "#1B1A1A",
  muted: "#3E4349",
  good: "#2F8B57",
  warn: "#B37A2B",
  bad: "#B23A3A",
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-GB", {
        timeZone: "Europe/London",
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function statusColour(status) {
  if (status === "SUCCESS" || status === "DRY_RUN") return COLOURS.good;
  if (status === "RUNNING" || status === "PARTIAL") return COLOURS.warn;
  return COLOURS.bad;
}

export default function TurnoverRewardSyncStatus() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const data = await base44.entities.TurnoverRewardSyncRun.list("-started_at", 10);
      setRuns(data || []);
    } catch (err) {
      setError(err?.message || "Could not load reconciliation history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const latest = runs[0];

  return (
    <section style={{
      marginBottom: 24,
      padding: "16px 20px",
      background: COLOURS.card,
      border: `1px solid ${COLOURS.border}`,
      borderRadius: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLOURS.text }}>
            Lovable credit reconciliation
          </div>
          <div style={{ marginTop: 3, fontSize: 12, color: COLOURS.muted }}>
            Nightly at 02:00 Europe/London · admin-only audit
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            border: `1px solid ${COLOURS.border}`,
            borderRadius: 8,
            background: COLOURS.card,
            color: COLOURS.text,
            padding: "7px 11px",
            cursor: loading ? "default" : "pointer",
            fontSize: 12,
          }}
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div style={{ marginTop: 14, color: COLOURS.bad, fontSize: 13 }}>{error}</div>
      ) : !latest ? (
        <div style={{ marginTop: 14, color: COLOURS.muted, fontSize: 13 }}>
          No reconciliation runs recorded yet.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 15, fontSize: 13 }}>
            <div>
              <span style={{ color: COLOURS.muted }}>Status </span>
              <strong style={{ color: statusColour(latest.status) }}>{latest.status}</strong>
            </div>
            <div><span style={{ color: COLOURS.muted }}>Started </span><strong>{formatDate(latest.started_at)}</strong></div>
            <div><span style={{ color: COLOURS.muted }}>Contract </span><strong>v{latest.contract_version || "—"}</strong></div>
            <div><span style={{ color: COLOURS.muted }}>Source calculated </span><strong>{formatDate(latest.source_last_updated)}</strong></div>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 10,
            marginTop: 14,
          }}>
            {[
              ["Received", latest.dealers_received],
              ["Matched", latest.dealers_matched],
              ["Unmatched", latest.dealers_unmatched],
              ["Reconciled", latest.dealers_reconciled],
              ["Credits added", latest.projects_awarded],
              ["Credits reversed", latest.projects_reversed],
              ["Credits reinstated", latest.projects_reinstated],
              ["Errors", latest.error_count],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: 10, border: `1px solid ${COLOURS.border}`, borderRadius: 8 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", color: COLOURS.muted }}>{label}</div>
                <div style={{ marginTop: 3, fontSize: 18, fontWeight: 700, color: COLOURS.text }}>{value ?? 0}</div>
              </div>
            ))}
          </div>
          {latest.error_summary ? (
            <div style={{ marginTop: 12, fontSize: 12, color: COLOURS.bad }}>
              {latest.error_summary}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
