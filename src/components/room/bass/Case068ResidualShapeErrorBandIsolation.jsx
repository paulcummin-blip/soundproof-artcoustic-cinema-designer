import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { REW_TRACE_ANCHORS_HZ_DB } from "@/components/room/bass/case058RewDigitisedTrace.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 068 — Residual Shape Error Band Isolation (causal, read-only). Builds on Case 065's
// Allen & Berkley modal baseline. Single variant A only. No production changes.

const ROOM = { widthM: 3.50, lengthM: 5.90, heightM: 2.70 };
const V = ROOM.widthM * ROOM.lengthM * ROOM.heightM;
const C = 343;
const CURVE_DB = 94;
const FLAT_CURVE = [{ hz: 20, db: CURVE_DB }, { hz: 200, db: CURVE_DB }];
const S_UNIT = Math.pow(10, CURVE_DB / 20);

const BANDS = [
  { label: "20–40 Hz", lo: 20, hi: 40 },
  { label: "40–60 Hz", lo: 40, hi: 60 },
  { label: "60–80 Hz", lo: 60, hi: 80 },
  { label: "80–120 Hz", lo: 80, hi: 120 },
  { label: "120–160 Hz", lo: 120, hi: 160 },
  { label: "160–200 Hz", lo: 160, hi: 200 },
];

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

function pearsonCorrelation(a, b) {
  const n = a.length;
  if (n < 2) return null;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - meanA, db = b[i] - meanB;
    num += da * db; denA += da * da; denB += db * db;
  }
  return num / Math.sqrt(Math.max(denA * denB, 1e-12));
}

// Classify a point as peak / null / shoulder / flat based on local neighbourhood shape
function classifyPoint(dbArray, i) {
  if (i <= 0 || i >= dbArray.length - 1) return "edge";
  const prev = dbArray[i - 1], cur = dbArray[i], next = dbArray[i + 1];
  if (cur > prev && cur > next) return "peak";
  if (cur < prev && cur < next) return "null";
  if (cur > prev && cur > next - 1) return "shoulder(rising)";
  if (cur < prev && cur < next + 1) return "shoulder(falling)";
  return "flat";
}

function nearestFeature(freqsHz, dbArray, targetIdx) {
  // Search outward from targetIdx for nearest peak or null
  for (let d = 0; d < 40; d += 1) {
    const iLeft = targetIdx - d;
    const iRight = targetIdx + d;
    if (iLeft >= 1 && iLeft < dbArray.length - 1) {
      const c = classifyPoint(dbArray, iLeft);
      if (c === "peak" || c === "null") return { hz: freqsHz[iLeft], type: c, distanceBins: d };
    }
    if (iRight >= 1 && iRight < dbArray.length - 1 && iRight !== iLeft) {
      const c = classifyPoint(dbArray, iRight);
      if (c === "peak" || c === "null") return { hz: freqsHz[iRight], type: c, distanceBins: d };
    }
  }
  return { hz: null, type: "none", distanceBins: null };
}

