import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";
import { REW_TRACE_ANCHORS_HZ_DB } from "@/components/room/bass/case058RewDigitisedTrace.js";

// Case 060 — Pressure Unit / Summation Scaling Audit (read-only, diagnostic only).
// No production/solver/Q/phase/smoothing/reflection changes. Single live engine call;
// all scaling variants are recombined post-hoc from the same per-frequency Re/Im vectors.
// REW reference = Case 058 digitised trace (ignores Cases 052-057 single points).

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

const VARIANTS = [
  { key: "A", label: "A — production", modalScale: 1, drScale: 1, globalGainDb: 0 },
  { key: "B", label: "B — modal × 0.50", modalScale: 0.5, drScale: 1, globalGainDb: 0 },
  { key: "C", label: "C — modal × 0.25", modalScale: 0.25, drScale: 1, globalGainDb: 0 },
  { key: "D", label: "D — modal × 0.125", modalScale: 0.125, drScale: 1, globalGainDb: 0 },
  { key: "E", label: "E — modal × 0.10", modalScale: 0.10, drScale: 1, globalGainDb: 0 },
  { key: "F", label: "F — direct+reflection × 2.0", modalScale: 1, drScale: 2.0, globalGainDb: 0 },
  { key: "G", label: "G — direct+reflection × 4.0", modalScale: 1, drScale: 4.0, globalGainDb: 0 },
  { key: "H", label: "H — direct+reflection × 8.0", modalScale: 1, drScale: 8.0, globalGainDb: 0 },
  { key: "I", label: "I — final global gain −18 dB", modalScale: 1, drScale: 1, globalGainDb: -18 },
];

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : "—"; }
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

function findFirstPeakAndNull(series) {
  let peak = null, dip = null;
  for (let i = 1; i < series.length - 1; i++) {
    if (!peak && series[i].db > series[i - 1].db && series[i].db >= series[i + 1].db) peak = series[i];
    if (!dip && series[i].db < series[i - 1].db && series[i].db <= series[i + 1].db) dip = series[i];
    if (peak && dip) break;
  }
  return { peak, dip };
}

function recombineVariant(vectorRows, variant) {
  return vectorRows.map((v) => {
    const drRe = v.directRe + v.reflectionRe;
    const drIm = v.directIm + v.reflectionIm;
    const residualRe = v.finalRe - v.directRe - v.reflectionRe - v.modalSumRe;
    const residualIm = v.finalIm - v.directIm - v.reflectionIm - v.modalSumIm;
    let re = (drRe * variant.drScale) + (v.modalSumRe * variant.modalScale) + residualRe;
    let im = (drIm * variant.drScale) + (v.modalSumIm * variant.modalScale) + residualIm;
    let m = mag(re, im);
    if (variant.globalGainDb !== 0) m *= Math.pow(10, variant.globalGainDb / 20);
    return { frequencyHz: v.frequencyHz, db: db(m) };
  });
}

function scoreVariant(series) {
  let sumSq = 0, maxErr = 0, n = 0;
  let sumRew = 0, sumB44 = 0, sumRewSq = 0, sumB44Sq = 0, sumRewB44 = 0;
  series.forEach((p) => {
    const rewDb = interpolateRewDb(p.frequencyHz);
    const err = p.db - rewDb;
    sumSq += err * err;
    maxErr = Math.max(maxErr, Math.abs(err));
    n++;
    sumRew += rewDb; sumB44 += p.db;
    sumRewSq += rewDb * rewDb; sumB44Sq += p.db * p.db;
    sumRewB44 += rewDb * p.db;
  });
  const rmsError = Math.sqrt(sumSq / n);
  const covariance = (sumRewB44 / n) - (sumRew / n) * (sumB44 / n);
  const rewStd = Math.sqrt((sumRewSq / n) - (sumRew / n) ** 2);
  const b44Std = Math.sqrt((sumB44Sq / n) - (sumB44 / n) ** 2);
  const correlation = (rewStd > 1e-9 && b44Std > 1e-9) ? covariance / (rewStd * b44Std) : null;

  const { peak, dip } = findFirstPeakAndNull(series);
  const sample58 = series.reduce((best, p) => (Math.abs(p.frequencyHz - 58) < Math.abs(best.frequencyHz - 58) ? p : best), series[0]);
  const sample100 = series.reduce((best, p) => (Math.abs(p.frequencyHz - 100) < Math.abs(best.frequencyHz - 100) ? p : best), series[0]);

  return { rmsError, maxErr, correlation, peak, dip, spl58: sample58.db, spl100: sample100.db };
}

