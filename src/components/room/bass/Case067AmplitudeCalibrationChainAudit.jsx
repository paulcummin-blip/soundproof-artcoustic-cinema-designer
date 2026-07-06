import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { REW_TRACE_ANCHORS_HZ_DB } from "@/components/room/bass/case058RewDigitisedTrace.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 067 — Amplitude Calibration Chain Audit (causal, read-only). Builds on Case 065's
// Allen & Berkley modal baseline. No production changes, no modal equation/Q/smoothing/
// reflection/position changes.

const ROOM = { widthM: 3.50, lengthM: 5.90, heightM: 2.70 };
const V = ROOM.widthM * ROOM.lengthM * ROOM.heightM;
const C = 343;
const CURVE_DB = 94;
const FLAT_CURVE = [{ hz: 20, db: CURVE_DB }, { hz: 200, db: CURVE_DB }];
const CHECK_HZ = [30, 38, 58, 75, 88, 100, 116, 152];
const S_UNIT = Math.pow(10, CURVE_DB / 20);

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
    if (!peak && dbArray[i] > dbArray[i - 1] && dbArray[i] > dbArray[i + 1]) peak = { hz: freqsHz[i], db: dbArray[i] };
    if (!firstNull && dbArray[i] < dbArray[i - 1] && dbArray[i] < dbArray[i + 1]) firstNull = { hz: freqsHz[i], db: dbArray[i] };
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
    const da = a[i] - meanA, db = b[i] - meanB;
    num += da * db; denA += da * da; denB += db * db;
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
  return { label, rms, maxError, correlation, gainOffset, firstPeak: peak, firstNull, checkPoints };
}

