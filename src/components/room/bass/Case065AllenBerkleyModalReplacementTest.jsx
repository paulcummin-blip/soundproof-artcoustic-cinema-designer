import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { REW_TRACE_ANCHORS_HZ_DB } from "@/components/room/bass/case058RewDigitisedTrace.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 065 — Allen & Berkley Modal Equation Replacement Test (causal test, read-only).
// No production changes. Runs ONE production engine call to harvest direct/reflection/modal
// vectors per frequency bin, then reconstructs three variants purely in this diagnostic file.
// REW reference = Case 058 digitised trace (REW_TRACE_ANCHORS_HZ_DB).

const ROOM = { widthM: 3.50, lengthM: 5.90, heightM: 2.70 };
const V = ROOM.widthM * ROOM.lengthM * ROOM.heightM;
const C = 343;
const CURVE_DB = 94;
const FLAT_CURVE = [{ hz: 20, db: CURVE_DB }, { hz: 200, db: CURVE_DB }];
const CHECK_HZ = [30, 38, 58, 75, 88, 100, 116, 152];

const ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: 0.30, back: 0.30, left: 0.30, right: 0.30, ceiling: 0.30, floor: 0.30 },
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

function fmt(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : "—"; }

function resolveLiveSeatAndSub(appState) {
  const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
  const seat = seats.find((s) => s && s.isPrimary) || seats[0] || { x: ROOM.widthM / 2, y: ROOM.lengthM * 0.6, z: 1.2 };
  const sub = { x: ROOM.widthM - 0.30, y: 0.15, z: 0.35, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  return { seat: { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 }, sub };
}

function interpolateAnchors(anchors, hz) {
  const pts = anchors;
  if (hz <= pts[0][0]) return pts[0][1];
  if (hz >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [h0, d0] = pts[i];
    const [h1, d1] = pts[i + 1];
    if (hz >= h0 && hz <= h1) {
      const r = (hz - h0) / (h1 - h0);
      return d0 + (d1 - d0) * r;
    }
  }
  return pts[pts.length - 1][1];
}

function interpAtHz(freqsHz, dbArray, hz) {
  if (hz <= freqsHz[0]) return dbArray[0];
  if (hz >= freqsHz[freqsHz.length - 1]) return dbArray[dbArray.length - 1];
  for (let i = 0; i < freqsHz.length - 1; i += 1) {
    if (hz >= freqsHz[i] && hz <= freqsHz[i + 1]) {
      const r = (hz - freqsHz[i]) / (freqsHz[i + 1] - freqsHz[i]);
      return dbArray[i] + (dbArray[i + 1] - dbArray[i]) * r;
    }
  }
  return dbArray[dbArray.length - 1];
}

function findFirstPeakAndNull(freqsHz, dbArray) {
  let peak = null;
  let firstNull = null;
  for (let i = 1; i < dbArray.length - 1; i += 1) {
    if (!peak && dbArray[i] > dbArray[i - 1] && dbArray[i] > dbArray[i + 1]) {
      peak = { hz: freqsHz[i], db: dbArray[i] };
    }
    if (!firstNull && dbArray[i] < dbArray[i - 1] && dbArray[i] < dbArray[i + 1]) {
      firstNull = { hz: freqsHz[i], db: dbArray[i] };
    }
    if (peak && firstNull) break;
  }
  return { peak, firstNull };
}

function pearsonCorrelation(a, b) {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  return num / Math.sqrt(Math.max(denA * denB, 1e-12));
}

function bestFrequencyShiftBins(freqsHz, model, rew) {
  // Search integer bin shifts of the model curve against REW, maximizing correlation.
  const n = model.length;
  let bestShift = 0;
  let bestCorr = -Infinity;
  for (let shift = -20; shift <= 20; shift += 1) {
    const a = [];
    const b = [];
    for (let i = 0; i < n; i += 1) {
      const j = i + shift;
      if (j < 0 || j >= n) continue;
      a.push(model[j]);
      b.push(rew[i]);
    }
    if (a.length < n * 0.5) continue;
    const c = pearsonCorrelation(a, b);
    if (c > bestCorr) { bestCorr = c; bestShift = shift; }
  }
  // Convert bin shift to approximate Hz at 60 Hz pivot (96 points/octave log spacing)
  const binRatio = Math.pow(2, 1 / 96);
  const hzAt60 = 60 * (Math.pow(binRatio, bestShift) - 1);
  return { bestShift, bestCorr, hzAt60 };
}

function computeMetrics(label, freqsHz, dbArray, rewDbArray) {
  const n = freqsHz.length;
  const errors = dbArray.map((v, i) => v - rewDbArray[i]);
  const rms = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n);
  const maxError = errors.reduce((m, e) => Math.max(m, Math.abs(e)), 0);
  const gainOffset = errors.reduce((s, e) => s + e, 0) / n; // mean error = best constant gain shift
  const correlation = pearsonCorrelation(dbArray, rewDbArray);
  const { bestShift, hzAt60 } = bestFrequencyShiftBins(freqsHz, dbArray, rewDbArray);
  const { peak, firstNull } = findFirstPeakAndNull(freqsHz, dbArray);
  const checkPoints = {};
  CHECK_HZ.forEach((hz) => { checkPoints[hz] = interpAtHz(freqsHz, dbArray, hz); });

  return {
    label,
    rms, maxError, correlation, gainOffset,
    freqOffsetBins: bestShift, freqOffsetHzAt60: hzAt60,
    firstPeak: peak, firstNull,
    checkPoints,
  };
}

