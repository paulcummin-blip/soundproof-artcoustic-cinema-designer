import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";
import { REW_TRACE_ANCHORS_HZ_DB } from "@/components/room/bass/case058RewDigitisedTrace.js";

// Case 059 — Energy Budget / Absolute Level Audit (read-only, diagnostic only).
// No production/solver/Q/phase/reflection/smoothing changes. Uses the current live room only.
// Reuses the Case 058 digitised REW trace as the reference (ignores Cases 052-057 single points).

const ROOM = { widthM: 3.50, lengthM: 5.90, heightM: 2.70 };
const ABSORPTION_ALL = 0.30;
const CURVE_DB = 94;
const FLAT_CURVE = [{ hz: 20, db: CURVE_DB }, { hz: 200, db: CURVE_DB }];
const TEST_FREQUENCIES_HZ = [30, 38, 58, 75, 88, 100, 116, 152];

const ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: ABSORPTION_ALL, back: ABSORPTION_ALL, left: ABSORPTION_ALL, right: ABSORPTION_ALL, ceiling: ABSORPTION_ALL, floor: ABSORPTION_ALL },
  freqMinHz: 20,
  freqMaxHz: 200,
  smoothing: "none",
  pureDeterministicModalSum: true,
  disableLateField: true,
  disableModalPropagationPhase: true,
  modalSourceReferenceMode: "existing",
  qStrategy: "production",
  debugReflectionOrder: 1,
};

function fmt(v, d = 1) { return Number.isFinite(v) ? Number(v).toFixed(d) : "—"; }
function mag(re, im) { return Math.sqrt(re * re + im * im); }
function db(m) { return 20 * Math.log10(Math.max(m, 1e-10)); }

function interpolateRewDb(hz) {
  const anchors = REW_TRACE_ANCHORS_HZ_DB;
  if (hz <= anchors[0][0]) return anchors[0][1];
  if (hz >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];
  for (let i = 0; i < anchors.length - 1; i++) {
    const [f0, v0] = anchors[i], [f1, v1] = anchors[i + 1];
    if (hz >= f0 && hz <= f1) return v0 + (v1 - v0) * ((hz - f0) / (f1 - f0));
  }
  return anchors[anchors.length - 1][1];
}

