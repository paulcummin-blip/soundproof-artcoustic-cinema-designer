import React, { useMemo, useState } from "react";
import { buildDesignEqRunDiagnostics } from "./designEqRunDiagnostics";

const fmt = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "—";
const fmtHz = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} Hz` : "—";

function CopyButton({ data, label = "Copy JSON" }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    try {
      const json = JSON.stringify(data, null, 2);
      navigator.clipboard?.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // Fallback — create a temporary textarea
      const textarea = document.createElement("textarea");
      textarea.value = JSON.stringify(data, null, 2);
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (err) { /* noop */ }
      document.body.removeChild(textarea);
    }
  };
  return (
    <button
      onClick={handleCopy}
      style={{ height: 24, padding: "0 10px", borderRadius: 4, border: "1px solid #213428", background: copied ? "#16a34a" : "#213428", color: "#fff", fontSize: 10, fontFamily: "monospace", cursor: "pointer", fontWeight: 600 }}
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

function DownloadButton({ data }) {
  const handleDownload = () => {
    try {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `design-eq-diagnostics-${data?.identity?.diagnosticToken || "run"}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) { /* noop */ }
  };
  return (
    <button
      onClick={handleDownload}
      style={{ height: 24, padding: "0 10px", borderRadius: 4, border: "1px solid #625143", background: "#F8F8F7", color: "#213428", fontSize: 10, fontFamily: "monospace", cursor: "pointer", fontWeight: 600 }}
    >
      Download JSON
    </button>
  );
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: "#213428", fontFamily: "monospace", marginTop: 10, marginBottom: 4, borderBottom: "1px solid #DCDBD6", paddingBottom: 2 }}>{children}</div>;
}

function IdentityRow({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 10, fontFamily: "monospace", color: "#1B1A1A", padding: "1px 0" }}>
      <span style={{ minWidth: 180, color: "#625143", fontWeight: 600 }}>{label}:</span>
      <span style={{ color: "#213428", wordBreak: "break-all" }}>{value ?? "—"}</span>
    </div>
  );
}

