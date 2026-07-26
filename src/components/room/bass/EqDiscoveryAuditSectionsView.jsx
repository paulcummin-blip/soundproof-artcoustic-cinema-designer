// EqDiscoveryAuditSectionsView.jsx — Renders the 12 audit sections.
// Pure presentational component. No calculations — receives the audit object.

import React from "react";
import EqDiscoveryResidualGraph from "@/components/room/bass/EqDiscoveryResidualGraph";

const fmt = (v, digits = 2, fallback = "—") => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : fallback;
};

const sectionTitle = (title) => (
  <div style={{ fontSize: 12, fontWeight: 700, color: "#1B1A1A", fontFamily: "monospace", marginTop: 12, marginBottom: 4, borderBottom: "1px solid #DCDBD6", paddingBottom: 2 }}>
    {title}
  </div>
);

const cell = (label, value, highlight = false) => (
  <div style={{ display: "flex", gap: 6, fontSize: 10, fontFamily: "monospace", color: highlight ? "#dc2626" : "#3E4349" }}>
    <span style={{ color: "#8B7F76", minWidth: 140 }}>{label}:</span>
    <span style={{ fontWeight: 600 }}>{value}</span>
  </div>
);

export default function EqDiscoveryAuditSectionsView({ audit }) {
  if (!audit?.available) return null;

  return (
    <div>
      {/* SECTION 1: AUTHORITY */}
      {sectionTitle("1. Authority")}
      {cell("Active calibration fingerprint", audit.authority?.activeCalibrationFingerprint || "INCOMPLETE")}
      {cell("Completed-result calibration fingerprint", audit.authority?.resultCalibrationFingerprint || "INCOMPLETE")}
      {cell("Match status", audit.authority?.calibrationMatch ? "PASS" : "FAIL")}
      {cell("Selected candidate ID", audit.authority?.selectedCandidateId || "INCOMPLETE")}
      {cell("Final canonical candidate ID", audit.finalAuthority?.selectedCandidateId || "INCOMPLETE")}
      {cell("Raw response signature", audit.finalAuthority?.rawResponseSignature || "INCOMPLETE")}
      {cell("Post-EQ response signature", audit.finalAuthority?.postEqCurveSignature || "INCOMPLETE")}
      {cell("Final filter-bank signature", audit.finalAuthority?.filterBankSignature || "INCOMPLETE")}
      {cell("Graph filter-bank signature", audit.graphAuthority?.graphFilterBankSignature || "INCOMPLETE")}
      {cell("Worker status", "idle (read-only audit)")}
      {cell("Lifecycle worker starts", "0")}
      {cell("Lifecycle worker completions", "0")}

      {/* SECTION 2: PRODUCTION-PATH SUMMARY */}
      {sectionTitle("2. Production-Path Summary")}
      {(audit.productionPathSummary || []).map((p) => (
        <div key={p.probeHz} style={{ marginBottom: 8, padding: 6, background: "#fff", border: "1px solid #E5E5E5", borderRadius: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#213428", fontFamily: "monospace", marginBottom: 4 }}>Probe: {p.probeHz} Hz</div>
          {cell("Actual raw sample frequency", fmt(p.actualSampleHz, 4))}
          {cell("Unsmoothed residual", `${fmt(p.unsmoothedResidualDb, 4)} dB`, Math.abs(p.unsmoothedResidualDb || 0) > 3)}
          {cell("Production fitter-smoothed residual", `${fmt(p.productionFitterResidualDb, 4)} dB`)}
          {cell("Difference caused by smoothing", `${fmt(p.smoothingDiffDb, 4)} dB`, Math.abs(p.smoothingDiffDb || 0) > 3)}
          {cell("Sign changed", String(p.signChanged), p.signChanged)}
          {cell("Protected-null", String(p.protectedNull))}
          {cell("Assessment-band", p.inAssessmentBand ? "in-band" : "out-of-band")}
          {cell("Region discovered", String(p.regionDiscovered))}
          {cell("Region start", `${fmt(p.regionStartHz, 2)} Hz`)}
          {cell("Region centre", `${fmt(p.regionCentreHz, 2)} Hz`)}
          {cell("Region end", `${fmt(p.regionEndHz, 2)} Hz`)}
          {cell("Region width", `${fmt(p.regionWidthHz, 2)} Hz (${fmt(p.regionWidthOctaves, 4)} oct)`)}
          {cell("Peak threshold", `${fmt(p.peakThresholdDb, 1)} dB`)}
          {cell("Threshold pass", String(p.thresholdPass))}
          {cell("Minimum-width threshold", p.minimumWidthThreshold)}
          {cell("Trial count", String(p.trialCount))}
          {cell("First rejection gate", p.firstRejectionGate)}
          {cell("Accepted trial", String(p.acceptedTrial))}
          {cell("Final filter near probe", p.finalFilterNearProbe)}
          {cell("Final graph EQ contribution", p.finalGraphEqContribution)}
        </div>
      ))}

      {/* SECTION 3: RESOLUTION COMPARISON */}
      {sectionTitle("3. Resolution Comparison")}
      {(audit.resolutionComparison || []).map((rc) => (
        <div key={rc.probeHz} style={{ marginBottom: 8, padding: 6, background: "#fff", border: "1px solid #E5E5E5", borderRadius: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#213428", fontFamily: "monospace", marginBottom: 4 }}>Probe: {rc.probeHz} Hz</div>
          <table style={{ width: "100%", fontSize: 10, fontFamily: "monospace", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #DCDBD6" }}>
                <th style={{ textAlign: "left", padding: "2px 4px" }}>Resolution</th>
                <th style={{ textAlign: "right", padding: "2px 4px" }}>Residual (dB)</th>
                <th style={{ textAlign: "center", padding: "2px 4px" }}>Class</th>
                <th style={{ textAlign: "center", padding: "2px 4px" }}>Direction</th>
                <th style={{ textAlign: "center", padding: "2px 4px" }}>Exceeds thresh</th>
                <th style={{ textAlign: "center", padding: "2px 4px" }}>Sign differs</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(rc.byResolution || {}).map(([res, data]) => {
                const highlight = res === "none" && Math.abs(data.residualDb || 0) > 3;
                const signDiff = data.signDiffersFromUnsmoothed;
                return (
                  <tr key={res} style={{ borderBottom: "1px solid #F0F0F0" }}>
                    <td style={{ padding: "2px 4px", fontWeight: 600 }}>{res}</td>
                    <td style={{ textAlign: "right", padding: "2px 4px", color: highlight ? "#dc2626" : "#3E4349", fontWeight: highlight ? 700 : 400 }}>{fmt(data.residualDb, 4)}</td>
                    <td style={{ textAlign: "center", padding: "2px 4px" }}>{data.classification}</td>
                    <td style={{ textAlign: "center", padding: "2px 4px" }}>{data.correctionDirection}</td>
                    <td style={{ textAlign: "center", padding: "2px 4px" }}>{String(data.exceedsProductionThreshold)}</td>
                    <td style={{ textAlign: "center", padding: "2px 4px", color: signDiff ? "#dc2626" : "#3E4349", fontWeight: signDiff ? 700 : 400 }}>{String(signDiff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* SECTION 4: REGION DISCOVERY MATRIX */}
      {sectionTitle("4. Region Discovery Matrix")}
      <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <table style={{ fontSize: 9, fontFamily: "monospace", borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #DCDBD6" }}>
              <th style={{ textAlign: "left", padding: "2px 4px" }}>Smoothing</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>Thresh</th>
              <th style={{ textAlign: "left", padding: "2px 4px" }}>Min Width</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>34 Hz</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>78 Hz</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>Prod</th>
            </tr>
          </thead>
          <tbody>
            {(audit.regionDiscoveryMatrix || []).map((row, i) => {
              const p34 = row["probe_34.16"];
              const p78 = row["probe_77.81"];
              return (
                <tr key={i} style={{ borderBottom: "1px solid #F0F0F0", background: row.isProductionCombo ? "#f0fdf4" : "transparent" }}>
                  <td style={{ padding: "2px 4px" }}>{row.smoothing}</td>
                  <td style={{ textAlign: "center", padding: "2px 4px" }}>{fmt(row.peakThresholdDb, 1)}</td>
                  <td style={{ padding: "2px 4px" }}>{row.minWidthLabel}</td>
                  <td style={{ textAlign: "center", padding: "2px 4px", fontWeight: p34?.regionFound ? 700 : 400, color: p34?.regionFound ? "#16a34a" : "#8B7F76" }}>{p34?.regionFound ? "YES" : "no"}</td>
                  <td style={{ textAlign: "center", padding: "2px 4px", fontWeight: p78?.regionFound ? 700 : 400, color: p78?.regionFound ? "#16a34a" : "#8B7F76" }}>{p78?.regionFound ? "YES" : "no"}</td>
                  <td style={{ textAlign: "center", padding: "2px 4px", fontWeight: 700, color: row.isProductionCombo ? "#16a34a" : "#8B7F76" }}>{row.isProductionCombo ? "<<<" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* SECTION 5: CURATED DISCOVERY VARIANTS */}
      {sectionTitle("5. Curated Discovery Variants")}
      {(audit.curatedVariants || []).map((v) => (
        <div key={v.id} style={{ marginBottom: 6, padding: 6, background: "#fff", border: "1px solid #E5E5E5", borderRadius: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#213428", fontFamily: "monospace" }}>
            Variant {v.id}: {v.label}
          </div>
          <div style={{ fontSize: 10, color: "#625143", fontFamily: "monospace", marginTop: 2 }}>
            Smoothing: {v.smoothing}, threshold: {fmt(v.threshold, 1)} dB, minWidth: {fmt(v.minWidthOctaves, 4)} oct, regions: {v.totalRegions}, protNull violations: {v.protectedNullViolations}
          </div>
          {[34.16, 77.81].map((probeHz) => {
            const pr = v.probeResults[probeHz];
            return (
              <div key={probeHz} style={{ fontSize: 10, fontFamily: "monospace", color: "#3E4349", marginTop: 2 }}>
                <strong>{probeHz} Hz:</strong> region={String(pr?.regionFound)}, centre={fmt(pr?.centreHz, 2)} Hz, gain={fmt(pr?.proposedGainDb, 2)} dB, Q={fmt(pr?.proposedQ, 2)}, protNull={String(pr?.protectedNull)}, wouldAccept={String(pr?.wouldReachAcceptance)}
              </div>
            );
          })}
        </div>
      ))}

      {/* SECTION 6: AUTOMATIC PEAK SCAN */}
      {sectionTitle("6. Automatic Peak Scan — Top 10 Positive")}
      <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <table style={{ fontSize: 9, fontFamily: "monospace", borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #DCDBD6" }}>
              <th style={{ textAlign: "left", padding: "2px 4px" }}>Freq (Hz)</th>
              <th style={{ textAlign: "right", padding: "2px 4px" }}>Raw (dB)</th>
              <th style={{ textAlign: "right", padding: "2px 4px" }}>1/12</th>
              <th style={{ textAlign: "right", padding: "2px 4px" }}>1/6</th>
              <th style={{ textAlign: "right", padding: "2px 4px" }}>1/3</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>Region</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>Trial</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>Filter</th>
              <th style={{ textAlign: "left", padding: "2px 4px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {(audit.peakScan?.topPositive || []).map((p, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #F0F0F0" }}>
                <td style={{ padding: "2px 4px", fontWeight: 600 }}>{fmt(p.frequencyHz, 2)}</td>
                <td style={{ textAlign: "right", padding: "2px 4px", color: Math.abs(p.unsmoothedResidualDb || 0) > 3 ? "#dc2626" : "#3E4349", fontWeight: Math.abs(p.unsmoothedResidualDb || 0) > 3 ? 700 : 400 }}>{fmt(p.unsmoothedResidualDb, 2)}</td>
                <td style={{ textAlign: "right", padding: "2px 4px" }}>{fmt(p.residual12Db, 2)}</td>
                <td style={{ textAlign: "right", padding: "2px 4px" }}>{fmt(p.residual6Db, 2)}</td>
                <td style={{ textAlign: "right", padding: "2px 4px" }}>{fmt(p.residual3Db, 2)}</td>
                <td style={{ textAlign: "center", padding: "2px 4px" }}>{p.productionRegionDiscovered ? "Y" : "n"}</td>
                <td style={{ textAlign: "center", padding: "2px 4px" }}>{p.productionTrialGenerated ? "Y" : "n"}</td>
                <td style={{ textAlign: "center", padding: "2px 4px" }}>{p.finalFilterNearby ? "Y" : "n"}</td>
                <td style={{ padding: "2px 4px", color: p.detectionStatus === "hidden by smoothing" ? "#dc2626" : p.detectionStatus === "final correction present" ? "#16a34a" : "#3E4349" }}>{p.detectionStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#1B1A1A", fontFamily: "monospace", marginTop: 8 }}>Top 5 Negative</div>
      <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <table style={{ fontSize: 9, fontFamily: "monospace", borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #DCDBD6" }}>
              <th style={{ textAlign: "left", padding: "2px 4px" }}>Freq (Hz)</th>
              <th style={{ textAlign: "right", padding: "2px 4px" }}>Raw (dB)</th>
              <th style={{ textAlign: "left", padding: "2px 4px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {(audit.peakScan?.topNegative || []).map((p, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #F0F0F0" }}>
                <td style={{ padding: "2px 4px", fontWeight: 600 }}>{fmt(p.frequencyHz, 2)}</td>
                <td style={{ textAlign: "right", padding: "2px 4px", color: "#dc2626" }}>{fmt(p.unsmoothedResidualDb, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{p.detectionStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SECTION 7: RESIDUAL GRAPH */}
      {sectionTitle("7. Residual Graph")}
      <EqDiscoveryResidualGraph residualGraphData={audit.residualGraphData} />

      {/* SECTION 8: ACTUAL PRODUCTION CANDIDATES */}
      {sectionTitle("8. Actual Production Candidates")}
      {(audit.actualCandidates?.candidates || []).map((c) => (
        <div key={c.candidateId} style={{ marginBottom: 4, padding: 6, background: "#fff", border: "1px solid #E5E5E5", borderRadius: 4 }}>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "#3E4349" }}>
            <strong>{c.candidateId}</strong> — profile: {c.fitProfile}, filters: {c.enabledFilterCount}, maxRes: {fmt(c.maximumResidualDb, 4)} dB, rms: {fmt(c.rmsResidualDb, 4)} dB, eqCost: {fmt(c.eqCost, 4)} dB, rank: {c.rank ?? "—"}, selected: {String(c.selected)}
          </div>
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#8B7F76", marginTop: 2 }}>
            Signature: {c.filterBankSignature || "INCOMPLETE"}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 10, fontFamily: "monospace", color: "#3E4349", marginTop: 4 }}>
        <div>Selected bank equals final bank: <strong style={{ color: audit.actualCandidates?.checks?.selectedEqualsFinal ? "#16a34a" : "#dc2626" }}>{audit.actualCandidates?.checks?.selectedEqualsFinal ? "PASS" : "FAIL"}</strong></div>
        <div>Final signature equals graph signature: <strong style={{ color: audit.actualCandidates?.checks?.finalEqualsGraph ? "#16a34a" : "#dc2626" }}>{audit.actualCandidates?.checks?.finalEqualsGraph ? "PASS" : "FAIL"}</strong></div>
      </div>

      {/* SECTION 9: ROOT-CAUSE CLASSIFICATION */}
      {sectionTitle("9. Root-Cause Classification")}
      <div style={{ fontSize: 11, fontFamily: "monospace", padding: 6, background: "#fff", border: "1px solid #E5E5E5", borderRadius: 4 }}>
        <div style={{ marginBottom: 4 }}>
          <strong style={{ color: "#213428" }}>34.16 Hz: {audit.rootCause34?.code}</strong> — {audit.rootCause34?.reason}
        </div>
        <div>
          <strong style={{ color: "#213428" }}>77.81 Hz: {audit.rootCause78?.code}</strong> — {audit.rootCause78?.reason}
        </div>
      </div>

      {/* SECTION 10: VARIANT COMPARISON SUMMARY */}
      {sectionTitle("10. Variant Comparison Summary")}
      <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <table style={{ fontSize: 9, fontFamily: "monospace", borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #DCDBD6" }}>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>Var</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>34 found</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>34 cut</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>78 found</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>78 cut</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>Peaks</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>ProtNull</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>CutLim</th>
              <th style={{ textAlign: "center", padding: "2px 4px" }}>ProdChg</th>
            </tr>
          </thead>
          <tbody>
            {(audit.variantSummary || []).map((v) => (
              <tr key={v.variant} style={{ borderBottom: "1px solid #F0F0F0" }}>
                <td style={{ textAlign: "center", padding: "2px 4px", fontWeight: 700 }}>{v.variant}</td>
                <td style={{ textAlign: "center", padding: "2px 4px", color: v.probe34RegionFound ? "#16a34a" : "#8B7F76" }}>{v.probe34RegionFound ? "YES" : "no"}</td>
                <td style={{ textAlign: "center", padding: "2px 4px" }}>{v.probe34ProposedCut}</td>
                <td style={{ textAlign: "center", padding: "2px 4px", color: v.probe78RegionFound ? "#16a34a" : "#8B7F76" }}>{v.probe78RegionFound ? "YES" : "no"}</td>
                <td style={{ textAlign: "center", padding: "2px 4px" }}>{v.probe78ProposedCut}</td>
                <td style={{ textAlign: "center", padding: "2px 4px" }}>{v.totalPositivePeaksAbove3dB}</td>
                <td style={{ textAlign: "center", padding: "2px 4px", color: v.protectedNullViolations > 0 ? "#dc2626" : "#3E4349" }}>{v.protectedNullViolations}</td>
                <td style={{ textAlign: "center", padding: "2px 4px" }}>{v.cutLimitViolations}</td>
                <td style={{ textAlign: "center", padding: "2px 4px", color: v.productionBehaviourChanged ? "#dc2626" : "#16a34a" }}>{String(v.productionBehaviourChanged)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SECTION 11: SMELL TEST */}
      {sectionTitle("11. Smell Test")}
      {(audit.smellTest || []).map((s) => (
        <div key={s.variant} style={{ fontSize: 10, fontFamily: "monospace", color: "#3E4349", padding: "2px 0" }}>
          <strong>Variant {s.variant}</strong> ({s.label}): <span style={{ fontWeight: 700, color: s.classification === "Fail" ? "#dc2626" : s.classification === "Plausible" ? "#16a34a" : "#ca8a04" }}>{s.classification}</span>
        </div>
      ))}

      {/* NEXT PRODUCTION TEST */}
      {sectionTitle("Next Production Test")}
      <div style={{ fontSize: 10, fontFamily: "monospace", color: "#3E4349", padding: 6, background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 4 }}>
        {audit.nextTest}
        <div style={{ fontSize: 9, color: "#92400e", marginTop: 4, fontWeight: 600 }}>NOTE: This test is NOT approved. It is the smallest change worth testing next based on measured audit evidence.</div>
      </div>
    </div>
  );
}