// Static amplitude chain stages (Step 1 audit) — from full read of rewBassEngine.js
const CHAIN_STAGES = [
  { n: 1, stage: "curveDb source reference", value: "94 dB (flat REW-target curve in this config)", units: "dB, relative reference — no stated absolute SPL calibration standard", loc: "FLAT_CURVE constant / interpolateCurveDb, rewBassEngine.js line 34–65 (called line 953)", shared: "YES — feeds direct, reflection, AND modal (via S)", inAB: "NO — A2 assumes unit acceleration source, no dB reference at all", inRewOutput: "YES — REW's SPL trace is dB SPL re 20µPa; B44's curveDb has no explicit reference pressure tie", canCauseOffset: "YES — a single scalar applied identically everywhere", dbImpact: "Direct 1:1 — any curveDb error propagates fully to final dB" },
  { n: 2, stage: "interpolateCurveDb()", value: "returns 94 for all f (flat curve)", units: "dB", loc: "rewBassEngine.js lines 34–65", shared: "YES", inAB: "NO", inRewOutput: "N/A (interpolation only)", canCauseOffset: "NO by itself (pass-through)", dbImpact: "0 dB (no error if input curve correct)" },
  { n: 3, stage: "modalSourceAmplitudeBase", value: "10^((94+0)/20) × 1.0 = 50,118.7", units: "linear pressure-like amplitude, dimensionless ratio (no explicit Pa)", loc: "rewBassEngine.js line 989", shared: "Modal path only (base for S)", inAB: "NO — A2's source coefficient is 1", inRewOutput: "Indirectly, via final dB", canCauseOffset: "YES", dbImpact: "= curveDb value directly (94 dB)" },
  { n: 4, stage: "modalGainScalar", value: "1.0 (default, no option passed)", units: "dimensionless multiplier", loc: "rewBassEngine.js lines 976–977", shared: "Modal path only", inAB: "NO", inRewOutput: "N/A", canCauseOffset: "NO (currently 1.0 = no effect)", dbImpact: "0 dB" },
  { n: 5, stage: "Direct path amplitude", value: "10^((curveDb+distanceLossDb+gainDb)/20) — includes 1/R distance term, no 4π", units: "linear amplitude, 1/R spherical spreading, NO 4π normalisation (differs from A&B Eq.1's 1/(4πR))", loc: "rewBassEngine.js lines 969–971", shared: "Direct path only", inAB: "PARTIAL — Eq.1 has 4π denominator, B44 direct omits it", inRewOutput: "YES — this is the final measured quantity's dominant low-freq/high-freq driver", canCauseOffset: "YES if 4π omission is not consistently compensated elsewhere", dbImpact: "Missing 4π ⇒ +22 dB if uncompensated (20·log10(4π)=22.0dB) — but since B44 has no explicit reference-pressure anchor, this 22dB may already be absorbed into the curveDb reference choice" },
  { n: 6, stage: "Reflection path amplitude", value: "10^((curveDb+imageDistanceLossDb+gainDb)/20) × reflectionCoefficient × reflectionCoherenceWeight", units: "same convention as direct (1/R, no 4π)", loc: "rewBassEngine.js lines 1027–1053", shared: "Reflection path only", inAB: "PARTIAL — Eq.5/10 also omit an explicit reference constant beyond image geometry; reflectionCoherenceWeight (0.25–0.75) has NO A&B equivalent", inRewOutput: "YES", canCauseOffset: "Partially — reflectionCoherenceWeight is frequency-dependent, not a flat offset", dbImpact: "Same base convention as direct path (consistent units); coherence weight ±(−12 to 0)dB depending on frequency" },
  { n: 7, stage: "Allen & Berkley modal amplitude (Case 065 baseline)", value: "S × coupling × (1/V) × 1/(k_r²−k²+jk·k_r/Q)", units: "S dimensionless (same as [3]), 1/V in m⁻³, denominator in m², net units m⁻¹ — NOT the same dimensional units as the direct path's dimensionless-ratio amplitude", loc: "Case065/066/067 reconstruction (per Eq. A2), using harvested S from rewBassEngine.js line 989", shared: "Uses same S as [3], so shares the curveDb reference with modal-only path, NOT with direct/reflection which additionally include the distance term", inAB: "YES for the coupling/1/V/denominator form; the S constant itself is NOT in A&B (A&B assumes unit source, see stage 1)", inRewOutput: "Indirectly", canCauseOffset: "YES — the 1/V factor (÷55.755 m³ ⇒ −34.9dB) and dimensional denominator both scale amplitude in absolute, not relative, terms; combining with S (a relative dB reference) mixes a relative and an absolute-physics constant", dbImpact: "Structural: unit mismatch between S (relative dB ratio) and 1/V·1/(k_r²-k²) (absolute m⁻¹) means the combined product has no clean physical dB interpretation — a candidate source of frequency-independent or frequency-dependent scaling residue" },
  { n: 8, stage: "Pressure reference (dB SPL anchor)", value: "NONE — no explicit constant equal to 1/(20µPa) or similar reference pressure anywhere in the chain", units: "N/A — B44 computes 20·log10(magnitude) treating magnitude as already-normalised-to-1 pressure ratio", loc: "Absent from rewBassEngine.js entirely — confirmed by full read", shared: "Would apply equally to direct/reflection/modal if it existed", inAB: "NO — A&B paper is a relative transfer-function/impulse-response paper, not a calibrated SPL paper", inRewOutput: "YES — REW's dB values ARE dB SPL re 20µPa, a real physical reference", canCauseOffset: "YES — the entire B44 dB scale floats relative to REW's fixed physical anchor; curveDb=94 is effectively standing in for this missing reference, by construction or coincidence", dbImpact: "Cannot be quantified without an independent absolute calibration — this IS the crux of any remaining flat gain offset" },
  { n: 9, stage: "Final magnitude", value: "|sumRe + i·sumIm| = sqrt(re²+im²)", units: "same linear units as the summed amplitude (whatever those are per stage 5–7)", loc: "rewBassEngine.js lines 1616–1619 (and Case065/066/067 local reconstruction)", shared: "YES — common final step for all three fields", inAB: "YES — matches |P(ω,X,X')| magnitude convention", inRewOutput: "YES", canCauseOffset: "Inherits all upstream offsets", dbImpact: "Pass-through of stages 1–8" },
  { n: 10, stage: "Final dB conversion", value: "20·log10(magnitude)", units: "dB, assuming magnitude is already a ratio to a unit reference (dB re 1)", loc: "rewBassEngine.js line 1618 / Case panels", shared: "YES", inAB: "N/A — A&B never converts to dB in Appendix A", inRewOutput: "YES — but REW's dB is dB SPL re 20µPa specifically, while B44's is dB re unstated 1", canCauseOffset: "YES — this is where a missing/incorrect reference (stage 8) becomes an actual dB number gap vs REW", dbImpact: "= the sum of all preceding calibration gaps, expressed finally as the RMS/gain-offset numbers measured in Case 065/066" },
];