export default function DesignEqDiagnosticTrace({ diagnosticToken, lifecycle, result, optimisationResult, contract, rspRawCurve, collectDiagnostics }) {
  const [freqFilter, setFreqFilter] = useState("all");

  const diagnostics = useMemo(() => buildDesignEqRunDiagnostics({
    diagnosticToken, lifecycle, result, optimisationResult, contract, rspRawCurve, collectDiagnostics,
  }), [diagnosticToken, lifecycle, result, optimisationResult, contract, rspRawCurve, collectDiagnostics]);

  if (!diagnostics) return null;

  const { identity, candidatePoolDiagnostics, regionAndFilterDiagnostics, finalAuthorityTrace } = diagnostics;

  const filteredRegions = freqFilter === "all"
    ? regionAndFilterDiagnostics
    : regionAndFilterDiagnostics.filter((r) => {
        const f = Number(r?.centreFrequencyHz);
        if (!Number.isFinite(f)) return false;
        if (freqFilter === "90-160") return f >= 90 && f <= 160;
        return true;
      });

  return (
    <details className="mt-3 rounded border-2 border-[#213428] bg-[#F8F8F7] p-3" style={{ fontSize: 10, fontFamily: "monospace" }}>
      <summary className="cursor-pointer font-bold text-[#213428]" style={{ fontSize: 12 }}>
        Design EQ diagnostic trace
      </summary>

      <div style={{ display: "flex", gap: 6, marginTop: 8, marginBottom: 8 }}>
        <CopyButton data={diagnostics} />
        <DownloadButton data={diagnostics} />
      </div>

      {/* 1. Diagnostic identity */}
      <SectionTitle>1. Diagnostic identity</SectionTitle>
      <div style={{ background: "#fff", border: "1px solid #DCDBD6", borderRadius: 4, padding: 6 }}>
        <IdentityRow label="Diagnostic token" value={identity.diagnosticToken} />
        <IdentityRow label="Worker request ID" value={identity.workerRequestId} />
        <IdentityRow label="Input fingerprint" value={identity.inputFingerprint} />
        <IdentityRow label="Cache key" value={identity.cacheKey} />
        <IdentityRow label="Protocol version" value={identity.protocolVersion} />
        <IdentityRow label="Pool version" value={identity.poolVersion} />
        <IdentityRow label="Engine version" value={identity.engineVersion} />
        <IdentityRow label="Result schema version" value={identity.resultSchemaVersion} />
        <IdentityRow label="Started at (ms)" value={identity.startedAtMs} />
        <IdentityRow label="Completed at (ms)" value={identity.completedAtMs} />
      </div>

      {/* 2. Candidate pool diagnostics */}
      <SectionTitle>2. Candidate pool diagnostics ({candidatePoolDiagnostics.length} candidates)</SectionTitle>
      {candidatePoolDiagnostics.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 1200, fontSize: 9, fontFamily: "monospace", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #DCDBD6", color: "#625143" }}>
                {["Candidate ID", "Profile", "Origin", "Seed", "Bank valid", "Selectable", "Exclusion reason", "Filters", "Σ|gain| dB", "RMS resid", "Max resid", "Mean|resid|", "Mean resid", "Worst seat", "Mean seat", "Rank", "Selected", "Selection reason"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "2px 4px", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {candidatePoolDiagnostics.map((c) => (
                <tr key={c.candidateId || c.fitProfile} style={{ borderBottom: "1px solid #F0EFEA", color: "#1B1A1A", background: c.selectedFlag ? "#f0fdf4" : "transparent" }}>
                  <td style={{ padding: "2px 4px", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{c.candidateId || "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{c.fitProfile}</td>
                  <td style={{ padding: "2px 4px" }}>{c.origin}</td>
                  <td style={{ padding: "2px 4px" }}>{c.startingBankOrSeed || "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{c.bankValidStatus === true ? "✓" : c.bankValidStatus === false ? "✗" : "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{c.selectableStatus ? "✓" : "✗"}</td>
                  <td style={{ padding: "2px 4px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{c.exclusionReason || "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{c.enabledFilterCount}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(c.totalAbsoluteEqGainDb, 1)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(c.houseCurveRmsResidualDb)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(c.houseCurveMaxResidualDb)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(c.meanAbsoluteResidualDb)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(c.meanSignedResidualDb)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(c.worstSeatDeviationDb)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(c.meanSeatDeviationDb)}</td>
                  <td style={{ padding: "2px 4px" }}>{c.finalRankingPosition}</td>
                  <td style={{ padding: "2px 4px", fontWeight: c.selectedFlag ? 700 : 400 }}>{c.selectedFlag ? "✓" : "—"}</td>
                  <td style={{ padding: "2px 4px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{c.selectionReason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3. Region and filter diagnostics */}
      <SectionTitle>3. Region and filter diagnostics ({regionAndFilterDiagnostics.length} regions)</SectionTitle>
      <div style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#625143" }}>Frequency filter:</span>
        <button onClick={() => setFreqFilter("all")} style={{ height: 20, padding: "0 8px", borderRadius: 3, border: "1px solid #DCDBD6", background: freqFilter === "all" ? "#213428" : "#fff", color: freqFilter === "all" ? "#fff" : "#213428", fontSize: 9, fontFamily: "monospace", cursor: "pointer" }}>All</button>
        <button onClick={() => setFreqFilter("90-160")} style={{ height: 20, padding: "0 8px", borderRadius: 3, border: "1px solid #DCDBD6", background: freqFilter === "90-160" ? "#213428" : "#fff", color: freqFilter === "90-160" ? "#fff" : "#213428", fontSize: 9, fontFamily: "monospace", cursor: "pointer" }}>90–160 Hz</button>
      </div>
      {filteredRegions.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 1400, fontSize: 9, fontFamily: "monospace", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #DCDBD6", color: "#625143" }}>
                {["Candidate ID", "Stage", "Provenance", "Centre Hz", "Lower Hz", "Upper Hz", "Width oct", "Raw SPL", "Smoothed", "Target", "Raw resid", "Smoothed resid", "Protected", "Classification", "Requested gain", "Initial Q", "Scaled gain", "Final Q", "Accepted gain", "Rejected", "Rejection reason", "Src domain allow", "Agg bank boost", "Bank limit", "Obj before", "Obj after", "Seat regression", "Checkpoint"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "2px 4px", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRegions.map((r, i) => (
                <tr key={`${r.candidateId}-${i}-${r.centreFrequencyHz}`} style={{ borderBottom: "1px solid #F0EFEA", color: "#1B1A1A" }}>
                  <td style={{ padding: "2px 4px", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>{r.candidateId || "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{r.stage}</td>
                  <td style={{ padding: "2px 4px" }}>{r.provenance}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.centreFrequencyHz, 1)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.lowerFrequencyHz, 1)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.upperFrequencyHz, 1)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.widthOctaves, 3)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.rawSpl)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.smoothedSpl)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.targetSpl)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.rawResidual)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.smoothedResidual)}</td>
                  <td style={{ padding: "2px 4px" }}>{r.protectedNullStatus}</td>
                  <td style={{ padding: "2px 4px" }}>{r.returnedClassification || "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.requestedGain)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.initialQ, 3)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.scaledGain)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.finalQ, 3)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.acceptedGain)}</td>
                  <td style={{ padding: "2px 4px" }}>{r.rejectedStatus}</td>
                  <td style={{ padding: "2px 4px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{r.exactRejectionReason || "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.sourceDomainBoostAllowanceDb)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.aggregateBankBoostAtFrequencyDb)}</td>
                  <td style={{ padding: "2px 4px" }}>{r.bankLimitResult ? JSON.stringify(r.bankLimitResult).slice(0, 40) : "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.objectiveBefore)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.objectiveAfter)}</td>
                  <td style={{ padding: "2px 4px" }}>{r.seatRegressionResult ? "yes" : "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{r.checkpointRetainedOrDiscarded || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. Final authority trace */}
      {finalAuthorityTrace && (
        <>
          <SectionTitle>4. Final authority trace</SectionTitle>
          <div style={{ background: "#fff", border: "1px solid #DCDBD6", borderRadius: 4, padding: 6 }}>
            <IdentityRow label="Selected candidate ID" value={finalAuthorityTrace.selectedCandidateId} />
            <IdentityRow label="Selected fit profile" value={finalAuthorityTrace.selectedFitProfile} />
            <IdentityRow label="Final post-EQ curve signature" value={finalAuthorityTrace.finalPostEqCurveSignature} />
            <IdentityRow label="Canonical post-EQ RSP signature" value={finalAuthorityTrace.canonicalPostEqRspSignature} />
            <IdentityRow label="Post-EQ RSP curve signature" value={finalAuthorityTrace.postEqRspCurveSignature} />
            <IdentityRow label="Plotted RSP-EQ series signature" value={finalAuthorityTrace.plottedRspEqSeriesSignature} />

            <div style={{ marginTop: 8, fontWeight: 700, color: "#213428" }}>Frequency traces:</div>
            {Object.entries(finalAuthorityTrace.frequencyTraces).map(([freq, trace]) => (
              <div key={freq} style={{ marginLeft: 12, marginTop: 4, padding: 4, background: "#F8F8F7", border: "1px solid #F0EFEA", borderRadius: 3 }}>
                <div style={{ fontWeight: 700, color: "#213428", marginBottom: 2 }}>{freq}</div>
                <IdentityRow label="  Before EQ (dB)" value={fmt(trace.beforeEqDb)} />
                <IdentityRow label="  Target (dB)" value={fmt(trace.targetDb)} />
                <IdentityRow label="  Required correction (dB)" value={fmt(trace.requiredCorrectionDb)} />
                <IdentityRow label="  Total applied filter response (dB)" value={fmt(trace.totalAppliedFilterResponseDb)} />
                <IdentityRow label="  Final post-EQ (dB)" value={fmt(trace.finalPostEqDb)} />
                <IdentityRow label="  Remaining residual (dB)" value={fmt(trace.remainingResidualDb)} />
              </div>
            ))}

            <div style={{ marginTop: 8, fontWeight: 700, color: "#213428" }}>P19 trace:</div>
            <div style={{ marginLeft: 12, marginTop: 4, padding: 4, background: "#F8F8F7", border: "1px solid #F0EFEA", borderRadius: 3 }}>
              <IdentityRow label="  Selected candidate ID" value={finalAuthorityTrace.p19Trace.selectedCandidateId} />
              <IdentityRow label="  Assessment band" value={finalAuthorityTrace.p19Trace.assessmentBand} />
              <IdentityRow label="  Variation dB (raw)" value={fmt(finalAuthorityTrace.p19Trace.variationDbRaw)} />
              <IdentityRow label="  Worst frequency (Hz)" value={fmt(finalAuthorityTrace.p19Trace.worstFrequencyHz, 1)} />
              <IdentityRow label="  Post-EQ at worst freq (dB)" value={fmt(finalAuthorityTrace.p19Trace.postEqValueAtWorstFrequencyDb)} />
              <IdentityRow label="  Target at worst freq (dB)" value={fmt(finalAuthorityTrace.p19Trace.targetValueAtWorstFrequencyDb)} />
              <IdentityRow label="  Final P19 level" value={finalAuthorityTrace.p19Trace.finalP19Level} />
            </div>

            <div style={{ marginTop: 8, fontWeight: 700, color: "#213428" }}>Final filter bank ({finalAuthorityTrace.finalFilterBank.length} filters):</div>
            {finalAuthorityTrace.finalFilterBank.length > 0 && (
              <div style={{ overflowX: "auto", marginTop: 4 }}>
                <table style={{ fontSize: 9, fontFamily: "monospace", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #DCDBD6", color: "#625143" }}>
                      {["Frequency (Hz)", "Q", "Gain (dB)", "Enabled"].map((h) => <th key={h} style={{ textAlign: "left", padding: "2px 8px" }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {finalAuthorityTrace.finalFilterBank.map((f, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #F0EFEA", color: "#1B1A1A" }}>
                        <td style={{ padding: "2px 8px" }}>{fmt(f.frequencyHz, 1)}</td>
                        <td style={{ padding: "2px 8px" }}>{fmt(f.Q, 3)}</td>
                        <td style={{ padding: "2px 8px" }}>{fmt(f.gainDb)}</td>
                        <td style={{ padding: "2px 8px" }}>{f.enabled ? "✓" : "✗"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </details>
  );
}