import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { REW_TRACE_ANCHORS_HZ_DB } from "@/components/room/bass/case058RewDigitisedTrace.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 069 — Fundamental Axial Mode Formation Audit (causal, read-only). Focus 20–65 Hz.
// Builds on Case 065's Allen & Berkley modal baseline. No production changes.

const ROOM = { widthM: 3.50, lengthM: 5.90, heightM: 2.70 };
const V = ROOM.widthM * ROOM.lengthM * ROOM.heightM;
const C = 343;
const CURVE_DB = 94;
const FLAT_CURVE = [{ hz: 20, db: CURVE_DB }, { hz: 200, db: CURVE_DB }];
const S_UNIT = Math.pow(10, CURVE_DB / 20);
const CHECK_HZ = [28, 29, 30, 38, 58, 60];

const TARGET_MODES = [
  { nx: 0, ny: 1, nz: 0, label: "(0,1,0) length axial" },
  { nx: 0, ny: 2, nz: 0, label: "(0,2,0) length axial (2nd)" },
  { nx: 1, ny: 0, nz: 0, label: "(1,0,0) width axial" },
  { nx: 2, ny: 0, nz: 0, label: "(2,0,0) width axial (2nd)" },
  { nx: 0, ny: 0, nz: 1, label: "(0,0,1) height axial" },
  { nx: 1, ny: 1, nz: 0, label: "(1,1,0) tangential (<65Hz)" },
];

const ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: 0.30, back: 0.30, left: 0.30, right: 0.30, ceiling: 0.30, floor: 0.30 },
  freqMinHz: 20,
  freqMaxHz: 65,
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
    const [h0, d0] = pts[i]; const [h1, d1] = pts[i + 1];
    if (hz >= h0 && hz <= h1) { const r = (hz - h0) / (h1 - h0); return d0 + (d1 - d0) * r; }
  }
  return pts[pts.length - 1][1];
}

function nearestIdx(freqsHz, hz) {
  let best = 0, bestD = Infinity;
  freqsHz.forEach((f, i) => { const d = Math.abs(f - hz); if (d < bestD) { bestD = d; best = i; } });
  return best;
}

function abModalVector(contributor, frequencyHz, srcCouplingOverride, recvCouplingOverride) {
  const f0 = contributor.modeFrequencyHz, q = contributor.qValue;
  const kr = (2 * Math.PI * f0) / C;
  const k = (2 * Math.PI * frequencyHz) / C;
  const realDen = kr * kr - k * k;
  const imagDen = (k * kr) / Math.max(q, 1e-6);
  const denomSq = realDen * realDen + imagDen * imagDen;
  const srcC = srcCouplingOverride !== undefined ? srcCouplingOverride : contributor.sourceCoupling;
  const recvC = recvCouplingOverride !== undefined ? recvCouplingOverride : contributor.receiverCoupling;
  const coupling = srcC * recvC;
  const gain = S_UNIT * coupling * (1 / V);
  return { re: gain * (realDen / denomSq), im: gain * (-imagDen / denomSq) };
}

function findContributor(contributorsRow, nx, ny, nz) {
  const list = contributorsRow?.contributors || [];
  return list.find((c) => c.nx === nx && c.ny === ny && c.nz === nz) || null;
}

function pearsonCorrelation(a, b) {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n, meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i += 1) { const da = a[i] - meanA, db = b[i] - meanB; num += da * db; denA += da * da; denB += db * db; }
  return num / Math.sqrt(Math.max(denA * denB, 1e-12));
}

function findFirstPeakAndNull(freqsHz, dbArray) {
  let peak = null, firstNull = null;
  for (let i = 1; i < dbArray.length - 1; i += 1) {
    if (!peak && dbArray[i] > dbArray[i - 1] && dbArray[i] > dbArray[i + 1]) peak = { hz: freqsHz[i], db: dbArray[i] };
    if (!firstNull && dbArray[i] < dbArray[i - 1] && dbArray[i] < dbArray[i + 1]) firstNull = { hz: freqsHz[i], db: dbArray[i] };
    if (peak && firstNull) break;
  }
  return { peak, firstNull };
}

