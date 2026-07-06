import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { REW_TRACE_ANCHORS_HZ_DB } from "@/components/room/bass/case058RewDigitisedTrace.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 066 — Residual Error Source Isolation (causal, read-only). Supersedes nothing —
// builds directly on Case 065's Allen & Berkley modal baseline. No production changes.
// No modal equation revisit, no Q/smoothing/mode-frequency/position changes.

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

function computeMetrics(label, freqsHz, dbArray, rewDbArray) {
  const n = freqsHz.length;
  const errors = dbArray.map((v, i) => v - rewDbArray[i]);
  const rms = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n);
  const maxError = errors.reduce((m, e) => Math.max(m, Math.abs(e)), 0);
  const gainOffset = errors.reduce((s, e) => s + e, 0) / n;
  const correlation = pearsonCorrelation(dbArray, rewDbArray);
  const { peak, firstNull } = findFirstPeakAndNull(freqsHz, dbArray);
  const checkPoints = {};
  CHECK_HZ.forEach((hz) => { checkPoints[hz] = interpAtHz(freqsHz, dbArray, hz); });
  // 80-200Hz band mean error, for "systematically too high" check
  const bandIdx = freqsHz.map((f, i) => (f >= 80 && f <= 200 ? i : -1)).filter((i) => i >= 0);
  const bandMeanError = bandIdx.length ? bandIdx.reduce((s, i) => s + errors[i], 0) / bandIdx.length : null;

  return { label, rms, maxError, correlation, gainOffset, firstPeak: peak, firstNull, checkPoints, bandMeanError };
}