export default function Case068ResidualShapeErrorBandIsolation() {
  const appState = useAppState();

  const { bandResults, topErrors, verdictNumber, verdictText, lowBandRms, midBandRms, highBandRms, overallMeanErr } = useMemo(() => {
    const { seat, sub } = resolveLiveSeatAndSub(appState);
    const engineResult = simulateBassResponseRewCore(ROOM, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const { freqsHz, perFrequencyVectorDebug, activeModalContributorDebugSeries } = engineResult;

    // Build variant A: direct + reflections + Allen & Berkley modal
    const dbA = freqsHz.map((frequencyHz, i) => {
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

      const totalRe = preRow.directRe + preRow.reflectionRe + modalRe;
      const totalIm = preRow.directIm + preRow.reflectionIm + modalIm;
      return 20 * Math.log10(Math.max(Math.sqrt(totalRe * totalRe + totalIm * totalIm), 1e-10));
    });

    const rewDb = freqsHz.map((hz) => interpolateAnchors(REW_TRACE_ANCHORS_HZ_DB, hz));
    const errors = dbA.map((v, i) => v - rewDb[i]);

    // Per-band metrics
    const bandResults = BANDS.map(({ label, lo, hi }) => {
      const idxs = freqsHz.map((f, i) => (f >= lo && f < hi ? i : -1)).filter((i) => i >= 0);
      if (idxs.length === 0) {
        return { label, rms: null, meanErr: null, maxErr: null, corr: null, worstHz: null, b44Spl: null, rewSpl: null, delta: null, bias: "—", alignment: "—" };
      }
      const bandErrors = idxs.map((i) => errors[i]);
      const bandA = idxs.map((i) => dbA[i]);
      const bandRew = idxs.map((i) => rewDb[i]);
      const rms = Math.sqrt(bandErrors.reduce((s, e) => s + e * e, 0) / bandErrors.length);
      const meanErr = bandErrors.reduce((s, e) => s + e, 0) / bandErrors.length;
      let worstLocalIdx = 0;
      let worstAbs = -1;
      bandErrors.forEach((e, li) => { if (Math.abs(e) > worstAbs) { worstAbs = Math.abs(e); worstLocalIdx = li; } });
      const worstGlobalIdx = idxs[worstLocalIdx];
      const corr = pearsonCorrelation(bandA, bandRew);

      // Peak/null alignment check within band: compare classification-based feature positions
      const aFeature = nearestFeature(freqsHz, dbA, worstGlobalIdx);
      const rewFeature = nearestFeature(freqsHz, rewDb, worstGlobalIdx);
      const alignment = (aFeature.type !== "none" && rewFeature.type !== "none" && aFeature.type === rewFeature.type && Math.abs(aFeature.distanceBins - rewFeature.distanceBins) <= 3)
        ? "GOOD"
        : "POOR";

      return {
        label, rms, meanErr, maxErr: bandErrors[worstLocalIdx],
        corr, worstHz: freqsHz[worstGlobalIdx],
        b44Spl: dbA[worstGlobalIdx], rewSpl: rewDb[worstGlobalIdx],
        delta: errors[worstGlobalIdx],
        bias: meanErr > 1 ? "TOO HIGH" : meanErr < -1 ? "TOO LOW" : "NEUTRAL",
        alignment,
      };
    });

    // Top 10 individual error points across full range
    const allPoints = freqsHz.map((f, i) => ({
      hz: f, rew: rewDb[i], b44: dbA[i], delta: errors[i], idx: i,
    })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10);

    const topErrors = allPoints.map((p) => {
      const rewFeat = nearestFeature(freqsHz, rewDb, p.idx);
      const b44Feat = nearestFeature(freqsHz, dbA, p.idx);
      let errorType;
      if (rewFeat.type === "null" && b44Feat.type !== "null") errorType = "missing null";
      else if (rewFeat.type === "peak" && b44Feat.type !== "peak") errorType = "missing peak";
      else if (b44Feat.type === "peak" && rewFeat.type !== "peak") errorType = "excessive peak";
      else if (rewFeat.type === b44Feat.type && rewFeat.hz !== null && b44Feat.hz !== null && Math.abs(rewFeat.hz - b44Feat.hz) > 3) errorType = "frequency shift";
      else errorType = "level";
      return {
        hz: fmt(p.hz, 1), rew: fmt(p.rew, 1), b44: fmt(p.b44, 1), delta: fmt(p.delta, 1),
        nearestRewFeature: rewFeat.hz ? `${rewFeat.type}@${fmt(rewFeat.hz, 1)}Hz` : "none",
        nearestB44Feature: b44Feat.hz ? `${b44Feat.type}@${fmt(b44Feat.hz, 1)}Hz` : "none",
        errorType,
      };
    });

    // Verdict logic
    const rmsFor = (label) => bandResults.find((b) => b.label === label)?.rms ?? 0;
    const lowBandRms = (rmsFor("20–40 Hz") + rmsFor("40–60 Hz")) / 2;
    const midBandRms = (rmsFor("60–80 Hz") + rmsFor("80–120 Hz")) / 2;
    const highBandRms = (rmsFor("120–160 Hz") + rmsFor("160–200 Hz")) / 2;
    const overallMeanErr = errors.reduce((s, e) => s + e, 0) / errors.length;
    const bandRmsSpread = Math.max(lowBandRms, midBandRms, highBandRms) - Math.min(lowBandRms, midBandRms, highBandRms);

    let verdictNumber, verdictText;
    if (bandRmsSpread < 1.5 && Math.abs(overallMeanErr) > 2) {
      verdictNumber = 4; verdictText = "RESIDUAL ERROR IS BROAD-BAND LEVEL OFFSET";
    } else if (lowBandRms > midBandRms && lowBandRms > highBandRms) {
      verdictNumber = 1; verdictText = "RESIDUAL ERROR DOMINATED BY LOW-FREQUENCY NULL REGION";
    } else if (midBandRms > lowBandRms && midBandRms > highBandRms) {
      verdictNumber = 2; verdictText = "RESIDUAL ERROR DOMINATED BY MID-BASS 60–120 HZ SHAPE";
    } else if (highBandRms > lowBandRms && highBandRms > midBandRms) {
      verdictNumber = 3; verdictText = "RESIDUAL ERROR DOMINATED BY HIGH-BASS 120–200 HZ SHAPE";
    } else {
      verdictNumber = 5; verdictText = "RESIDUAL ERROR NOT LOCALISED";
    }

    return { bandResults, topErrors, verdictNumber, verdictText, lowBandRms, midBandRms, highBandRms, overallMeanErr };
  }, [appState?.seatingPositions, appState?.frontSubsCfg]);

  return (
    <div style={{ border: "2px solid #831843", borderRadius: 10, background: "#fdf2f8", padding: 14, fontFamily: "monospace", fontSize: 9.5 }}>
      <div style={{ fontWeight: 700, color: "#831843", fontSize: 13, marginBottom: 6 }}>
        Case 068 — Residual Shape Error Band Isolation (causal, read-only)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#fce7f3", border: "1px solid #be185d", color: "#831843", marginBottom: 10 }}>
        No production changes. Single variant A (direct+reflections+A&B modal from Case 065). Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m (V={fmt(V, 2)} m³). REW ref = Case 058 digitised trace.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>PER-BAND ERROR ANALYSIS</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
          <thead>
            <tr style={{ background: "#fce7f3" }}>
              {["Band", "RMS", "Mean err", "Max err", "Corr", "Worst Hz", "B44 SPL", "REW SPL", "Delta", "Bias", "Alignment"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #be185d", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bandResults.map((b) => (
              <tr key={b.label} style={{ background: b.alignment === "POOR" ? "#fecdd3" : "transparent" }}>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{b.label}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(b.rms, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(b.meanErr, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(b.maxErr, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(b.corr, 3)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(b.worstHz, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(b.b44Spl, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(b.rewSpl, 1)}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{fmt(b.delta, 1)}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{b.bias}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{b.alignment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>TOP 10 INDIVIDUAL ERROR POINTS (20–200 Hz)</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
          <thead>
            <tr style={{ background: "#fce7f3" }}>
              {["Hz", "REW SPL", "B44 SPL", "Delta", "Nearest REW feature", "Nearest B44 feature", "Likely error type"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #be185d", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topErrors.map((p, i) => (
              <tr key={i}>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{p.hz}</td>
                <td style={{ padding: "2px 4px" }}>{p.rew}</td>
                <td style={{ padding: "2px 4px" }}>{p.b44}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{p.delta}</td>
                <td style={{ padding: "2px 4px" }}>{p.nearestRewFeature}</td>
                <td style={{ padding: "2px 4px" }}>{p.nearestB44Feature}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{p.errorType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#831843", color: "#fdf2f8", border: "1px solid #be185d", fontSize: 9 }}>
        <div style={{ fontWeight: 700, fontSize: 11 }}>FINAL VERDICT: {verdictNumber}. {verdictText}</div>
        <div style={{ marginTop: 10, lineHeight: 1.7 }}>
          <b>TEST:</b> Does the residual error (direct+reflections+A&B modal vs Case 058 REW) concentrate in a specific frequency band, or is it a uniform broad-band offset?<br/><br/>
          <b>EXPECTED:</b> If a single physical mechanism (e.g. low-frequency null mismatch, mid-bass modal shape, or high-bass reflection density) dominates, one band's RMS should be materially higher than the others, with poor peak/null alignment concentrated there.<br/><br/>
          <b>ACTUAL:</b> Low-band (20–60Hz) avg RMS = {fmt(lowBandRms, 2)} dB; mid-band (60–120Hz) avg RMS = {fmt(midBandRms, 2)} dB; high-band (120–200Hz) avg RMS = {fmt(highBandRms, 2)} dB; overall mean error = {fmt(overallMeanErr, 2)} dB. See per-band table above for exact per-20/40Hz-band figures. Alignment column flags bands where B44's nearest peak/null feature does not match REW's position within 3 bins.<br/><br/>
          <b>DELTA:</b> {verdictText === "RESIDUAL ERROR IS BROAD-BAND LEVEL OFFSET"
            ? "Per-band RMS is roughly uniform across all six bands, while a consistent non-zero mean error persists throughout — indicating a flat gain/calibration issue (see Case 067) rather than a localised shape error."
            : "One or more bands show materially higher RMS and/or poor peak/null alignment than the others — see per-band table for the specific band and top-10 error table for the dominant error type (level / frequency shift / missing null / missing peak / excessive peak) driving that band."}<br/><br/>
          <b>SEVERITY:</b> {verdictNumber === 5 ? "INFORMATIONAL — error is spread across bands with no single dominant region" : "HIGH — a specific frequency region is identified as the dominant residual error source"}<br/><br/>
          <b>NEXT FIX CANDIDATE:</b> {verdictNumber === 1
            ? "Investigate the low-frequency (20–60Hz) null/shoulder shape — likely modal Q or reflection coherence weighting behaviour near the room's fundamental axial modes."
            : verdictNumber === 2
              ? "Investigate the 60–120Hz mid-bass region — likely tangential/oblique mode density or reflection coherence weighting in this band."
              : verdictNumber === 3
                ? "Investigate the 120–200Hz high-bass region — likely higher-order mode density, Q soft-cap behaviour, or reflection order truncation (debugReflectionOrder=1) missing higher-order energy in this band."
                : verdictNumber === 4
                  ? "Return to Case 067's calibration-chain findings — a broad-band offset is a calibration, not a shape, issue."
                  : "No single band or error-type dominates; a combined shape+calibration correction may be required rather than a single localized fix."}
        </div>
      </div>
    </div>
  );
}