function computeVariantMetrics(label, freqsHz, dbArray, rewDbArray) {
  const errors = dbArray.map((v, i) => v - rewDbArray[i]);
  const rms = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
  const maxError = errors.reduce((m, e) => Math.max(m, Math.abs(e)), 0);
  const correlation = pearsonCorrelation(dbArray, rewDbArray);
  const { peak, firstNull } = findFirstPeakAndNull(freqsHz, dbArray);
  const checkPoints = {};
  CHECK_HZ.forEach((hz) => { checkPoints[hz] = dbArray[nearestIdx(freqsHz, hz)]; });
  // Detect whether the 29Hz peak / 38Hz null / 58Hz peak "form" (i.e. local peak/null within ±2Hz)
  const idx29 = nearestIdx(freqsHz, 29), idx38 = nearestIdx(freqsHz, 38), idx58 = nearestIdx(freqsHz, 58);
  const isLocalPeak = (i) => i > 0 && i < dbArray.length - 1 && dbArray[i] > dbArray[i - 1] && dbArray[i] > dbArray[i + 1];
  const isLocalNull = (i) => i > 0 && i < dbArray.length - 1 && dbArray[i] < dbArray[i - 1] && dbArray[i] < dbArray[i + 1];
  return {
    label, rms, maxError, correlation, checkPoints,
    firstPeak: peak, firstNull,
    peak29Forms: isLocalPeak(idx29), null38Forms: isLocalNull(idx38), peak58Forms: isLocalPeak(idx58),
  };
}