export default function Case060PressureUnitSummationScalingAudit() {
  const appState = useAppState();

  const analysis = useMemo(() => {
    const { seat, sub } = resolveLiveSeatAndSub(appState);
    const engineResult = simulateBassResponseRewCore(ROOM, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const vectorRows = engineResult.perFrequencyVectorDebug || [];

    const perFreqRows = TEST_FREQUENCIES_HZ.map((targetHz) => {
      const v = nearestVectorRow(vectorRows, targetHz);
      const directMag = mag(v.directRe, v.directIm);
      const reflectionMag = mag(v.reflectionRe, v.reflectionIm);
      const modalMag = mag(v.modalSumRe, v.modalSumIm);
      const finalMag = mag(v.finalRe, v.finalIm);
      return {
        targetHz, actualHz: v.frequencyHz,
        directMag, reflectionMag, modalMag, finalMag,
        directDb: db(directMag), reflectionDb: db(reflectionMag), modalDb: db(modalMag), finalDb: db(finalMag),
      };
    });

    const variantResults = VARIANTS.map((variant) => {
      const series = recombineVariant(vectorRows, variant);
      const score = scoreVariant(series);
      const productionRms = variant.key === "A" ? score.rmsError : null;
      return { ...variant, ...score };
    });
    const productionRms = variantResults.find((v) => v.key === "A").rmsError;
    variantResults.forEach((v) => { v.closerToRew = v.key === "A" ? "—" : (v.rmsError < productionRms ? "YES" : "NO"); });

    const best = variantResults.filter((v) => v.key !== "A").sort((a, b) => a.rmsError - b.rmsError)[0];
    let verdict;
    if (best.rmsError >= productionRms * 0.95) {
      verdict = "5. PRESSURE UNIT / SCALING RETIRED — no scaling variant materially improves full-curve parity.";
    } else if (best.key === "I") {
      verdict = "3. GLOBAL SPL CALIBRATION OFFSET — a flat gain shift best explains the deviation.";
    } else if (["B", "C", "D", "E"].includes(best.key)) {
      verdict = "1. MODAL PRESSURE SCALE TOO HIGH — reducing modal contribution improves parity most.";
    } else if (["F", "G", "H"].includes(best.key)) {
      verdict = "2. DIRECT/REFLECTION PRESSURE SCALE TOO LOW — boosting direct+reflection improves parity most.";
    } else {
      verdict = "5. PRESSURE UNIT / SCALING RETIRED";
    }

    return { perFreqRows, variantResults, best, verdict, productionRms };
  }, [appState?.seatingPositions, appState?.frontSubsCfg]);

  return (
    <div style={{ border: "2px solid #4c1d95", borderRadius: 10, background: "#f5f3ff", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#4c1d95", fontSize: 13, marginBottom: 6 }}>
        Case 060 — Pressure Unit / Summation Scaling Audit (read-only)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#ddd6fe", border: "1px solid #6d28d9", color: "#4c1d95", marginBottom: 10 }}>
        No production/solver/Q/phase/smoothing/reflection changes. Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m, sub front-right, live seat, 0.30 absorption all surfaces, no smoothing, production settings. Single live engine call — all variants below are recombined post-hoc from the same Re/Im vectors, not re-simulated.
      </div>

      <div style={{ marginBottom: 10, padding: 8, background: "#ede9fe", borderRadius: 6, border: "1px solid #6d28d9" }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>PIPELINE INSPECTION (from source):</div>
        Exact dB reference used: 20·log10(magnitude), reference amplitude = 1.0 (no external calibration constant applied anywhere in this call chain).<br/>
        dB conversion happens: AFTER summation — complex Re/Im vectors are summed first (sumRe/sumIm), dB is computed once on the final summed magnitude.<br/>
        Direct/reflection/modal summed as signed Re/Im complex pressure: YES — confirmed in source (sumRe += directRe/imageRe/modalSumRe/lateFieldRe, sumIm equivalent).<br/>
        Any component magnitude- or power-summed before final dB: NO — only diagnostic-only (unused for this returned value) distributed/split-coherence paths do that; the active production sum is fully coherent complex addition.<br/>
        Hidden gain multiplier: modalGainScalar and reflectionGainScale both default to 1.0 and are not overridden by this call — no hidden multiplier active in this configuration.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5 }}>
          <thead>
            <tr style={{ background: "#ddd6fe" }}>
              {["Hz", "Direct Mag/dB", "Reflection Mag/dB", "Modal Mag/dB", "Final Mag/dB"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #6d28d9" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analysis.perFreqRows.map((r) => (
              <tr key={r.targetHz}>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{r.targetHz}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.directMag, 3)} / {fmt(r.directDb, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.reflectionMag, 3)} / {fmt(r.reflectionDb, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.modalMag, 3)} / {fmt(r.modalDb, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.finalMag, 3)} / {fmt(r.finalDb, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.5 }}>
          <thead>
            <tr style={{ background: "#ddd6fe" }}>
              {["Variant", "RMS err", "Max err", "Corr", "1st peak Hz/dB", "1st null Hz/dB", "58Hz dB", "100Hz dB", "Closer to REW?"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #6d28d9" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analysis.variantResults.map((v) => (
              <tr key={v.key} style={{ background: v.key === analysis.best.key ? "#c4b5fd" : "transparent" }}>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{v.label}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.rmsError, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.maxErr, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.correlation, 3)}</td>
                <td style={{ padding: "2px 4px" }}>{v.peak ? `${fmt(v.peak.frequencyHz, 1)} / ${fmt(v.peak.db, 1)}` : "—"}</td>
                <td style={{ padding: "2px 4px" }}>{v.dip ? `${fmt(v.dip.frequencyHz, 1)} / ${fmt(v.dip.db, 1)}` : "—"}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.spl58, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(v.spl100, 1)}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{v.closerToRew}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#4c1d95", color: "#f5f3ff", border: "1px solid #6d28d9" }}>
        <div style={{ fontWeight: 700 }}>TEST: Is B44's excess level caused by inconsistent pressure-unit/summation scaling between direct, reflection, and modal terms?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED = digitised REW curve (Case 058 reference).<br/>
          ACTUAL = B44 production full-curve response, same room/seat/sub/absorption/smoothing.<br/>
          DELTA: production RMS error {fmt(analysis.productionRms, 2)} dB vs REW; best scaling variant ({analysis.best.label}) RMS error {fmt(analysis.best.rmsError, 2)} dB.<br/>
          SEVERITY: {analysis.best.rmsError < analysis.productionRms * 0.6 ? "HIGH — a scaling variant materially improves parity" : analysis.best.rmsError < analysis.productionRms * 0.9 ? "MODERATE" : "LOW"}<br/>
          NEXT FIX CANDIDATE: {analysis.verdict}
        </div>
      </div>
    </div>
  );
}