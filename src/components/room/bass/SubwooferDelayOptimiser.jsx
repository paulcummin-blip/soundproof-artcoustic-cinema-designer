import React, { useState, useCallback } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine";
import { getSubwooferCurve } from "@/components/models/speakers/registry";
import { Button } from "@/components/ui/button";

/**
 * SubwooferDelayOptimiser
 * Development-only read-only tool.
 * Scans front sub delay from 0–20ms in 0.5ms steps, scores each by
 * peak-to-peak SPL variation across 20–120Hz.
 */
export default function SubwooferDelayOptimiser({
  // Seat to evaluate
  mlpSeat,
  // Room
  roomDims,
  // All subs for simulation (from subsForSimulation in BassResponse)
  subsForSimulation,
  // Source curve mode
  rewSourceCurveMode,
  REW_SOURCE_CURVES,
  // Modal / reflection settings passed through
  enableRewCoreReflections,
  surfaceAbsorption,
  modalSourceReferenceMode,
  modalGainScalar,
  axialQ,
  modalStorageMode,
  propagationPhaseScale,
  disableReflectionPhaseJitter,
  disableReflectionCoherenceWeight,
  disableLateField,
  disableModalPropagationPhase,
  mute68HzAxialMode,
  debugDisableModalContribution,
  // Current manual delay for parity check
  currentManualDelay,
}) {
  const [result, setResult] = useState(null);
  const [scanning, setScanning] = useState(false);

  const runScan = useCallback(() => {
    if (!mlpSeat || !roomDims || !subsForSimulation?.length) return;

    setScanning(true);
    setResult(null);

    const seatPoint = {
      x: mlpSeat.x,
      y: mlpSeat.y,
      z: Number.isFinite(Number(mlpSeat.z)) ? Number(mlpSeat.z) : 1.2,
    };

    const STEP = 0.5;
    const MAX_DELAY = 20.0;
    const FREQ_MIN = 20;
    const FREQ_MAX = 120;

    let bestDelay = 0;
    let bestScore = Infinity;
    let bestMin = null;
    let bestMax = null;

    const NARROW_MIN = 60;
    const NARROW_MAX = 100;
    const SENTINEL_DELAYS = [0.0, 5.0, 10.0, 15.0, 20.0];
    const narrowCandidates = [];

    // Diagnostic: capture modified sub objects at sentinel delays
    const sentinelSubDiagnostics = {};

    // Helper to detect front subs by ID pattern (supports both naming conventions)
    const isFrontSub = (sub) => {
      const id = String(sub?.id || sub?.subId || "").toLowerCase();
      return id.startsWith("front-") || id.startsWith("sub-front");
    };

    for (let delayMs = 0; delayMs <= MAX_DELAY; delayMs = Math.round((delayMs + STEP) * 100) / 100) {
      // Build modified subs: override front sub delay to delayMs, keep others as-is
      const modifiedSubs = subsForSimulation.map((sub) => {
        if (isFrontSub(sub)) {
          return { ...sub, tuning: { ...sub.tuning, delayMs } };
        }
        // rear subs: zero delay for this scan
        return { ...sub, tuning: { ...sub.tuning, delayMs: 0 } };
      });

      // Capture diagnostic for sentinel delays
      if (SENTINEL_DELAYS.includes(delayMs)) {
        sentinelSubDiagnostics[delayMs] = modifiedSubs.map((sub) => ({
          id: sub.id ?? null,
          subId: sub.subId ?? null,
          modelKey: sub.modelKey ?? null,
          delayMs: sub.tuning?.delayMs ?? null,
          x: sub.x,
          y: sub.y,
          z: sub.z,
        }));
      }

      // Accumulate complex pressure across all subs for this seat
      let sumRe = null;
      let sumIm = null;
      let freqsHz = null;

      for (const sub of modifiedSubs) {
        const subCurve = getSubwooferCurve(sub.modelKey);
        if (!subCurve || subCurve.length === 0) continue;
        const diagnosticSourceCurve = REW_SOURCE_CURVES[rewSourceCurveMode] || subCurve;

        const rewResult = simulateBassResponseRewCore(
          { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
          seatPoint,
          sub,
          diagnosticSourceCurve,
          {
            enableReflections: enableRewCoreReflections,
            enableModes: true,
            surfaceAbsorption,
            freqMinHz: 20,
            freqMaxHz: 200,
            smoothing: "none",
            modalSourceReferenceMode,
            modalGainScalar,
            axialQ,
            modalStorageMode,
            propagationPhaseScale,
            disableReflectionPhaseJitter,
            disableReflectionCoherenceWeight,
            disableLateField,
            disableModalPropagationPhase,
            mute68HzAxialMode,
            debugDisableModalContribution,
          }
        );

        if (!freqsHz) {
          freqsHz = rewResult.freqsHz;
          sumRe = rewResult.complexPressure.map((cp) => cp.re);
          sumIm = rewResult.complexPressure.map((cp) => cp.im);
        } else {
          rewResult.complexPressure.forEach((cp, i) => {
            if (Number.isFinite(cp.re) && Number.isFinite(cp.im)) {
              sumRe[i] += cp.re;
              sumIm[i] += cp.im;
            }
          });
        }
      }

      if (!freqsHz || !sumRe || !sumIm) continue;

      // --- Build cleaned response identical to the live graph pipeline ---
      // Step 1: Convert to {frequency, spl} — spl=null for non-finite values
      const rawPoints = freqsHz.map((hz, i) => {
        const mag = Math.sqrt(sumRe[i] ** 2 + sumIm[i] ** 2);
        const calculatedSpl = 20 * Math.log10(Math.max(mag, 1e-10));
        return {
          frequency: hz,
          spl: Number.isFinite(calculatedSpl) ? calculatedSpl : null,
        };
      });

      // Step 2: Filter — keep only valid positive frequencies with a finite spl
      const validPoints = rawPoints.filter(
        (p) => p.frequency > 0 && Number.isFinite(p.frequency) && p.spl !== null
      );

      // Step 3: Sort by frequency ascending
      validPoints.sort((a, b) => a.frequency - b.frequency);

      // Step 4: Dedupe — keep first occurrence within 1e-9 Hz tolerance
      const cleanedPoints = [];
      for (let k = 0; k < validPoints.length; k++) {
        if (
          k === 0 ||
          Math.abs(validPoints[k].frequency - validPoints[k - 1].frequency) > 1e-9
        ) {
          cleanedPoints.push(validPoints[k]);
        }
      }
      // --- End cleaned pipeline ---

      // Score over 20–120Hz from cleaned array
      const splValues = cleanedPoints
        .filter((p) => p.frequency >= FREQ_MIN && p.frequency <= FREQ_MAX)
        .map((p) => p.spl);

      if (splValues.length === 0) continue;

      const minSpl = Math.min(...splValues);
      const maxSpl = Math.max(...splValues);
      const score = maxSpl - minSpl; // peak-to-peak variation — lower is better

      if (score < bestScore) {
        bestScore = score;
        bestDelay = delayMs;
        bestMin = minSpl;
        bestMax = maxSpl;
      }

      // Narrow band score: 60–100Hz from cleaned array
      const narrowSplValues = cleanedPoints
        .filter((p) => p.frequency >= NARROW_MIN && p.frequency <= NARROW_MAX)
        .map((p) => p.spl);

      if (narrowSplValues.length > 0) {
        const narrowScore = Math.max(...narrowSplValues) - Math.min(...narrowSplValues);
        narrowCandidates.push({ delayMs, narrowScore });
      }
    }

    // Sort narrow candidates and keep top 5
    narrowCandidates.sort((a, b) => a.narrowScore - b.narrowScore);
    const top5Narrow = narrowCandidates.slice(0, 5);

    // Diagnostic: raw narrow scores at sentinel delays
    const sentinelRows = SENTINEL_DELAYS.map((d) => {
      const match = narrowCandidates.find((c) => c.delayMs === d);
      return { delayMs: d, narrowScore: match ? match.narrowScore : null };
    });

    // Helper to compute parity metrics for a specific delay value
    const computeParityMetrics = (testDelayMs) => {
      const modifiedSubsForTest = subsForSimulation.map((sub) => {
        if (isFrontSub(sub)) {
          return { ...sub, tuning: { ...sub.tuning, delayMs: testDelayMs } };
        }
        return { ...sub, tuning: { ...sub.tuning, delayMs: 0 } };
      });

      let sumRe = null;
      let sumIm = null;
      let freqsHz = null;

      for (const sub of modifiedSubsForTest) {
        const subCurve = getSubwooferCurve(sub.modelKey);
        if (!subCurve || subCurve.length === 0) continue;
        const diagnosticSourceCurve = REW_SOURCE_CURVES[rewSourceCurveMode] || subCurve;

        const rewResult = simulateBassResponseRewCore(
          { widthM: roomDims.widthM, lengthM: roomDims.lengthM, heightM: roomDims.heightM },
          seatPoint,
          sub,
          diagnosticSourceCurve,
          {
            enableReflections: enableRewCoreReflections,
            enableModes: true,
            surfaceAbsorption,
            freqMinHz: 20,
            freqMaxHz: 200,
            smoothing: "none",
            modalSourceReferenceMode,
            modalGainScalar,
            axialQ,
            modalStorageMode,
            propagationPhaseScale,
            disableReflectionPhaseJitter,
            disableReflectionCoherenceWeight,
            disableLateField,
            disableModalPropagationPhase,
            mute68HzAxialMode,
            debugDisableModalContribution,
          }
        );

        if (!freqsHz) {
          freqsHz = rewResult.freqsHz;
          sumRe = rewResult.complexPressure.map((cp) => cp.re);
          sumIm = rewResult.complexPressure.map((cp) => cp.im);
        } else {
          rewResult.complexPressure.forEach((cp, i) => {
            if (Number.isFinite(cp.re) && Number.isFinite(cp.im)) {
              sumRe[i] += cp.re;
              sumIm[i] += cp.im;
            }
          });
        }
      }

      if (!freqsHz || !sumRe || !sumIm) return null;

      // Build cleaned response (same pipeline as optimiser scoring)
      const rawPoints = freqsHz.map((hz, i) => {
        const mag = Math.sqrt(sumRe[i] ** 2 + sumIm[i] ** 2);
        const calculatedSpl = 20 * Math.log10(Math.max(mag, 1e-10));
        return { frequency: hz, spl: Number.isFinite(calculatedSpl) ? calculatedSpl : null };
      });

      const validPoints = rawPoints.filter(
        (p) => p.frequency > 0 && Number.isFinite(p.frequency) && p.spl !== null
      );
      validPoints.sort((a, b) => a.frequency - b.frequency);

      const cleanedPoints = [];
      for (let k = 0; k < validPoints.length; k++) {
        if (k === 0 || Math.abs(validPoints[k].frequency - validPoints[k - 1].frequency) > 1e-9) {
          cleanedPoints.push(validPoints[k]);
        }
      }

      const splValues = cleanedPoints
        .filter((p) => p.frequency >= FREQ_MIN && p.frequency <= FREQ_MAX)
        .map((p) => p.spl);

      if (splValues.length === 0) return null;

      const minSpl = Math.min(...splValues);
      const maxSpl = Math.max(...splValues);
      const score = maxSpl - minSpl;

      return {
        delayMs: testDelayMs,
        minSpl,
        maxSpl,
        score,
        binCount: splValues.length,
        firstFreq: cleanedPoints[0]?.frequency ?? null,
        lastFreq: cleanedPoints[cleanedPoints.length - 1]?.frequency ?? null,
      };
    };

    // Compute parity metrics for current manual delay and recommended delay
    const currentDelayMetrics = typeof currentManualDelay === "number" ? computeParityMetrics(currentManualDelay) : null;
    const recommendedDelayMetrics = computeParityMetrics(bestDelay);

    setResult({
      bestDelay,
      score: bestScore,
      minSpl: bestMin,
      maxSpl: bestMax,
      top5Narrow,
      sentinelRows,
      sentinelSubDiagnostics,
      currentDelayMetrics,
      recommendedDelayMetrics,
    });
    setScanning(false);
  }, [
    mlpSeat,
    roomDims,
    subsForSimulation,
    rewSourceCurveMode,
    REW_SOURCE_CURVES,
    enableRewCoreReflections,
    surfaceAbsorption,
    modalSourceReferenceMode,
    modalGainScalar,
    axialQ,
    modalStorageMode,
    propagationPhaseScale,
    disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight,
    disableLateField,
    disableModalPropagationPhase,
    mute68HzAxialMode,
    debugDisableModalContribution,
    currentManualDelay,
  ]);

  const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");

  return (
    <div
      style={{
        border: "2px dashed #7c3aed",
        borderRadius: 8,
        background: "#faf5ff",
        padding: "10px 14px",
        fontSize: 11,
        fontFamily: "monospace",
        marginBottom: 8,
      }}
    >
      <div style={{ fontWeight: 700, color: "#6d28d9", marginBottom: 6, fontSize: 12 }}>
        Development only — response-based delay scan
      </div>
      <div style={{ color: "#4c1d95", marginBottom: 8, lineHeight: 1.5 }}>
        Scans front sub delay 0–20ms in 0.5ms steps. Rear sub delay held at 0ms.
        <br />
        Seat: {mlpSeat ? (mlpSeat.id || `${mlpSeat.x?.toFixed(2)}, ${mlpSeat.y?.toFixed(2)}`) : "—"}
        &nbsp;|&nbsp;Freq range: 20–120Hz&nbsp;|&nbsp;Metric: peak-to-peak SPL variation (lower = flatter)
      </div>

      <Button
        onClick={runScan}
        disabled={scanning || !mlpSeat || !subsForSimulation?.length}
        size="sm"
        style={{
          background: scanning ? "#a78bfa" : "#7c3aed",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          padding: "4px 14px",
          cursor: scanning ? "not-allowed" : "pointer",
          fontSize: 11,
          marginBottom: 8,
        }}
      >
        {scanning ? "Scanning…" : "Run Delay Scan"}
      </Button>

      {result && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "3px 16px",
            color: "#3b0764",
            marginTop: 4,
          }}
        >
          <div>
            <strong>Best delay:</strong> {fmt(result.bestDelay, 1)} ms
          </div>
          <div>
            <strong>Score (P-P):</strong> {fmt(result.score, 2)} dB
          </div>
          <div>
            <strong>Min SPL:</strong> {fmt(result.minSpl, 1)} dB
          </div>
          <div>
            <strong>Max SPL:</strong> {fmt(result.maxSpl, 1)} dB
          </div>
          <div style={{ gridColumn: "1 / -1", marginTop: 4, color: "#6d28d9", fontStyle: "italic" }}>
            Read-only. Apply manually via the Manual Delay slider if desired.
          </div>

          {/* Sentinel delay diagnostic */}
          {result.sentinelRows?.length > 0 && (
            <div style={{ gridColumn: "1 / -1", marginTop: 10, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 4, padding: "6px 8px" }}>
              <div style={{ fontWeight: 700, color: "#166534", marginBottom: 4 }}>
                Diagnostic — raw 60–100Hz scores at sentinel delays
              </div>
              {result.sentinelRows.map((row) => (
                <div key={row.delayMs} style={{ color: "#14532d" }}>
                  Trial {fmt(row.delayMs, 1)} ms → score {row.narrowScore !== null ? fmt(row.narrowScore, 2) : "—"}
                </div>
              ))}
              <div style={{ marginTop: 4, color: "#166534", fontStyle: "italic", fontSize: 10 }}>
                If all scores are identical the engine is not consuming sub.tuning.delayMs.
              </div>
            </div>
          )}

          {/* Sub object diagnostic at sentinel delays */}
          {result.sentinelSubDiagnostics && Object.keys(result.sentinelSubDiagnostics).length > 0 && (
            <div style={{ gridColumn: "1 / -1", marginTop: 10, background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 4, padding: "6px 8px" }}>
              <div style={{ fontWeight: 700, color: "#9a3412", marginBottom: 4 }}>
                Diagnostic — modified sub objects sent to engine
              </div>
              {Object.entries(result.sentinelSubDiagnostics).map(([delayMs, subs]) => (
                <div key={delayMs} style={{ marginTop: 6 }}>
                  <div style={{ fontWeight: 600, color: "#c2410c", marginBottom: 2 }}>
                    Trial {fmt(delayMs, 1)} ms:
                  </div>
                  {subs.map((s, idx) => (
                    <div key={idx} style={{ marginLeft: 8, color: "#7c2d12", fontSize: 10 }}>
                      [{idx}] id={s.id ?? "null"} | subId={s.subId ?? "null"} | modelKey={s.modelKey ?? "null"} | delayMs={fmt(s.delayMs, 1)} | xyz=({fmt(s.x, 2)}, {fmt(s.y, 2)}, {fmt(s.z, 2)})
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Narrow band 60–100Hz top-5 table */}
          {result.top5Narrow?.length > 0 && (
            <div style={{ gridColumn: "1 / -1", marginTop: 10 }}>
              <div style={{ fontWeight: 700, color: "#6d28d9", marginBottom: 4 }}>
                Top 5 delay candidates (60–100Hz metric)
              </div>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #c4b5fd", color: "#4c1d95" }}>
                    <th style={{ textAlign: "left", padding: "2px 8px" }}>Delay (ms)</th>
                    <th style={{ textAlign: "right", padding: "2px 8px" }}>Score P-P (dB)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.top5Narrow.map((row, idx) => (
                    <tr
                      key={row.delayMs}
                      style={{
                        background: idx === 0 ? "#ede9fe" : "transparent",
                        fontWeight: idx === 0 ? 700 : 400,
                        borderBottom: "1px solid #ede9fe",
                        color: idx === 0 ? "#3b0764" : "#4c1d95",
                      }}
                    >
                      <td style={{ padding: "2px 8px" }}>
                        {idx === 0 ? "★ " : ""}{fmt(row.delayMs, 1)}
                      </td>
                      <td style={{ textAlign: "right", padding: "2px 8px" }}>
                        {fmt(row.narrowScore, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Graph Parity Check */}
          {(result.currentDelayMetrics || result.recommendedDelayMetrics) && (
            <div style={{ gridColumn: "1 / -1", marginTop: 10, background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 4, padding: "8px 10px" }}>
              <div style={{ fontWeight: 700, color: "#1e40af", marginBottom: 6, fontSize: 12 }}>
                Graph Parity Check
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: 10 }}>
                {/* Current Delay */}
                {result.currentDelayMetrics && (
                  <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 4, padding: "6px 8px" }}>
                    <div style={{ fontWeight: 600, color: "#92400e", marginBottom: 4, fontSize: 11 }}>
                      Current delay: {fmt(result.currentDelayMetrics.delayMs, 1)} ms
                    </div>
                    <div style={{ color: "#78350f", lineHeight: 1.6 }}>
                      <div>Min: {fmt(result.currentDelayMetrics.minSpl, 1)} dB</div>
                      <div>Max: {fmt(result.currentDelayMetrics.maxSpl, 1)} dB</div>
                      <div>P-P: {fmt(result.currentDelayMetrics.score, 2)} dB</div>
                      <div>Bins: {result.currentDelayMetrics.binCount}</div>
                      <div>Range: {fmt(result.currentDelayMetrics.firstFreq, 0)}–{fmt(result.currentDelayMetrics.lastFreq, 0)} Hz</div>
                    </div>
                  </div>
                )}
                {/* Recommended Delay */}
                {result.recommendedDelayMetrics && (
                  <div style={{ background: "#dcfce7", border: "1px solid #22c55e", borderRadius: 4, padding: "6px 8px" }}>
                    <div style={{ fontWeight: 600, color: "#166534", marginBottom: 4, fontSize: 11 }}>
                      Recommended delay: {fmt(result.recommendedDelayMetrics.delayMs, 1)} ms
                    </div>
                    <div style={{ color: "#14532d", lineHeight: 1.6 }}>
                      <div>Min: {fmt(result.recommendedDelayMetrics.minSpl, 1)} dB</div>
                      <div>Max: {fmt(result.recommendedDelayMetrics.maxSpl, 1)} dB</div>
                      <div>P-P: {fmt(result.recommendedDelayMetrics.score, 2)} dB</div>
                      <div>Bins: {result.recommendedDelayMetrics.binCount}</div>
                      <div>Range: {fmt(result.recommendedDelayMetrics.firstFreq, 0)}–{fmt(result.recommendedDelayMetrics.lastFreq, 0)} Hz</div>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 6, color: "#1e40af", fontStyle: "italic", fontSize: 10 }}>
                Both evaluations use the same cleaned, sorted, deduped SPL pipeline as the optimiser scoring.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}