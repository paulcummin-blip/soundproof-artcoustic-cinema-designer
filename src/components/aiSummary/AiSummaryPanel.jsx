/**
 * AiSummaryPanel.jsx
 * ------------------
 * UI panel for AI Client Summary generation, editing, regeneration, and
 * PDF export. Consumes the settled Design Rating authority via the published
 * Design Review handoff snapshot.
 *
 * Props:
 *   projectId          - Current project ID
 *   versionId          - Current version ID
 *   publishedSnapshot  - From readDesignReviewHandoff (may be null)
 *   projectDetails     - Merged Project + ProjectVersion entity
 *
 * The AI layer is a CONSUMER. This panel never recalculates engineering values.
 * Generation is disabled when the Design Rating is not publishable.
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { isAiSummaryReady, aiSummaryReadinessLabel } from "@/components/aiSummary/aiSummaryReadiness";
import { buildAiSummaryPayload } from "@/components/aiSummary/buildAiSummaryPayload";
import { isAiSummaryStale, extractGenerationFingerprints } from "@/components/aiSummary/aiSummaryStaleDetection";
import { Sparkles, Edit3, RefreshCw, FileDown, AlertCircle } from "lucide-react";

const COLORS = {
  primary: "#213428",
  body: "#3E4349",
  muted: "#77736B",
  border: "#DCDBD6",
  bg: "#FFFFFF",
  green: "#16A34A",
  orange: "#B45309",
};

function exportSummaryPdf(summaryText, projectDetails, versionId) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  const projectName = projectDetails?.name || "Untitled Project";
  const clientName = projectDetails?.client_name || "";
  const versionName = projectDetails?.version_name || "";
  const date = new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });

  printWindow.document.write(`<!DOCTYPE html><html><head><title>${projectName} — Client Summary</title>
<style>
body { font-family: 'Didact Gothic', 'Century Gothic', sans-serif; color: #3E4349; max-width: 800px; margin: 40px auto; padding: 20px; }
h1 { color: #213428; font-size: 22px; margin-bottom: 4px; }
h2 { color: #213428; font-size: 16px; margin-top: 24px; }
.meta { color: #77736B; font-size: 12px; margin-bottom: 24px; }
.summary { white-space: pre-wrap; font-size: 13px; line-height: 1.6; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; }
th, td { border: 1px solid #DCDBD6; padding: 6px 10px; font-size: 12px; text-align: left; }
th { background: #F1F0EE; color: #213428; }
.brand { border-top: 3px solid #213428; padding-top: 12px; margin-bottom: 20px; font-size: 10px; color: #625143; text-transform: uppercase; letter-spacing: 0.08em; }
@media print { body { margin: 0; } }
</style></head><body>
<div class="brand">Sound Proof — Professional Home Cinema Engineering</div>
<h1>${projectName}</h1>
<div class="meta">${clientName ? `Client: ${clientName} · ` : ""}${versionName ? `Version: ${versionName} · ` : ""}${date}</div>
<div class="summary">${(summaryText || "").replace(/</g, "&lt;")}</div>
</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 500);
}

export default function AiSummaryPanel({ projectId, versionId, publishedSnapshot, projectDetails }) {
  const [summaryRecord, setSummaryRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState(null);

  // ── Readiness gate ──
  const readiness = useMemo(
    () => isAiSummaryReady({ publishedSnapshot, projectId, versionId }),
    [publishedSnapshot, projectId, versionId]
  );

  // ── Stale detection ──
  const stale = useMemo(
    () => isAiSummaryStale({ summaryRecord, currentSnapshot: publishedSnapshot }),
    [summaryRecord, publishedSnapshot]
  );

  // ── Load existing summary record ──
  const loadSummary = useCallback(async () => {
    if (!projectId || !versionId) return;
    setLoading(true);
    setError(null);
    try {
      const results = await base44.entities.AiClientSummary.filter({
        project_id: projectId,
        version_id: versionId,
        summary_type: "single",
      });
      const record = Array.isArray(results) && results.length > 0 ? results[0] : null;
      setSummaryRecord(record);
    } catch (err) {
      setError("Failed to load existing summary.");
    } finally {
      setLoading(false);
    }
  }, [projectId, versionId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // ── Generate ──
  const handleGenerate = useCallback(async () => {
    if (!readiness.ready) return;
    setGenerating(true);
    setError(null);
    try {
      const payload = buildAiSummaryPayload({
        publishedSnapshot,
        projectDetails,
        projectId,
        versionId,
      });
      if (!payload) { setError("Could not build summary payload."); return; }

      const response = await base44.functions.invoke("generateAiSummary", {
        summaryType: "single",
        payload,
      });
      const result = response?.data || response;
      if (result?.error) { setError(result.error); return; }
      if (!result?.summaryText) { setError("AI returned no summary text."); return; }

      const fingerprints = extractGenerationFingerprints(publishedSnapshot);
      const now = new Date().toISOString();

      if (summaryRecord) {
        // Regenerate: update ai_generated_text and edited_text
        await base44.entities.AiClientSummary.update(summaryRecord.id, {
          ai_generated_text: result.summaryText,
          edited_text: result.summaryText,
          generated_from_fingerprints: fingerprints,
          generated_at: now,
          last_edited_at: null,
          model_used: result.model || null,
          payload_snapshot: payload,
        });
      } else {
        const account_id = projectDetails?.account_id || publishedSnapshot?.account_id || "";
        const created = await base44.entities.AiClientSummary.create({
          project_id: projectId,
          version_id: versionId,
          account_id,
          summary_type: "single",
          selected_version_ids: [versionId],
          ai_generated_text: result.summaryText,
          edited_text: result.summaryText,
          generated_from_fingerprints: fingerprints,
          generated_at: now,
          last_edited_at: null,
          model_used: result.model || null,
          payload_snapshot: payload,
        });
        setSummaryRecord(created);
      }
      await loadSummary();
    } catch (err) {
      setError(err.message || "AI generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [readiness.ready, publishedSnapshot, projectDetails, projectId, versionId, summaryRecord, loadSummary]);

  // ── Save edit ──
  const handleSaveEdit = useCallback(async () => {
    if (!summaryRecord) return;
    try {
      await base44.entities.AiClientSummary.update(summaryRecord.id, {
        edited_text: editText,
        last_edited_at: new Date().toISOString(),
      });
      setEditing(false);
      await loadSummary();
    } catch (err) {
      setError("Failed to save edit.");
    }
  }, [summaryRecord, editText, loadSummary]);

  // ── Export PDF ──
  const handleExportPdf = useCallback(() => {
    const text = summaryRecord?.edited_text || summaryRecord?.ai_generated_text || "";
    exportSummaryPdf(text, projectDetails, versionId);
  }, [summaryRecord, projectDetails, versionId]);

  const hasSummary = !!summaryRecord?.ai_generated_text;
  const displayText = summaryRecord?.edited_text || summaryRecord?.ai_generated_text || "";
  const readinessLabel = aiSummaryReadinessLabel(readiness.reason);

  return (
    <div style={{ padding: 16, background: COLORS.bg, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Sparkles style={{ width: 18, height: 18, color: COLORS.primary }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLORS.primary, fontFamily: "'Didact Gothic', sans-serif" }}>
          AI Client Summary
        </h3>
      </div>

      {/* Readiness / status */}
      {!hasSummary && !generating && (
        <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>
          {readiness.ready
            ? "Design analysis is settled. Generate a client-facing performance summary."
            : readinessLabel || "Waiting for current design analysis"}
        </div>
      )}

      {/* Stale indicator */}
      {hasSummary && stale && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 12,
          padding: "8px 12px", background: "rgba(180,83,9,0.08)", borderRadius: 6,
          fontSize: 12, color: COLORS.orange,
        }}>
          <AlertCircle style={{ width: 14, height: 14 }} />
          Design changed — regenerate summary
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: "8px 12px", marginBottom: 12, background: "rgba(220,38,38,0.08)",
          borderRadius: 6, fontSize: 12, color: "#dc2626",
        }}>
          {error}
        </div>
      )}

      {/* Summary text or edit area */}
      {hasSummary && !editing && (
        <div style={{
          whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.6, color: COLORS.body,
          padding: 12, background: "#F8F7F5", borderRadius: 6, marginBottom: 12,
          maxHeight: 400, overflowY: "auto",
        }}>
          {displayText}
        </div>
      )}

      {editing && (
        <div style={{ marginBottom: 12 }}>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            style={{
              width: "100%", minHeight: 300, padding: 12, fontSize: 13,
              fontFamily: "inherit", lineHeight: 1.6, color: COLORS.body,
              border: `1px solid ${COLORS.border}`, borderRadius: 6, resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={handleSaveEdit} style={btnStyle(COLORS.primary, "#fff")}>Save</button>
            <button onClick={() => { setEditing(false); setEditText(""); }} style={btnStyle(COLORS.muted, "#fff")}>Cancel</button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!editing && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!hasSummary && (
            <button
              onClick={handleGenerate}
              disabled={!readiness.ready || generating}
              style={btnStyle(readiness.ready && !generating ? COLORS.primary : COLORS.muted, "#fff")}
            >
              <Sparkles style={{ width: 14, height: 14, marginRight: 6 }} />
              {generating ? "Generating…" : "Generate Client Summary"}
            </button>
          )}

          {hasSummary && (
            <>
              <button
                onClick={() => { setEditText(displayText); setEditing(true); }}
                style={btnStyle(COLORS.primary, "#fff")}
              >
                <Edit3 style={{ width: 14, height: 14, marginRight: 6 }} />
                Edit Summary
              </button>
              <button
                onClick={handleGenerate}
                disabled={!readiness.ready || generating}
                style={btnStyle(readiness.ready && !generating ? COLORS.primary : COLORS.muted, "#fff")}
              >
                <RefreshCw style={{ width: 14, height: 14, marginRight: 6 }} />
                {generating ? "Generating…" : "Regenerate"}
              </button>
              <button onClick={handleExportPdf} style={btnStyle(COLORS.primary, "#fff")}>
                <FileDown style={{ width: 14, height: 14, marginRight: 6 }} />
                Export PDF
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function btnStyle(bg, fg) {
  return {
    display: "inline-flex", alignItems: "center", padding: "8px 16px",
    fontSize: 12, fontWeight: 600, fontFamily: "'Didact Gothic', sans-serif",
    background: bg, color: fg, border: "none", borderRadius: 6,
    cursor: "pointer", transition: "opacity 0.2s",
  };
}