export default function Case065AllenBerkleyModalReplacementTest() {
  const appState = useAppState();

  const result = useMemo(() => {
    const { seat, sub } = resolveLiveSeatAndSub(appState);
    const engineResult = simulateBassResponseRewCore(ROOM, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const { freqsHz, splDbRaw, perFrequencyVectorDebug, activeModalContributorDebugSeries } = engineResult;

    const rewDbArray = freqsHz.map((hz) => interpolateAnchors(REW_TRACE_ANCHORS_HZ_DB, hz));

    // Variant A — production full response (straight from engine)
    const variantA_db = splDbRaw;

    // Variant C — direct + reflections only (from perFrequencyVectorDebug, no modal term)
    const variantC_complex = perFrequencyVectorDebug.map((row) => ({
      re: row.directRe + row.reflectionRe,
      im: row.directIm + row.reflectionIm,
    }));
    const variantC_db = variantC_complex.map(({ re, im }) => 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10)));

    // Variant B — direct + reflections + Allen & Berkley Appendix A modal term
    // A&B Eq. A2: P_modal = (1/V) * Σ_n [ coupling_n / (k_r² - k² + j*k*k_r/Q_n) ] * S(f)
    // Same source amplitude S(f), same modes/Q/coupling as production (harvested per-frequency).
    const variantB_db = freqsHz.map((frequencyHz, i) => {
      const preRow = perFrequencyVectorDebug[i];
      const contributorRow = activeModalContributorDebugSeries[i];
      const k = (2 * Math.PI * frequencyHz) / C;
      const curveDb = CURVE_DB; // flat curve, gainDb=0
      const S = Math.pow(10, curveDb / 20);

      let modalAB_re = 0;
      let modalAB_im = 0;
      const contributors = contributorRow?.contributors || [];
      contributors.forEach((c) => {
        const f0 = c.modeFrequencyHz;
        const q = c.qValue;
        const coupling = c.combinedCoupling;
        const kr = (2 * Math.PI * f0) / C;
        const kr2 = kr * kr;
        const k2 = k * k;
        const realDen = kr2 - k2;
        const imagDen = k * kr / Math.max(q, 1e-6);
        const denomSq = realDen * realDen + imagDen * imagDen;
        const Hre = realDen / denomSq;
        const Him = -imagDen / denomSq;
        const gain = S * coupling * (1 / V);
        modalAB_re += gain * Hre;
        modalAB_im += gain * Him;
      });

      const totalRe = preRow.directRe + preRow.reflectionRe + modalAB_re;
      const totalIm = preRow.directIm + preRow.reflectionIm + modalAB_im;
      return 20 * Math.log10(Math.max(Math.sqrt(totalRe * totalRe + totalIm * totalIm), 1e-10));
    });

    const metricsA = computeMetrics("A — Production full response", freqsHz, variantA_db, rewDbArray);
    const metricsB = computeMetrics("B — Direct+Reflection+A&B modal", freqsHz, variantB_db, rewDbArray);
    const metricsC = computeMetrics("C — Direct+Reflection only", freqsHz, variantC_db, rewDbArray);

    return { metricsA, metricsB, metricsC };
  }, [appState?.seatingPositions, appState?.frontSubsCfg]);

  const { metricsA, metricsB, metricsC } = result;

  const abImprovesOverProd = metricsB.rms < metricsA.rms;
  const abImprovesOverDirectRefl = metricsB.rms < metricsC.rms;
  const rmsGapAB_vs_Prod = metricsA.rms - metricsB.rms;
  const rmsGapAB_vs_DirRefl = metricsB.rms - metricsC.rms;

  let verdictNumber, verdictText;
  if (metricsB.rms <= 3.0) {
    verdictNumber = 1; verdictText = "ALLEN & BERKLEY MODAL EQUATION FIXES PARITY";
  } else if (abImprovesOverProd && metricsB.rms < metricsA.rms * 0.7) {
    verdictNumber = 2; verdictText = "ALLEN & BERKLEY MODAL EQUATION IMPROVES BUT DOES NOT FIX PARITY";
  } else if (!abImprovesOverProd || Math.abs(rmsGapAB_vs_Prod) < 1.0) {
    verdictNumber = 3; verdictText = "ALLEN & BERKLEY MODAL EQUATION DOES NOT IMPROVE PARITY";
  } else {
    verdictNumber = 4; verdictText = "CASE 064 DIVERGENCE IS NOT THE CAUSAL ERROR";
  }
  // Refine: verdict 3 vs 4 — if AB is WORSE than direct+reflection alone, the modal term itself
  // (even corrected per A&B) is not the causal driver of REW mismatch → verdict 4.
  if (!abImprovesOverDirectRefl && verdictNumber !== 1) {
    verdictNumber = 4;
    verdictText = "CASE 064 DIVERGENCE IS NOT THE CAUSAL ERROR";
  }

  const MetricRow = ({ m }) => (
    <tr>
      <td style={{ padding: "2px 4px", fontWeight: 700 }}>{m.label}</td>
      <td style={{ padding: "2px 4px" }}>{fmt(m.rms, 2)} dB</td>
      <td style={{ padding: "2px 4px" }}>{fmt(m.maxError, 2)} dB</td>
      <td style={{ padding: "2px 4px" }}>{fmt(m.correlation, 3)}</td>
      <td style={{ padding: "2px 4px" }}>{fmt(m.gainOffset, 2)} dB</td>
      <td style={{ padding: "2px 4px" }}>{m.freqOffsetBins} bins (~{fmt(m.freqOffsetHzAt60, 1)} Hz@60Hz)</td>
      <td style={{ padding: "2px 4px" }}>{m.firstPeak ? `${fmt(m.firstPeak.hz, 1)} Hz / ${fmt(m.firstPeak.db, 1)} dB` : "—"}</td>
      <td style={{ padding: "2px 4px" }}>{m.firstNull ? `${fmt(m.firstNull.hz, 1)} Hz / ${fmt(m.firstNull.db, 1)} dB` : "—"}</td>
      {CHECK_HZ.map((hz) => (
        <td key={hz} style={{ padding: "2px 4px" }}>{fmt(m.checkPoints[hz], 1)}</td>
      ))}
    </tr>
  );

  return (
    <div style={{ border: "2px solid #7c2d12", borderRadius: 10, background: "#fff7ed", padding: 14, fontFamily: "monospace", fontSize: 9.5 }}>
      <div style={{ fontWeight: 700, color: "#7c2d12", fontSize: 13, marginBottom: 6 }}>
        Case 065 — Allen & Berkley Modal Equation Replacement Test (causal, read-only)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#ffedd5", border: "1px solid #c2410c", color: "#7c2d12", marginBottom: 10 }}>
        No production changes. Variant B replaces only the modal term with A&B Eq. A2 form
        (explicit 1/V, dimensional denominator k_r²−k²+jk·k_r/Q), using the SAME source amplitude,
        modes, Q, and coupling harvested from ONE production engine call. No empirical gain added.
        Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m (V={fmt(V, 2)} m³). REW ref = Case 058 digitised trace.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
          <thead>
            <tr style={{ background: "#ffedd5" }}>
              {["Variant", "RMS err", "Max err", "Corr", "Gain offs.", "Freq offs.", "1st peak", "1st null",
                ...CHECK_HZ.map((h) => `${h}Hz`)].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #c2410c", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <MetricRow m={metricsA} />
            <MetricRow m={metricsB} />
            <MetricRow m={metricsC} />
          </tbody>
        </table>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#7c2d12", color: "#fff7ed", border: "1px solid #c2410c", fontSize: 9 }}>
        <div style={{ fontWeight: 700, fontSize: 11 }}>REPORT</div>
        <div style={{ marginTop: 6, lineHeight: 1.7 }}>
          Production modal RMS vs REW (variant A): <b>{fmt(metricsA.rms, 2)} dB</b><br/>
          Allen & Berkley modal RMS vs REW (variant B): <b>{fmt(metricsB.rms, 2)} dB</b><br/>
          Direct+reflection RMS vs REW (variant C, no modal): <b>{fmt(metricsC.rms, 2)} dB</b><br/>
          Does A&B modal improve over production modal? <b>{abImprovesOverProd ? "YES" : "NO"}</b> (ΔRMS = {fmt(rmsGapAB_vs_Prod, 2)} dB)<br/>
          Does A&B modal improve over direct+reflection only? <b>{abImprovesOverDirectRefl ? "YES" : "NO"}</b> (ΔRMS = {fmt(rmsGapAB_vs_DirRefl, 2)} dB)<br/>
          Is the Case 064 divergence causally responsible for the Case 058 mismatch? <b>{verdictNumber <= 2 ? "YES, substantially" : "NOT PRIMARILY"}</b>
        </div>

        <div style={{ marginTop: 10, fontWeight: 700, fontSize: 11 }}>FINAL VERDICT: {verdictNumber}. {verdictText}</div>

        <div style={{ marginTop: 10, lineHeight: 1.7 }}>
          <b>TEST:</b> Does replacing only the modal pressure term with the exact Allen & Berkley Appendix A formulation (explicit 1/V, dimensional denominator, same Q/modes/coupling) improve REW parity relative to production, without any empirical gain correction?<br/><br/>
          <b>EXPECTED:</b> If the Case 064 divergence (missing 1/V, denominator convention) is the primary cause of the ~15–20 dB modal excess vs REW, variant B's RMS error should drop substantially below variant A's, approaching variant C (direct+reflection only) or better.<br/><br/>
          <b>ACTUAL:</b> Variant A (production) RMS = {fmt(metricsA.rms, 2)} dB. Variant B (A&B modal) RMS = {fmt(metricsB.rms, 2)} dB. Variant C (no modal) RMS = {fmt(metricsC.rms, 2)} dB. Gain offsets: A={fmt(metricsA.gainOffset, 2)}, B={fmt(metricsB.gainOffset, 2)}, C={fmt(metricsC.gainOffset, 2)} dB. Correlations: A={fmt(metricsA.correlation, 3)}, B={fmt(metricsB.correlation, 3)}, C={fmt(metricsC.correlation, 3)}.<br/><br/>
          <b>DELTA:</b> A&B modal {abImprovesOverProd ? "reduces" : "does not reduce"} RMS error relative to production by {fmt(Math.abs(rmsGapAB_vs_Prod), 2)} dB, and is {abImprovesOverDirectRefl ? "better than" : "worse than or equal to"} direct+reflection alone by {fmt(Math.abs(rmsGapAB_vs_DirRefl), 2)} dB.<br/><br/>
          <b>SEVERITY:</b> {verdictNumber === 1 ? "RESOLVED" : verdictNumber === 2 ? "PARTIAL — further investigation needed beyond the modal equation" : "INFORMATIONAL — redirect investigation away from the modal equation term"}<br/><br/>
          <b>NEXT FIX CANDIDATE:</b> {verdictNumber === 1
            ? "Apply the Eq. A2 1/V and dimensional-denominator correction directly to production (rewBassEngine.js modalSourceReferenceMode branch)."
            : verdictNumber === 2
              ? "Apply the Eq. A2 correction as a partial fix, then continue investigating remaining RMS error in the direct/reflection path or source-level calibration."
              : "The modal equation form (1/V, denominator convention) is not the dominant cause of the REW mismatch — redirect investigation to direct-path amplitude calibration, reflection coherence weighting, or absolute source SPL reference (curveDb=94) rather than the modal Green's function."}
        </div>
      </div>
    </div>
  );
}