function resolveLiveSeatAndSub(appState) {
  const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
  const seat = seats.find((s) => s && s.isPrimary) || seats[0] || { x: ROOM.widthM / 2, y: ROOM.lengthM * 0.6, z: 1.2 };
  const sub = { x: ROOM.widthM - 0.30, y: 0.15, z: 0.35, modelKey: appState?.frontSubsCfg?.model || "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  return { seat: { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 }, sub };
}

function nearestVectorRow(perFrequencyVectorDebug, targetHz) {
  return perFrequencyVectorDebug.reduce((best, row) => (
    Math.abs(row.frequencyHz - targetHz) < Math.abs(best.frequencyHz - targetHz) ? row : best
  ), perFrequencyVectorDebug[0]);
}

export default function Case059EnergyBudgetAbsoluteLevelAudit() {
  const appState = useAppState();

  const analysis = useMemo(() => {
    const { seat, sub } = resolveLiveSeatAndSub(appState);
    const engineResult = simulateBassResponseRewCore(ROOM, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const vectorRows = engineResult.perFrequencyVectorDebug || [];

    const rows = TEST_FREQUENCIES_HZ.map((targetHz) => {
      const v = nearestVectorRow(vectorRows, targetHz);
      const directMag = mag(v.directRe, v.directIm);
      const reflectionMag = mag(v.reflectionRe, v.reflectionIm);
      const modalMag = mag(v.modalSumRe, v.modalSumIm);
      const directPlusReflectionRe = v.directRe + v.reflectionRe;
      const directPlusReflectionIm = v.directIm + v.reflectionIm;
      const directPlusReflectionMag = mag(directPlusReflectionRe, directPlusReflectionIm);
      const finalMag = mag(v.finalRe, v.finalIm);
      const finalDb = db(finalMag);
      const rewDb = interpolateRewDb(targetHz);
      const deltaDb = finalDb - rewDb;

      const componentDbs = { direct: db(directMag), reflection: db(reflectionMag), modal: db(modalMag) };
      const dominant = Object.entries(componentDbs).sort((a, b) => b[1] - a[1])[0][0];

      return {
        targetHz, actualHz: v.frequencyHz,
        directRe: v.directRe, directIm: v.directIm, directMag, directDb: componentDbs.direct,
        reflectionRe: v.reflectionRe, reflectionIm: v.reflectionIm, reflectionMag, reflectionDb: componentDbs.reflection,
        modalRe: v.modalSumRe, modalIm: v.modalSumIm, modalMag, modalDb: componentDbs.modal,
        directPlusReflectionMag, directPlusReflectionDb: db(directPlusReflectionMag),
        finalMag, finalDb, rewDb, deltaDb, dominant,
      };
    });

    const avg = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;
    const avgDirectDb = avg(rows.map((r) => r.directDb));
    const avgReflectionDb = avg(rows.map((r) => r.reflectionDb));
    const avgModalDb = avg(rows.map((r) => r.modalDb));
    const avgDeltaDb = avg(rows.map((r) => r.deltaDb));
    const deltaStdDev = Math.sqrt(avg(rows.map((r) => (r.deltaDb - avgDeltaDb) ** 2)));

    // Correlate B44 error against each component's absolute level across the test set —
    // whichever component's dB values track the delta most closely (lowest spread once
    // treated as a constant offset) is the best explanation.
    const correlate = (componentDbKey) => {
      const compVals = rows.map((r) => r[componentDbKey]);
      const deltas = rows.map((r) => r.deltaDb);
      const meanComp = avg(compVals), meanDelta = avg(deltas);
      const cov = avg(compVals.map((c, i) => (c - meanComp) * (deltas[i] - meanDelta)));
      const stdComp = Math.sqrt(avg(compVals.map((c) => (c - meanComp) ** 2)));
      const stdDelta = Math.sqrt(avg(deltas.map((d) => (d - meanDelta) ** 2)));
      return (stdComp > 1e-6 && stdDelta > 1e-6) ? cov / (stdComp * stdDelta) : 0;
    };
    const corrDirect = correlate("directDb");
    const corrReflection = correlate("reflectionDb");
    const corrModal = correlate("modalDb");

    let verdict;
    if (deltaStdDev < 2) {
      verdict = "4. GLOBAL SPL CALIBRATION OFFSET";
    } else {
      const corrs = [
        { label: "1. MODAL ABSOLUTE LEVEL TOO HIGH", value: Math.abs(corrModal) },
        { label: "2. REFLECTION ABSOLUTE LEVEL TOO HIGH", value: Math.abs(corrReflection) },
        { label: "3. DIRECT ABSOLUTE LEVEL TOO HIGH", value: Math.abs(corrDirect) },
      ].sort((a, b) => b.value - a.value);
      verdict = corrs[0].value > 0.5 ? corrs[0].label : "5. ENERGY BUDGET DOES NOT EXPLAIN ERROR";
    }

    return { rows, avgDirectDb, avgReflectionDb, avgModalDb, avgDeltaDb, deltaStdDev, corrDirect, corrReflection, corrModal, verdict, seat, sub };
  }, [appState?.seatingPositions, appState?.frontSubsCfg]);

  return (
    <div style={{ border: "2px solid #7c2d12", borderRadius: 10, background: "#fff7ed", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#7c2d12", fontSize: 13, marginBottom: 6 }}>
        Case 059 — Energy Budget / Absolute Level Audit (read-only)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#fed7aa", border: "1px solid #c2410c", color: "#7c2d12", marginBottom: 10 }}>
        No production/solver/Q/phase/reflection/smoothing changes. Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m, sub front-right, live seat, 0.30 absorption all surfaces, no smoothing, production settings. REW reference = Case 058 digitised trace.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5 }}>
          <thead>
            <tr style={{ background: "#fed7aa" }}>
              {["Hz", "Direct Re/Im/Mag/dB", "Reflection Re/Im/Mag/dB", "Modal Re/Im/Mag/dB", "D+R Mag/dB", "Final Mag/dB", "REW dB", "B44 dB", "Δ (B44-REW)", "Dominant"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #c2410c" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analysis.rows.map((r) => (
              <tr key={r.targetHz}>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{r.targetHz}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.directRe, 3)} / {fmt(r.directIm, 3)} / {fmt(r.directMag, 3)} / {fmt(r.directDb, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.reflectionRe, 3)} / {fmt(r.reflectionIm, 3)} / {fmt(r.reflectionMag, 3)} / {fmt(r.reflectionDb, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.modalRe, 3)} / {fmt(r.modalIm, 3)} / {fmt(r.modalMag, 3)} / {fmt(r.modalDb, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.directPlusReflectionMag, 3)} / {fmt(r.directPlusReflectionDb, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.finalMag, 3)} / {fmt(r.finalDb, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.rewDb, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.finalDb, 1)}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700, color: Math.abs(r.deltaDb) > 15 ? "#b91c1c" : "#166534" }}>{r.deltaDb > 0 ? "+" : ""}{fmt(r.deltaDb, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{r.dominant}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginBottom: 10, fontSize: 9 }}>
        Average direct dB: {fmt(analysis.avgDirectDb, 1)} · Average reflection dB: {fmt(analysis.avgReflectionDb, 1)} · Average modal dB: {fmt(analysis.avgModalDb, 1)} · Average Δ (B44-REW): {fmt(analysis.avgDeltaDb, 1)} dB (spread σ={fmt(analysis.deltaStdDev, 1)} dB)<br/>
        Correlation of Δ vs component dB — direct: {fmt(analysis.corrDirect, 2)} · reflection: {fmt(analysis.corrReflection, 2)} · modal: {fmt(analysis.corrModal, 2)}
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#7c2d12", color: "#fff7ed", border: "1px solid #c2410c" }}>
        <div style={{ fontWeight: 700 }}>TEST: Which pressure component is causing B44 to sit ~15–20 dB too high vs the digitised REW curve?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED = digitised REW SPL at each test frequency (Case 058 reference).<br/>
          ACTUAL = B44 production final SPL, same room/seat/sub/absorption/smoothing.<br/>
          DELTA: average {fmt(analysis.avgDeltaDb, 1)} dB, spread σ={fmt(analysis.deltaStdDev, 1)} dB across {TEST_FREQUENCIES_HZ.length} frequencies (see table).<br/>
          SEVERITY: {Math.abs(analysis.avgDeltaDb) > 12 ? "HIGH — large systematic overshoot" : Math.abs(analysis.avgDeltaDb) > 6 ? "MODERATE" : "LOW"}<br/>
          NEXT FIX CANDIDATE: {analysis.verdict}
        </div>
      </div>
    </div>
  );
}