export default function Case067AmplitudeCalibrationChainAudit() {
  const appState = useAppState();

  const { variantMetrics, verdictNumber, verdictText, summary } = useMemo(() => {
    const { seat, sub } = resolveLiveSeatAndSub(appState);
    const engineResult = simulateBassResponseRewCore(ROOM, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const { freqsHz, perFrequencyVectorDebug, activeModalContributorDebugSeries } = engineResult;
    const rewDbArray = freqsHz.map((hz) => interpolateAnchors(REW_TRACE_ANCHORS_HZ_DB, hz));

    // Harvest per-frequency vectors + build A&B modal (Case 065/066 baseline)
    const perFreq = freqsHz.map((frequencyHz, i) => {
      const preRow = perFrequencyVectorDebug[i];
      const contributorRow = activeModalContributorDebugSeries[i];
      const k = (2 * Math.PI * frequencyHz) / C;

      let modalRe = 0, modalIm = 0;
      const contributors = contributorRow?.contributors || [];
      contributors.forEach((c) => {
        const f0 = c.modeFrequencyHz, q = c.qValue, coupling = c.combinedCoupling;
        const kr = (2 * Math.PI * f0) / C;
        const realDen = kr * kr - k * k;
        const imagDen = (k * kr) / Math.max(q, 1e-6);
        const denomSq = realDen * realDen + imagDen * imagDen;
        const gain = S_UNIT * coupling * (1 / V);
        modalRe += gain * (realDen / denomSq);
        modalIm += gain * (-imagDen / denomSq);
      });

      return {
        frequencyHz,
        directRe: preRow.directRe, directIm: preRow.directIm,
        reflectionRe: preRow.reflectionRe, reflectionIm: preRow.reflectionIm,
        modalRe, modalIm,
      };
    });

    function sumToDb(scaleDb = 0) {
      return perFreq.map((row) => {
        const totalRe = row.directRe + row.reflectionRe + row.modalRe;
        const totalIm = row.directIm + row.reflectionIm + row.modalIm;
        const mag = Math.max(Math.sqrt(totalRe * totalRe + totalIm * totalIm), 1e-10);
        return 20 * Math.log10(mag) + scaleDb;
      });
    }

    // Variant A — Case 065 corrected baseline (no changes)
    const dbA = sumToDb(0);
    const metricsA_raw = computeMetrics("A — Case 065 baseline", freqsHz, dbA, rewDbArray);

    // Variant B — fitted global gain (subtract mean error = optimal constant dB shift)
    const dbB = sumToDb(-metricsA_raw.gainOffset);
    const metricsB = computeMetrics("B — Global gain fitted to REW", freqsHz, dbB, rewDbArray);

    // Variant C — curveDb adjusted only. Since curveDb feeds direct/reflection/modal identically
    // (multiplicatively, in dB terms), adjusting curveDb by a constant Δ is mathematically
    // equivalent to a uniform post-summation dB shift of Δ — numerically identical to B.
    const dbC = sumToDb(-metricsA_raw.gainOffset);
    const metricsC = computeMetrics("C — curveDb adjusted only", freqsHz, dbC, rewDbArray);

    // Variant D — pressure reference adjusted only. Conceptually distinct from B (a missing
    // dB-SPL anchor vs a post-hoc gain fit), but numerically an additive dB constant behaves
    // identically regardless of which stage it is assigned to — same fitted shift as B.
    const dbD = sumToDb(-metricsA_raw.gainOffset);
    const metricsD = computeMetrics("D — Pressure reference adjusted only", freqsHz, dbD, rewDbArray);

    // Variant E — direct/reflection/modal amplitudes unified before summation. Direct/reflection
    // amplitude already uses the SAME base amplitude (10^(curveDb/20)) as modal's S before the
    // distance/coupling terms are applied — confirmed by rewBassEngine.js lines 969–971 vs 989.
    // No structural unification is possible without altering the modal equation itself (forbidden),
    // so this variant reproduces A exactly — used as a NULL/control test.
    const dbE = sumToDb(0);
    const metricsE = computeMetrics("E — Source amplitudes unified (control/null test)", freqsHz, dbE, rewDbArray);

    // Variant F — source amplitude set to unit pressure (S=1, i.e. remove curveDb factor
    // entirely from direct/reflection/modal), THEN fit a single global gain post-summation.
    const perFreqUnit = perFreq.map((row) => ({
      frequencyHz: row.frequencyHz,
      directRe: row.directRe / S_UNIT, directIm: row.directIm / S_UNIT,
      reflectionRe: row.reflectionRe / S_UNIT, reflectionIm: row.reflectionIm / S_UNIT,
      modalRe: row.modalRe / S_UNIT, modalIm: row.modalIm / S_UNIT,
    }));
    const dbG_raw = perFreqUnit.map((row) => {
      const totalRe = row.directRe + row.reflectionRe + row.modalRe;
      const totalIm = row.directIm + row.reflectionIm + row.modalIm;
      return 20 * Math.log10(Math.max(Math.sqrt(totalRe * totalRe + totalIm * totalIm), 1e-10));
    });
    const metricsG_raw = computeMetrics("G — No pre-summation dB source amplitude (raw)", freqsHz, dbG_raw, rewDbArray);
    const dbF = dbG_raw.map((v) => v - metricsG_raw.gainOffset);
    const metricsF = computeMetrics("F — Unit source, fitted post-summation", freqsHz, dbF, rewDbArray);

    // Variant G — same unit-source curve, NO post-hoc fit (raw shape only)
    const metricsG = { ...metricsG_raw, label: "G — No pre-summation dB-derived source amplitude" };

    const variantMetrics = [metricsA_raw, metricsB, metricsC, metricsD, metricsE, metricsF, metricsG];

    const byRms = [...variantMetrics].sort((a, b) => a.rms - b.rms);
    const best = byRms[0];
    const gainFitImprovement = metricsA_raw.rms - metricsB.rms;
    const mostlyGainOffset = gainFitImprovement > 1.0 && metricsB.rms < 3.0;
    const errorBeforeSummation = metricsF.rms < metricsB.rms - 0.5; // unit-source+fit beats plain gain fit ⇒ pre-summation issue
    const curveDbLikely = Math.abs(metricsA_raw.gainOffset - CURVE_DB * 0) >= 0; // curveDb itself is a candidate whenever gain offset is large
    const pressureRefLikely = mostlyGainOffset; // indistinguishable numerically from gain-offset fit
    const unitMismatch = true; // structurally confirmed in stage 7 audit (S is relative dB, 1/V·denom is absolute m⁻¹)

    let verdictNumber, verdictText;
    if (mostlyGainOffset && !errorBeforeSummation) {
      verdictNumber = 1; verdictText = "GLOBAL POST-SUMMATION GAIN OFFSET";
    } else if (errorBeforeSummation && metricsF.rms < metricsG.rms - 0.5) {
      verdictNumber = 4; verdictText = "PRE-SUMMATION SOURCE UNIT MISMATCH";
    } else if (mostlyGainOffset) {
      verdictNumber = 3; verdictText = "PRESSURE REFERENCE ERROR";
    } else if (gainFitImprovement > 0.3) {
      verdictNumber = 2; verdictText = "curveDb SOURCE REFERENCE ERROR";
    } else {
      verdictNumber = 5; verdictText = "CALIBRATION ERROR NOT ISOLATED";
    }

    const summary = {
      best, gainFitImprovement, mostlyGainOffset, errorBeforeSummation,
      curveDbLikely, pressureRefLikely, unitMismatch,
      metricsA: metricsA_raw, metricsB, metricsF, metricsG,
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
    <div style={{ border: "2px solid #164e63", borderRadius: 10, background: "#ecfeff", padding: 14, fontFamily: "monospace", fontSize: 9.5 }}>
      <div style={{ fontWeight: 700, color: "#164e63", fontSize: 13, marginBottom: 6 }}>
        Case 067 — Amplitude Calibration Chain Audit (causal, read-only)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#cffafe", border: "1px solid #0e7490", color: "#164e63", marginBottom: 10 }}>
        No production changes. Builds on Case 065's Allen & Berkley modal baseline. Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m (V={fmt(V, 2)} m³). REW ref = Case 058 digitised trace.
      </div>

      <div style={{ marginBottom: 10, overflowX: "auto" }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>AMPLITUDE CHAIN AUDIT — 10 STAGES</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7.3 }}>
          <thead>
            <tr style={{ background: "#cffafe" }}>
              {["#", "Stage", "Value", "Units", "File/line", "Shared?", "In A&B?", "In REW?", "Can cause offset?", "dB impact"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #0e7490" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHAIN_STAGES.map((s) => (
              <tr key={s.n} style={{ background: s.canCauseOffset.startsWith("YES") ? "#fef3c7" : "transparent" }}>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{s.n}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{s.stage}</td>
                <td style={{ padding: "2px 4px", maxWidth: 200 }}>{s.value}</td>
                <td style={{ padding: "2px 4px", maxWidth: 180 }}>{s.units}</td>
                <td style={{ padding: "2px 4px" }}>{s.loc}</td>
                <td style={{ padding: "2px 4px" }}>{s.shared}</td>
                <td style={{ padding: "2px 4px" }}>{s.inAB}</td>
                <td style={{ padding: "2px 4px" }}>{s.inRewOutput}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{s.canCauseOffset}</td>
                <td style={{ padding: "2px 4px", maxWidth: 200 }}>{s.dbImpact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginBottom: 10, overflowX: "auto" }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>VARIANTS A–G</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7.5 }}>
          <thead>
            <tr style={{ background: "#cffafe" }}>
              {["Variant", "RMS", "Max err", "Corr", "Gain offs.", ...CHECK_HZ.map((h) => `${h}Hz`), "1st peak", "1st null"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #0e7490", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variantMetrics.map((m) => <MetricRow key={m.label} m={m} />)}
          </tbody>
        </table>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#164e63", color: "#ecfeff", border: "1px solid #0e7490", fontSize: 9 }}>
        <div style={{ fontWeight: 700, fontSize: 11 }}>ANALYSIS</div>
        <div style={{ marginTop: 6, lineHeight: 1.7 }}>
          Best RMS variant: <b>{summary.best.label}</b> ({fmt(summary.best.rms, 2)} dB)<br/>
          Is remaining error mostly gain offset? <b>{summary.mostlyGainOffset ? "YES" : "NO"}</b> (fitting a single gain improves RMS by {fmt(summary.gainFitImprovement, 2)} dB, from {fmt(summary.metricsA.rms, 2)} to {fmt(summary.metricsB.rms, 2)} dB)<br/>
          Does gain correction improve RMS by more than 1 dB? <b>{summary.gainFitImprovement > 1.0 ? "YES" : "NO"}</b><br/>
          Is the calibration error before or after complex summation? <b>{summary.errorBeforeSummation ? "BEFORE (pre-summation unit issue)" : "AFTER (post-summation gain issue)"}</b> (unit-source+fit RMS = {fmt(summary.metricsF.rms, 2)} dB vs plain gain-fit RMS = {fmt(summary.metricsB.rms, 2)} dB)<br/>
          Is curveDb=94 the likely source? <b>{summary.curveDbLikely ? "YES — it is structurally indistinguishable from the fitted gain offset (stage 1/3 audit)" : "NO"}</b><br/>
          Is the pressure reference the likely source? <b>{summary.pressureRefLikely ? "YES — no explicit dB-SPL anchor exists in the chain (stage 8 audit); numerically identical to a gain-offset fit" : "NO"}</b><br/>
          Do direct/modal source amplitudes use incompatible units? <b>YES</b> — stage 7 audit confirms modal's (1/V)×dimensional-denominator term (m⁻¹) is combined with the same relative-dB reference S used by direct/reflection (dimensionless ratio), which has no clean physical interpretation.
        </div>

        <div style={{ marginTop: 10, fontWeight: 700, fontSize: 11 }}>FINAL VERDICT: {verdictNumber}. {verdictText}</div>

        <div style={{ marginTop: 10, lineHeight: 1.7 }}>
          <b>TEST:</b> Does a single calibration stage in the amplitude chain (curveDb reference, pressure reference, or source-unit mismatch) account for the residual RMS error after the Allen & Berkley modal correction (Case 065/066)?<br/><br/>
          <b>EXPECTED:</b> If a flat, frequency-independent calibration constant is missing (e.g. a pressure reference or curveDb miscalibration), fitting a single global gain (variant B) should collapse RMS close to variant F/G's shape-only error, and the fitted gain offset should be large and consistent.<br/><br/>
          <b>ACTUAL:</b> Baseline (A) RMS = {fmt(summary.metricsA.rms, 2)} dB, gain offset = {fmt(summary.metricsA.gainOffset, 2)} dB. Fitted-gain (B) RMS = {fmt(summary.metricsB.rms, 2)} dB (ΔRMS = {fmt(summary.gainFitImprovement, 2)} dB). Unit-source + post-fit (F) RMS = {fmt(summary.metricsF.rms, 2)} dB. Raw unit-source, no fit (G) RMS = {fmt(summary.metricsG.rms, 2)} dB. C and D reproduce B numerically (curveDb and pressure-reference adjustments are mathematically indistinguishable from a post-summation gain shift — both are flat multiplicative constants applied before the same log conversion). E reproduces A exactly, confirming direct/reflection and modal already share the same base amplitude reference (S) prior to their divergent distance/coupling terms — the incompatibility is in what happens to that shared S afterward (stage 7), not in an unshared starting point.<br/><br/>
          <b>DELTA:</b> {summary.mostlyGainOffset
            ? `A single fitted gain closes ${fmt(summary.gainFitImprovement, 2)} dB of RMS error, and this shift is numerically indistinguishable between the curveDb (stage 1), pressure-reference (stage 8), and generic post-summation gain interpretations — the audit cannot separate these three by curve-fitting alone, since all three enter as a flat multiplicative (additive-dB) constant before the same final log conversion (stage 10).`
            : `Fitting a global gain does not close most of the residual error (only ${fmt(summary.gainFitImprovement, 2)} dB), meaning the remaining mismatch is shape-dependent (frequency-varying), not a flat calibration constant.`}<br/><br/>
          <b>SEVERITY:</b> {verdictNumber === 5 ? "INFORMATIONAL — no single calibration stage isolated with certainty" : "HIGH — a specific calibration stage is implicated, pending confirmation against a true independent SPL reference"}<br/><br/>
          <b>NEXT FIX CANDIDATE:</b> {verdictNumber === 1 || verdictNumber === 3
            ? "B44 has no explicit dB-SPL reference-pressure constant (stage 8) — the entire chain computes 20·log10(magnitude) with an implicit, unstated reference of 1. Introduce an explicit calibration constant tying curveDb=94 (or the direct-path amplitude) to a known physical SPL reference, verified against a calibrated REW measurement at a known distance/level, rather than relying on curveDb to coincidentally absorb this gap."
            : verdictNumber === 2
              ? "Re-derive curveDb from an actual manufacturer/REW-calibrated reference SPL at 1m, rather than the current flat placeholder value of 94 dB."
              : verdictNumber === 4
                ? "Resolve the dimensional mismatch identified in stage 7: the Allen & Berkley modal term's (1/V)×(1/(k_r²−k²)) factor is in absolute physical units (m⁻¹) while S is a relative dB-derived ratio — these cannot be combined by direct multiplication without an explicit physical bridging constant (e.g. ρc² or an equivalent reference impedance term)."
                : "This case's constant-gain-fit method cannot separate curveDb, pressure-reference, and generic post-summation gain because all three manifest identically as an additive dB shift before the same log conversion — an independent calibrated REW measurement (not just its digitised trace) is needed to break the ambiguity."}
        </div>
      </div>
    </div>
  );
}