export default function Case066ResidualErrorSourceIsolation() {
  const appState = useAppState();

  const { variantMetrics, verdictNumber, verdictText, summary } = useMemo(() => {
    const { seat, sub } = resolveLiveSeatAndSub(appState);
    const engineResult = simulateBassResponseRewCore(ROOM, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const { freqsHz, perFrequencyVectorDebug, activeModalContributorDebugSeries } = engineResult;

    const rewDbArray = freqsHz.map((hz) => interpolateAnchors(REW_TRACE_ANCHORS_HZ_DB, hz));

    // Harvest per-frequency direct/reflection vectors + build A&B modal vector (Case 065 baseline)
    const perFreq = freqsHz.map((frequencyHz, i) => {
      const preRow = perFrequencyVectorDebug[i];
      const contributorRow = activeModalContributorDebugSeries[i];
      const k = (2 * Math.PI * frequencyHz) / C;
      const S = Math.pow(10, CURVE_DB / 20);

      let modalRe = 0;
      let modalIm = 0;
      const contributors = contributorRow?.contributors || [];
      contributors.forEach((c) => {
        const f0 = c.modeFrequencyHz;
        const q = c.qValue;
        const coupling = c.combinedCoupling;
        const kr = (2 * Math.PI * f0) / C;
        const kr2 = kr * kr;
        const k2 = k * k;
        const realDen = kr2 - k2;
        const imagDen = (k * kr) / Math.max(q, 1e-6);
        const denomSq = realDen * realDen + imagDen * imagDen;
        const Hre = realDen / denomSq;
        const Him = -imagDen / denomSq;
        const gain = S * coupling * (1 / V);
        modalRe += gain * Hre;
        modalIm += gain * Him;
      });

      return {
        frequencyHz,
        directRe: preRow.directRe, directIm: preRow.directIm,
        reflectionRe: preRow.reflectionRe, reflectionIm: preRow.reflectionIm,
        modalRe, modalIm,
      };
    });

    // Generic variant builder: combine direct/reflection/modal with scale factors and freq cutoffs.
    function buildVariant({ directScale = (f) => 0, reflectionScale = (f) => 0, modalScale = (f) => 0 }) {
      return perFreq.map((row) => {
        const dRe = row.directRe * directScale(row.frequencyHz);
        const dIm = row.directIm * directScale(row.frequencyHz);
        const rRe = row.reflectionRe * reflectionScale(row.frequencyHz);
        const rIm = row.reflectionIm * reflectionScale(row.frequencyHz);
        const mRe = row.modalRe * modalScale(row.frequencyHz);
        const mIm = row.modalIm * modalScale(row.frequencyHz);
        const totalRe = dRe + rRe + mRe;
        const totalIm = dIm + rIm + mIm;
        return 20 * Math.log10(Math.max(Math.sqrt(totalRe * totalRe + totalIm * totalIm), 1e-10));
      });
    }

    const one = () => 1;
    const zero = () => 0;
    const cutBelow80 = () => (f) => (f < 80 ? 0 : 1);
    const half = () => 0.5;
    const quarter = () => 0.25;
    const two = () => 2.0;

    const variants = {
      A: buildVariant({ directScale: one, reflectionScale: zero, modalScale: zero }),
      B: buildVariant({ directScale: zero, reflectionScale: one, modalScale: zero }),
      C: buildVariant({ directScale: one, reflectionScale: one, modalScale: zero }),
      D: buildVariant({ directScale: zero, reflectionScale: zero, modalScale: one }),
      E: buildVariant({ directScale: one, reflectionScale: zero, modalScale: one }),
      F: buildVariant({ directScale: zero, reflectionScale: one, modalScale: one }),
      G: buildVariant({ directScale: one, reflectionScale: one, modalScale: one }),
      H: buildVariant({ directScale: one, reflectionScale: cutBelow80(), modalScale: one }),
      I: buildVariant({ directScale: cutBelow80(), reflectionScale: one, modalScale: one }),
      J: buildVariant({ directScale: one, reflectionScale: half, modalScale: one }),
      K: buildVariant({ directScale: one, reflectionScale: quarter, modalScale: one }),
      L: buildVariant({ directScale: half, reflectionScale: one, modalScale: one }),
      M: buildVariant({ directScale: two, reflectionScale: one, modalScale: one }),
    };

    const labels = {
      A: "A — Direct only", B: "B — Reflections only", C: "C — Direct+Reflections",
      D: "D — A&B modal only", E: "E — Direct+A&B modal", F: "F — Reflections+A&B modal",
      G: "G — Direct+Reflections+A&B modal", H: "H — G, reflections=0 below 80Hz",
      I: "I — G, direct=0 below 80Hz", J: "J — G, reflection×0.5", K: "K — G, reflection×0.25",
      L: "L — G, direct×0.5", M: "M — G, direct×2.0",
    };

    const variantMetrics = Object.keys(variants).map((key) =>
      computeMetrics(labels[key], freqsHz, variants[key], rewDbArray)
    );

    // Analysis
    const byRms = [...variantMetrics].sort((a, b) => a.rms - b.rms);
    const best = byRms[0];
    const gMetric = variantMetrics.find((m) => m.label.startsWith("G"));
    const aMetric = variantMetrics.find((m) => m.label.startsWith("A "));
    const bMetric = variantMetrics.find((m) => m.label.startsWith("B "));
    const dMetric = variantMetrics.find((m) => m.label.startsWith("D "));
    const lMetric = variantMetrics.find((m) => m.label.startsWith("L"));
    const mMetric = variantMetrics.find((m) => m.label.startsWith("M"));
    const jMetric = variantMetrics.find((m) => m.label.startsWith("J"));
    const kMetric = variantMetrics.find((m) => m.label.startsWith("K"));
    const hMetric = variantMetrics.find((m) => m.label.startsWith("H"));
    const iMetric = variantMetrics.find((m) => m.label.startsWith("I"));

    const globalGainRemains = Math.abs(gMetric.gainOffset) > 2.0;
    const highBandTooHigh = gMetric.bandMeanError !== null && gMetric.bandMeanError > 2.0;
    const directFieldDominates = lMetric.rms < gMetric.rms - 0.5; // halving direct helps a lot
    const reflectionFieldDominates = (jMetric.rms < gMetric.rms - 0.5) || (kMetric.rms < gMetric.rms - 0.5);
    const lowFreqReflectionDominates = hMetric.rms < gMetric.rms - 0.5;
    const modalDominates = dMetric.rms < gMetric.rms && (gMetric.rms - Math.min(aMetric.rms, bMetric.rms, gMetric.rms)) > 3;

    let verdictNumber, verdictText;
    if (directFieldDominates && !reflectionFieldDominates) {
      verdictNumber = 1; verdictText = "RESIDUAL ERROR IS DIRECT FIELD SCALE";
    } else if (reflectionFieldDominates && !lowFreqReflectionDominates) {
      verdictNumber = 2; verdictText = "RESIDUAL ERROR IS REFLECTION FIELD SCALE";
    } else if (lowFreqReflectionDominates) {
      verdictNumber = 3; verdictText = "RESIDUAL ERROR IS LOW-FREQUENCY REFLECTION MODEL";
    } else if (globalGainRemains && !directFieldDominates && !reflectionFieldDominates) {
      verdictNumber = 4; verdictText = "RESIDUAL ERROR IS GLOBAL SOURCE CALIBRATION";
    } else {
      verdictNumber = 5; verdictText = "RESIDUAL ERROR IS NOT ISOLATED";
    }

    const summary = {
      best, globalGainRemains, highBandTooHigh, directFieldDominates,
      reflectionFieldDominates, lowFreqReflectionDominates, modalDominates,
      gMetric, aMetric, bMetric, dMetric, lMetric, mMetric, jMetric, kMetric, hMetric, iMetric,
    };

    return { variantMetrics, verdictNumber, verdictText, summary };
  }, [appState?.seatingPositions, appState?.frontSubsCfg]);

  const MetricRow = ({ m }) => (
    <tr>
      <td style={{ padding: "2px 4px", fontWeight: 700, whiteSpace: "nowrap" }}>{m.label}</td>
      <td style={{ padding: "2px 4px" }}>{fmt(m.rms, 2)}</td>
      <td style={{ padding: "2px 4px" }}>{fmt(m.maxError, 2)}</td>
      <td style={{ padding: "2px 4px" }}>{fmt(m.correlation, 3)}</td>
      <td style={{ padding: "2px 4px" }}>{fmt(m.gainOffset, 2)}</td>
      {CHECK_HZ.map((hz) => (
        <td key={hz} style={{ padding: "2px 4px" }}>{fmt(m.checkPoints[hz], 1)}</td>
      ))}
      <td style={{ padding: "2px 4px" }}>{m.firstPeak ? `${fmt(m.firstPeak.hz, 1)}/${fmt(m.firstPeak.db, 1)}` : "—"}</td>
      <td style={{ padding: "2px 4px" }}>{m.firstNull ? `${fmt(m.firstNull.hz, 1)}/${fmt(m.firstNull.db, 1)}` : "—"}</td>
    </tr>
  );

  return (
    <div style={{ border: "2px solid #4c1d95", borderRadius: 10, background: "#f5f3ff", padding: 14, fontFamily: "monospace", fontSize: 9.5 }}>
      <div style={{ fontWeight: 700, color: "#4c1d95", fontSize: 13, marginBottom: 6 }}>
        Case 066 — Residual Error Source Isolation (causal, read-only)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#ede9fe", border: "1px solid #6d28d9", color: "#4c1d95", marginBottom: 10 }}>
        No production changes. Builds on Case 065's Allen & Berkley modal baseline (explicit 1/V,
        dimensional denominator). Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m (V={fmt(V, 2)} m³).
        REW ref = Case 058 digitised trace. 13 read-only variants (A–M).
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7.5 }}>
          <thead>
            <tr style={{ background: "#ede9fe" }}>
              {["Variant", "RMS", "Max err", "Corr", "Gain offs.",
                ...CHECK_HZ.map((h) => `${h}Hz`), "1st peak", "1st null"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #6d28d9", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variantMetrics.map((m) => <MetricRow key={m.label} m={m} />)}
          </tbody>
        </table>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#4c1d95", color: "#f5f3ff", border: "1px solid #6d28d9", fontSize: 9 }}>
        <div style={{ fontWeight: 700, fontSize: 11 }}>ANALYSIS</div>
        <div style={{ marginTop: 6, lineHeight: 1.7 }}>
          Best RMS variant: <b>{summary.best.label}</b> ({fmt(summary.best.rms, 2)} dB)<br/>
          Direct field dominates residual error (L: direct×0.5 helps ≥0.5dB)? <b>{summary.directFieldDominates ? "YES" : "NO"}</b><br/>
          Reflection field dominates residual error (J/K: reflection×0.5/0.25 helps ≥0.5dB)? <b>{summary.reflectionFieldDominates ? "YES" : "NO"}</b><br/>
          A&B modal field dominates? <b>{summary.modalDominates ? "YES" : "NO"}</b><br/>
          Frequency-independent gain offset remains on G? <b>{summary.globalGainRemains ? "YES" : "NO"}</b> ({fmt(summary.gMetric.gainOffset, 2)} dB)<br/>
          80–200 Hz band systematically too high on G? <b>{summary.highBandTooHigh ? "YES" : "NO"}</b> (mean band error {fmt(summary.gMetric.bandMeanError, 2)} dB)<br/>
          Low-frequency reflection model dominant (H: reflections=0 below 80Hz helps ≥0.5dB)? <b>{summary.lowFreqReflectionDominates ? "YES" : "NO"}</b>
        </div>

        <div style={{ marginTop: 10, fontWeight: 700, fontSize: 11 }}>FINAL VERDICT: {verdictNumber}. {verdictText}</div>

        <div style={{ marginTop: 10, lineHeight: 1.7 }}>
          <b>TEST:</b> After applying the Allen & Berkley modal correction (Case 065), which field (direct, reflection, or modal) and which scaling/frequency-band adjustment isolates the remaining ~6.77 dB RMS error vs REW?<br/><br/>
          <b>EXPECTED:</b> If a single field's scale or a low-frequency reflection artifact is the residual cause, targeted scale/cutoff variants (L/M for direct, J/K for reflection, H/I for band cutoffs) should show a materially lower RMS than G, isolating the dominant contributor.<br/><br/>
          <b>ACTUAL:</b> G (direct+reflection+A&B modal) RMS = {fmt(summary.gMetric.rms, 2)} dB, gain offset = {fmt(summary.gMetric.gainOffset, 2)} dB. Direct-only (A) RMS = {fmt(summary.aMetric.rms, 2)} dB. Reflections-only (B) RMS = {fmt(summary.bMetric.rms, 2)} dB. A&B-modal-only (D) RMS = {fmt(summary.dMetric.rms, 2)} dB. Direct×0.5 (L) RMS = {fmt(summary.lMetric.rms, 2)} dB. Direct×2.0 (M) RMS = {fmt(summary.mMetric.rms, 2)} dB. Reflection×0.5 (J) RMS = {fmt(summary.jMetric.rms, 2)} dB. Reflection×0.25 (K) RMS = {fmt(summary.kMetric.rms, 2)} dB. Reflections=0 below 80Hz (H) RMS = {fmt(summary.hMetric.rms, 2)} dB. Direct=0 below 80Hz (I) RMS = {fmt(summary.iMetric.rms, 2)} dB. Best overall variant: {summary.best.label} at {fmt(summary.best.rms, 2)} dB.<br/><br/>
          <b>DELTA:</b> {summary.directFieldDominates
            ? `Direct-field scale reduction materially improves RMS (L vs G: ${fmt(summary.gMetric.rms - summary.lMetric.rms, 2)} dB gain) — direct path amplitude is the dominant residual error source.`
            : summary.reflectionFieldDominates
              ? `Reflection-field scale reduction materially improves RMS (best of J/K vs G) — reflection coefficient/gain calibration is the dominant residual error source.`
              : summary.lowFreqReflectionDominates
                ? `Removing reflections below 80 Hz (H vs G: ${fmt(summary.gMetric.rms - summary.hMetric.rms, 2)} dB gain) materially improves RMS — the low-frequency reflection model (coherence weighting / image-source approximation below Schroeder) is the dominant residual error source.`
                : summary.globalGainRemains
                  ? `No single field-scale or band-cutoff variant materially improves RMS beyond G, but a persistent frequency-independent gain offset of ${fmt(summary.gMetric.gainOffset, 2)} dB remains across the full curve — consistent with a single global source-level calibration error (e.g. curveDb=94 reference, or a missing constant elsewhere in the direct-path amplitude chain) rather than a field-shape error.`
                  : `No variant materially isolates the residual error to a single field, scale, or frequency band — the ~6.77 dB RMS gap is likely distributed across multiple contributing effects (direct amplitude convention, reflection coherence weighting, and residual modal normalisation) rather than one dominant cause.`}<br/><br/>
          <b>SEVERITY:</b> {verdictNumber === 5 ? "INFORMATIONAL — no single dominant cause found; further multi-factor investigation required" : "HIGH — isolated dominant residual error source identified, ready for targeted correction"}<br/><br/>
          <b>NEXT FIX CANDIDATE:</b> {verdictNumber === 1
            ? "Review direct-path amplitude convention (rewBassEngine.js lines 969–971) for a missing 4π or distance-reference scaling error."
            : verdictNumber === 2
              ? "Review reflection-path gain (imageSource.reflectionCoefficient and reflectionCoherenceWeight, rewBassEngine.js lines 1029–1053) for an over-strength reflection contribution."
              : verdictNumber === 3
                ? "Review the sub-Schroeder image-source/coherence-weighting model (reflectionCoherenceWeight formula, rewBassEngine.js lines 1049–1051) — it may be over-contributing energy below 80 Hz relative to REW's measured low-frequency behaviour."
                : verdictNumber === 4
                  ? "Review the global source SPL reference (curveDb=94 flat curve / interpolateCurveDb, rewBassEngine.js lines 953, 970) for a single calibration constant applied uniformly across direct+reflection+modal paths."
                  : "Run a joint two-factor sweep (direct scale × reflection scale) instead of single-factor isolation, since no single-variable test isolated a dominant cause."}
        </div>
      </div>
    </div>
  );
}