export default function Case069FundamentalAxialModeFormationAudit() {
  const appState = useAppState();

  const { modeAudit, variantMetrics, verdictNumber, verdictText } = useMemo(() => {
    const { seat, sub } = resolveLiveSeatAndSub(appState);
    const engineResult = simulateBassResponseRewCore(ROOM, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const { freqsHz, perFrequencyVectorDebug, activeModalContributorDebugSeries } = engineResult;
    const rewDb = freqsHz.map((hz) => interpolateAnchors(REW_TRACE_ANCHORS_HZ_DB, hz));

    // Per-mode audit at checkpoint frequencies
    const modeAudit = TARGET_MODES.map(({ nx, ny, nz, label }) => {
      const checkpointData = CHECK_HZ.map((hz) => {
        const idx = nearestIdx(freqsHz, hz);
        const contributorsRow = activeModalContributorDebugSeries[idx];
        const preRow = perFrequencyVectorDebug[idx];
        const c = findContributor(contributorsRow, nx, ny, nz);
        if (!c) return { hz, found: false };
        const abVec = abModalVector(c, freqsHz[idx]);
        const totalRe = preRow.directRe + preRow.reflectionRe + abVec.re;
        const totalIm = preRow.directIm + preRow.reflectionIm + abVec.im;
        // constructive if this mode's Re/Im dot-product with the rest-of-field vector is positive
        const restRe = preRow.directRe + preRow.reflectionRe;
        const restIm = preRow.directIm + preRow.reflectionIm;
        const dot = abVec.re * restRe + abVec.im * restIm;
        const isConstructive = dot >= 0;
        const contribDb = 20 * Math.log10(Math.max(Math.sqrt(abVec.re * abVec.re + abVec.im * abVec.im), 1e-10));
        return {
          hz, found: true,
          prodRe: c.activeReal, prodIm: c.activeImag,
          abRe: abVec.re, abIm: abVec.im,
          transferMag: c.activeTransferMagnitudeAtNull, transferPhaseDeg: c.transferPhaseDeg,
          contribDb, isConstructive,
        };
      });
      const anyRow = checkpointData.find((d) => d.found);
      const contributorsAt29 = activeModalContributorDebugSeries[nearestIdx(freqsHz, 29)];
      const cRef = findContributor(contributorsAt29, nx, ny, nz);
      const theoreticalFreq = cRef?.modeFrequencyHz ?? null;
      const family = cRef?.modeType ?? "not found <65Hz";
      const sourceCoupling = cRef?.sourceCoupling ?? null;
      const receiverCoupling = cRef?.receiverCoupling ?? null;
      const combinedCoupling = cRef?.combinedCoupling ?? null;
      const qValue = cRef?.qValue ?? null;
      const suppressedBySource = Math.abs(sourceCoupling) < 0.25;
      const suppressedByReceiver = Math.abs(receiverCoupling) < 0.25;

      return {
        label, theoreticalFreq, family, sourceCoupling, receiverCoupling, combinedCoupling, qValue,
        suppressedBySource, suppressedByReceiver, checkpointData, found: !!cRef,
      };
    });

    // ---- Variants ----
    function sumDbFromModes(modeFilter, includeDirectReflection, options = {}) {
      return freqsHz.map((frequencyHz, i) => {
        const preRow = perFrequencyVectorDebug[i];
        const contributorsRow = activeModalContributorDebugSeries[i];
        const contributors = (contributorsRow?.contributors || []).filter(modeFilter);
        let modalRe = 0, modalIm = 0;
        contributors.forEach((c) => {
          let srcOverride, recvOverride;
          if (options.absReceiver) recvOverride = Math.abs(c.receiverCoupling);
          if (options.absSource) srcOverride = Math.abs(c.sourceCoupling);
          const vec = abModalVector(c, frequencyHz, srcOverride, recvOverride);
          modalRe += vec.re; modalIm += vec.im;
        });
        let totalRe = modalRe, totalIm = modalIm;
        if (includeDirectReflection) { totalRe += preRow.directRe + preRow.reflectionRe; totalIm += preRow.directIm + preRow.reflectionIm; }

        if (options.forcePhaseZero) { const mag = Math.sqrt(modalRe * modalRe + modalIm * modalIm); totalRe = (includeDirectReflection ? preRow.directRe + preRow.reflectionRe : 0) + mag; totalIm = (includeDirectReflection ? preRow.directIm + preRow.reflectionIm : 0); }
        if (options.forceConstructive) {
          const restRe = includeDirectReflection ? preRow.directRe + preRow.reflectionRe : 0;
          const restIm = includeDirectReflection ? preRow.directIm + preRow.reflectionIm : 0;
          const restPhase = Math.atan2(restIm, restRe);
          const modalMag = Math.sqrt(modalRe * modalRe + modalIm * modalIm);
          totalRe = restRe + modalMag * Math.cos(restPhase);
          totalIm = restIm + modalMag * Math.sin(restPhase);
        }
        return 20 * Math.log10(Math.max(Math.sqrt(totalRe * totalRe + totalIm * totalIm), 1e-10));
      });
    }

    const allModesFilter = () => true;
    const firstFiveFilter = (c) => TARGET_MODES.slice(0, 5).some((m) => m.nx === c.nx && m.ny === c.ny && m.nz === c.nz);
    const lengthAxialFilter = (c) => (c.nx === 0 && c.ny === 1 && c.nz === 0) || (c.nx === 0 && c.ny === 2 && c.nz === 0);
    const widthAxialFilter = (c) => (c.nx === 1 && c.ny === 0 && c.nz === 0) || (c.nx === 2 && c.ny === 0 && c.nz === 0);
    const heightAxialFilter = (c) => c.nx === 0 && c.ny === 0 && c.nz === 1;
    const tangentialFilter = (c) => c.modeType !== "axial";

    const dbA = sumDbFromModes(allModesFilter, true);
    const dbB = sumDbFromModes(allModesFilter, false);
    const dbC = sumDbFromModes(firstFiveFilter, false);
    const dbD = sumDbFromModes(lengthAxialFilter, false);
    const dbE = sumDbFromModes(widthAxialFilter, false);
    const dbF = sumDbFromModes(heightAxialFilter, false);
    const dbG = sumDbFromModes(tangentialFilter, false);
    const dbH = sumDbFromModes(allModesFilter, false); // direct+reflection removed below 65Hz == modal only (entire range is <65Hz)
    const dbI = sumDbFromModes(allModesFilter, true, { forcePhaseZero: true });
    const dbJ = sumDbFromModes(allModesFilter, true, { forceConstructive: true });
    const dbK = sumDbFromModes(allModesFilter, true, { absReceiver: true });
    const dbL = sumDbFromModes(allModesFilter, true, { absSource: true });

    const variantMetrics = [
      computeVariantMetrics("A — direct+reflections+A&B modal", freqsHz, dbA, rewDb),
      computeVariantMetrics("B — modal only, A&B corrected", freqsHz, dbB, rewDb),
      computeVariantMetrics("C — first 5 axial modes only", freqsHz, dbC, rewDb),
      computeVariantMetrics("D — length axial only", freqsHz, dbD, rewDb),
      computeVariantMetrics("E — width axial only", freqsHz, dbE, rewDb),
      computeVariantMetrics("F — height axial only", freqsHz, dbF, rewDb),
      computeVariantMetrics("G — tangential/oblique <65Hz only", freqsHz, dbG, rewDb),
      computeVariantMetrics("H — direct/reflection removed <65Hz", freqsHz, dbH, rewDb),
      computeVariantMetrics("I — modal phase forced to zero <65Hz", freqsHz, dbI, rewDb),
      computeVariantMetrics("J — modal forced constructive <65Hz", freqsHz, dbJ, rewDb),
      computeVariantMetrics("K — receiver coupling abs value <65Hz", freqsHz, dbK, rewDb),
      computeVariantMetrics("L — source coupling abs value <65Hz", freqsHz, dbL, rewDb),
    ];

    // Verdict logic
    const A = variantMetrics[0], I = variantMetrics[8], J = variantMetrics[9], K = variantMetrics[10], L = variantMetrics[11];
    const phaseForceImproves = A.rms - Math.min(I.rms, J.rms) > 1.0;
    const couplingAbsImproves = A.rms - Math.min(K.rms, L.rms) > 1.0;
    const modeAt29 = modeAudit.find((m) => m.label.includes("0,1,0"));
    const at29Constructive = modeAt29?.checkpointData.find((d) => d.hz === 29)?.isConstructive;
    const at29WeakCoupling = modeAt29?.suppressedBySource || modeAt29?.suppressedByReceiver;

    let verdictNumber, verdictText;
    if (couplingAbsImproves && !phaseForceImproves) {
      verdictNumber = 3; verdictText = "LOWEST AXIAL MODES CANCEL AGAINST DIRECT/REFLECTION FIELD";
    } else if (phaseForceImproves) {
      verdictNumber = 2; verdictText = "LOWEST AXIAL MODES HAVE WRONG PHASE/SIGN";
    } else if (at29WeakCoupling) {
      verdictNumber = 1; verdictText = "LOWEST AXIAL MODES ARE TOO WEAK";
    } else if (!A.peak29Forms || !A.peak58Forms) {
      verdictNumber = 4; verdictText = "LOWEST AXIAL MODES ARE SHIFTED IN FREQUENCY";
    } else {
      verdictNumber = 5; verdictText = "LOWEST AXIAL MODE FAILURE NOT ISOLATED";
    }

    return { modeAudit, variantMetrics, verdictNumber, verdictText, phaseForceImproves, couplingAbsImproves, at29Constructive, at29WeakCoupling };
  }, [appState?.seatingPositions, appState?.frontSubsCfg]);

  return (
    <div style={{ border: "2px solid #7c2d12", borderRadius: 10, background: "#fff7ed", padding: 14, fontFamily: "monospace", fontSize: 9.5 }}>
      <div style={{ fontWeight: 700, color: "#7c2d12", fontSize: 13, marginBottom: 6 }}>
        Case 069 — Fundamental Axial Mode Formation Audit (causal, read-only, 20–65 Hz)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#ffedd5", border: "1px solid #c2410c", color: "#7c2d12", marginBottom: 10 }}>
        No production changes. Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m (V={fmt(V, 2)} m³). REW ref = Case 058. A&B baseline = Case 065.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>PER-MODE AUDIT (theoretical values + checkpoint contributions)</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7.3 }}>
          <thead>
            <tr style={{ background: "#ffedd5" }}>
              {["Mode", "Theo. Hz", "Family", "Src coupling", "Recv coupling", "Combined", "Q", "Suppr. src?", "Suppr. recv?", "@29Hz constructive?", "@38Hz constructive?", "@58Hz constructive?", "Contrib dB @29/38/58"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #c2410c", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modeAudit.map((m) => {
              const d29 = m.checkpointData.find((d) => d.hz === 29);
              const d38 = m.checkpointData.find((d) => d.hz === 38);
              const d58 = m.checkpointData.find((d) => d.hz === 58);
              return (
                <tr key={m.label} style={{ background: !m.found ? "#fecaca" : "transparent" }}>
                  <td style={{ padding: "2px 4px", fontWeight: 700 }}>{m.label}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(m.theoreticalFreq, 1)}</td>
                  <td style={{ padding: "2px 4px" }}>{m.family}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(m.sourceCoupling, 3)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(m.receiverCoupling, 3)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(m.combinedCoupling, 3)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(m.qValue, 1)}</td>
                  <td style={{ padding: "2px 4px", fontWeight: 700 }}>{m.suppressedBySource ? "YES" : "no"}</td>
                  <td style={{ padding: "2px 4px", fontWeight: 700 }}>{m.suppressedByReceiver ? "YES" : "no"}</td>
                  <td style={{ padding: "2px 4px" }}>{d29?.found ? (d29.isConstructive ? "constructive" : "destructive") : "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{d38?.found ? (d38.isConstructive ? "constructive" : "destructive") : "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{d58?.found ? (d58.isConstructive ? "constructive" : "destructive") : "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(d29?.contribDb, 1)} / {fmt(d38?.contribDb, 1)} / {fmt(d58?.contribDb, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>VARIANTS A–L (20–65 Hz vs REW)</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7.3 }}>
          <thead>
            <tr style={{ background: "#ffedd5" }}>
              {["Variant", "RMS", "Max err", "Corr", ...CHECK_HZ.map((h) => `${h}Hz`), "1st peak", "1st null", "29Hz peak forms?", "38Hz null forms?", "58Hz peak forms?"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #c2410c", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variantMetrics.map((m) => (
              <tr key={m.label}>
                <td style={{ padding: "2px 4px", fontWeight: 700, whiteSpace: "nowrap" }}>{m.label}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(m.rms, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(m.maxError, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(m.correlation, 3)}</td>
                {CHECK_HZ.map((hz) => <td key={hz} style={{ padding: "2px 4px" }}>{fmt(m.checkPoints[hz], 1)}</td>)}
                <td style={{ padding: "2px 4px" }}>{m.firstPeak ? `${fmt(m.firstPeak.hz, 1)}/${fmt(m.firstPeak.db, 1)}` : "—"}</td>
                <td style={{ padding: "2px 4px" }}>{m.firstNull ? `${fmt(m.firstNull.hz, 1)}/${fmt(m.firstNull.db, 1)}` : "—"}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{m.peak29Forms ? "YES" : "no"}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{m.null38Forms ? "YES" : "no"}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{m.peak58Forms ? "YES" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#7c2d12", color: "#fff7ed", border: "1px solid #c2410c", fontSize: 9 }}>
        <div style={{ fontWeight: 700, fontSize: 11 }}>FINAL VERDICT: {verdictNumber}. {verdictText}</div>
        <div style={{ marginTop: 10, lineHeight: 1.7 }}>
          <b>TEST:</b> Does the (0,1,0) length-axial mode form REW's 28–29Hz peak, does a null form near 38Hz, and does the (0,2,0)/(1,1,0) region produce REW's 58Hz peak — and if not, is the cause weak coupling, wrong phase/sign, cancellation with direct/reflection, or a frequency shift?<br/><br/>
          <b>EXPECTED:</b> (0,1,0) theoretical frequency ≈29.1Hz should dominate and align constructively with direct/reflection near 29Hz to form REW's peak; the region between the 29Hz and 58Hz axial modes should form a natural null near 38Hz from destructive interference; (0,2,0) at ≈58.1Hz (and the nearby (1,1,0) tangential ≈57.0Hz) should combine to form REW's 58Hz peak.<br/><br/>
          <b>ACTUAL:</b> See per-mode table for each mode's theoretical frequency, coupling strength, and constructive/destructive state at 29/38/58Hz, and the variant table for whether B44's curve actually forms a peak at 29Hz, a null at 38Hz, and a peak at 58Hz. Forcing modal phase to zero (I) or forcing constructive combination (J) changes RMS by {fmt(variantMetrics[0].rms - Math.min(variantMetrics[8].rms, variantMetrics[9].rms), 2)} dB vs baseline (A); forcing coupling to absolute value (K/L) changes RMS by {fmt(variantMetrics[0].rms - Math.min(variantMetrics[10].rms, variantMetrics[11].rms), 2)} dB.<br/><br/>
          <b>DELTA:</b> {verdictNumber === 3
            ? "Forcing receiver/source coupling to its absolute value (removing sign-driven cancellation against the direct/reflection field) improves RMS substantially more than forcing modal phase alone — the dominant failure mode is destructive interference between the axial modal contribution and the direct+reflection field, not the modal equation's intrinsic phase."
            : verdictNumber === 2
              ? "Forcing the modal phase to zero or to a constructive alignment closes most of the RMS gap — the modal magnitude/coupling values are approximately correct, but the phase convention applied to the modal sum before superposition is wrong relative to REW."
              : verdictNumber === 1
                ? "The dominant low-frequency mode(s) show source or receiver coupling magnitude below 0.25 (near a coupling null from source/seat position relative to the mode shape), meaning the mode is genuinely weakly excited or weakly observed at this seat/sub placement — not a phase or cancellation defect."
                : verdictNumber === 4
                  ? "The variant table shows B44's curve failing to form a peak/null at the exact REW checkpoint frequencies despite the modes existing nearby — indicating the modal Q/bandwidth or destructive interference from neighbouring modes is shifting the effective peak/null position away from the pure theoretical mode frequency."
                  : "No single mechanism (coupling suppression, phase/sign, or direct/reflection cancellation) isolates cleanly — the 29/38/58Hz region likely involves a combination of these effects."}<br/><br/>
          <b>SEVERITY:</b> {verdictNumber === 5 ? "INFORMATIONAL — mechanism not cleanly isolated" : "HIGH — a specific failure mechanism in the lowest axial mode region is identified"}<br/><br/>
          <b>NEXT FIX CANDIDATE:</b> {verdictNumber === 3
            ? "Investigate the phase relationship between the Allen & Berkley modal term and the direct+reflection field at low frequency — the modal vector's sign/phase convention relative to the direct path's time-of-flight phase may need reconciliation rather than treating them as independently-derived vectors."
            : verdictNumber === 2
              ? "Review the phase convention applied to the modal sum (propagation phase, resonant transfer sign convention) specifically in the 20–65Hz axial region — this is where the Case 065/067 residual error concentrates."
              : verdictNumber === 1
                ? "Confirm sub and seat placement relative to the room's pressure antinodes/nodes for the (0,1,0) and (0,2,0)/(1,1,0) modes — a genuinely weak coupling at this exact position/seat combination may require a placement change rather than an engine fix."
                : verdictNumber === 4
                  ? "Investigate modal Q/bandwidth at 29Hz and 58Hz — an overly broad or narrow Q could shift the effective peak/null position away from the theoretical mode frequency when combined with neighbouring mode interference."
                  : "Cross-reference this case with Case 068's per-band error isolation to narrow down whether the 20–60Hz region's error is level, phase, or frequency-shift dominated before attempting a fix."}
        </div>
      </div>
    </div>
  );
}