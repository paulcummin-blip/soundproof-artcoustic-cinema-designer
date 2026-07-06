import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { REW_TRACE_ANCHORS_HZ_DB } from "@/components/room/bass/case058RewDigitisedTrace.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 070 — Position Sensitivity / Coordinate Verification Audit (causal, read-only).
// Varies ONLY sub/seat coordinates. No modal equation, Q, damping, reflection, smoothing,
// level, gain, phase, or pressure-scaling changes. Builds on Case 065's A&B modal baseline.

const ROOM = { widthM: 3.50, lengthM: 5.90, heightM: 2.70 };
const V = ROOM.widthM * ROOM.lengthM * ROOM.heightM;
const C = 343;
const CURVE_DB = 94;
const FLAT_CURVE = [{ hz: 20, db: CURVE_DB }, { hz: 200, db: CURVE_DB }];
const S_UNIT = Math.pow(10, CURVE_DB / 20);
const CHECK_HZ = [29, 38, 58];
const DELTAS_MM = [-100, -50, -25, 25, 50, 100];

const ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: 0.30, back: 0.30, left: 0.30, right: 0.30, ceiling: 0.30, floor: 0.30 },
  freqMinHz: 20,
  freqMaxHz: 100,
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
  const sub = { x: ROOM.widthM - 0.30, y: 0.15, z: 0.35 };
  return {
    seat: { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 },
    sub,
  };
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

function findContributor(contributorsRow, nx, ny, nz) {
  const list = contributorsRow?.contributors || [];
  return list.find((c) => c.nx === nx && c.ny === ny && c.nz === nz) || null;
}

function runVariant(seat, sub) {
  const engineResult = simulateBassResponseRewCore(ROOM, seat, { ...sub, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } }, FLAT_CURVE, ENGINE_OPTIONS);
  const { freqsHz, perFrequencyVectorDebug, activeModalContributorDebugSeries } = engineResult;

  const dbArray = freqsHz.map((frequencyHz, i) => {
    const preRow = perFrequencyVectorDebug[i];
    const contributorRow = activeModalContributorDebugSeries[i];
    const k = (2 * Math.PI * frequencyHz) / C;
    let modalRe = 0, modalIm = 0;
    (contributorRow?.contributors || []).forEach((c) => {
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

  const idx29 = nearestIdx(freqsHz, 29);
  const mode010 = findContributor(activeModalContributorDebugSeries[idx29], 0, 1, 0);

  return { freqsHz, dbArray, mode010 };
}

function computeMetrics(freqsHz, dbArray, rewDb) {
  const errors = dbArray.map((v, i) => v - rewDb[i]);
  const rms = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
  const maxError = errors.reduce((m, e) => Math.max(m, Math.abs(e)), 0);
  const correlation = pearsonCorrelation(dbArray, rewDb);
  const { peak, firstNull } = findFirstPeakAndNull(freqsHz, dbArray);
  const checkPoints = {};
  CHECK_HZ.forEach((hz) => { checkPoints[hz] = dbArray[nearestIdx(freqsHz, hz)]; });
  const idxs2065 = freqsHz.map((f, i) => (f >= 20 && f <= 65 ? i : -1)).filter((i) => i >= 0);
  const rms2065 = Math.sqrt(idxs2065.reduce((s, i) => s + errors[i] * errors[i], 0) / idxs2065.length);
  return { rms, maxError, correlation, checkPoints, firstPeak: peak, firstNull, rms2065 };
}

const COORD_LABELS = {
  subX: "Sub X (width, from left wall)",
  subY: "Sub Y (length, from front wall)",
  subZ: "Sub Z (height, from floor)",
  seatX: "Listener X (width, from left wall)",
  seatY: "Listener Y (length, from front wall)",
  seatZ: "Listener Z (height, from floor)",
};

export default function Case070PositionSensitivityCoordinateVerificationAudit() {
  const appState = useAppState();

  const { baseline, sweeps, sensitivityRanked, mmForTargets, mode010Sweep, causalAnswer, verdictNumber, verdictText, bestVariant } = useMemo(() => {
    const { seat, sub } = resolveLiveSeatAndSub(appState);
    const rewDbFor = (freqsHz) => freqsHz.map((hz) => interpolateAnchors(REW_TRACE_ANCHORS_HZ_DB, hz));

    const baseRun = runVariant(seat, sub);
    const baseRewDb = rewDbFor(baseRun.freqsHz);
    const baseMetrics = computeMetrics(baseRun.freqsHz, baseRun.dbArray, baseRewDb);
    const baseline = { seat, sub, metrics: baseMetrics, mode010: baseRun.mode010 };

    const coordDefs = [
      { key: "subX", apply: (dm) => ({ seat, sub: { ...sub, x: sub.x + dm } }) },
      { key: "subY", apply: (dm) => ({ seat, sub: { ...sub, y: sub.y + dm } }) },
      { key: "subZ", apply: (dm) => ({ seat, sub: { ...sub, z: sub.z + dm } }) },
      { key: "seatX", apply: (dm) => ({ seat: { ...seat, x: seat.x + dm }, sub }) },
      { key: "seatY", apply: (dm) => ({ seat: { ...seat, y: seat.y + dm }, sub }) },
      { key: "seatZ", apply: (dm) => ({ seat: { ...seat, z: seat.z + dm }, sub }) },
    ];

    const sweeps = {};
    const mode010Sweep = {};
    coordDefs.forEach(({ key, apply }) => {
      sweeps[key] = DELTAS_MM.map((mm) => {
        const dm = mm / 1000;
        const { seat: s2, sub: b2 } = apply(dm);
        const run = runVariant(s2, b2);
        const rewDb2 = rewDbFor(run.freqsHz);
        const metrics = computeMetrics(run.freqsHz, run.dbArray, rewDb2);
        return { mm, metrics, mode010: run.mode010 };
      });
      mode010Sweep[key] = [{ mm: 0, mode010: baseline.mode010 }, ...sweeps[key].map((v) => ({ mm: v.mm, mode010: v.mode010 }))]
        .sort((a, b) => a.mm - b.mm);
    });

    // Sensitivity ranking: use RMS(20-65Hz) delta at ±100mm (average of both directions' |delta|)
    const sensitivity = coordDefs.map(({ key }) => {
      const variants = sweeps[key];
      const plus100 = variants.find((v) => v.mm === 100);
      const minus100 = variants.find((v) => v.mm === -100);
      const dPlus = plus100 ? Math.abs(plus100.metrics.rms2065 - baseline.metrics.rms2065) : 0;
      const dMinus = minus100 ? Math.abs(minus100.metrics.rms2065 - baseline.metrics.rms2065) : 0;
      const avgSensitivityDbPer100mm = (dPlus + dMinus) / 2;
      return { key, label: COORD_LABELS[key], avgSensitivityDbPer100mm, dPlus, dMinus };
    });
    const sensitivityRanked = [...sensitivity].sort((a, b) => b.avgSensitivityDbPer100mm - a.avgSensitivityDbPer100mm);

    // mm required for target RMS reduction (0.5/1/2dB) — use most-improving coordinate & direction, linear interpolation
    function mmForImprovement(targetDb) {
      let best = null;
      coordDefs.forEach(({ key }) => {
        sweeps[key].forEach((v) => {
          const improvement = baseline.metrics.rms2065 - v.metrics.rms2065;
          if (improvement > 0) {
            const mmPerDb = Math.abs(v.mm) / improvement;
            const mmNeeded = mmPerDb * targetDb;
            if (!best || mmNeeded < best.mmNeeded) best = { key, mmNeeded, sampleMm: v.mm, sampleImprovement: improvement };
          }
        });
      });
      return best;
    }
    const mmForTargets = {
      "0.5dB": mmForImprovement(0.5),
      "1dB": mmForImprovement(1.0),
      "2dB": mmForImprovement(2.0),
    };

    // Best overall variant across all sweeps (lowest rms2065)
    let bestVariant = { key: "baseline", mm: 0, metrics: baseline.metrics };
    coordDefs.forEach(({ key }) => {
      sweeps[key].forEach((v) => {
        if (v.metrics.rms2065 < bestVariant.metrics.rms2065) bestVariant = { key, mm: v.mm, metrics: v.metrics };
      });
    });

    const bestImprovement = baseline.metrics.rms2065 - bestVariant.metrics.rms2065;
    let causalAnswer;
    if (bestImprovement > 3) causalAnswer = "YES";
    else if (bestImprovement > 1) causalAnswer = "PARTIALLY";
    else causalAnswer = "NO";

    let verdictNumber, verdictText;
    if (causalAnswer === "NO" && sensitivityRanked[0].avgSensitivityDbPer100mm < 1.0) {
      verdictNumber = 5; verdictText = "PRODUCTION PARITY ESSENTIALLY ACHIEVED";
    } else if (causalAnswer === "YES") {
      verdictNumber = 2; verdictText = "REW MEASUREMENT POSITION UNCERTAINTY";
    } else if (causalAnswer === "PARTIALLY" && sensitivityRanked[0].avgSensitivityDbPer100mm > 2) {
      verdictNumber = 1; verdictText = "COORDINATE DEFINITION MISMATCH (ORIGIN/REFERENCE PROBLEM)";
    } else if (baseline.metrics.rms2065 > 4) {
      verdictNumber = 3; verdictText = "REMAINING MODAL SOLVER ISSUE";
    } else {
      verdictNumber = 4; verdictText = "REFLECTION MODEL BELOW 60 HZ";
    }

    return { baseline, sweeps, sensitivityRanked, mmForTargets, mode010Sweep, causalAnswer, verdictNumber, verdictText, bestVariant };
  }, [appState?.seatingPositions, appState?.frontSubsCfg]);

  const SweepTable = ({ coordKey }) => {
    const rows = [{ mm: 0, metrics: baseline.metrics }, ...sweeps[coordKey]].sort((a, b) => a.mm - b.mm);
    return (
      <div style={{ marginBottom: 10, overflowX: "auto" }}>
        <div style={{ fontWeight: 700, marginBottom: 3 }}>{COORD_LABELS[coordKey]}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7.3 }}>
          <thead>
            <tr style={{ background: "#e0e7ff" }}>
              {["Δmm", "RMS(full)", "Max err", "Corr", "29Hz", "38Hz", "58Hz", "1st peak", "1st null", "RMS 20-65Hz"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #4338ca", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.mm} style={{ background: r.mm === 0 ? "#c7d2fe" : "transparent" }}>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{r.mm === 0 ? "baseline" : (r.mm > 0 ? `+${r.mm}` : r.mm)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.metrics.rms, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.metrics.maxError, 2)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.metrics.correlation, 3)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.metrics.checkPoints[29], 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.metrics.checkPoints[38], 1)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.metrics.checkPoints[58], 1)}</td>
                <td style={{ padding: "2px 4px" }}>{r.metrics.firstPeak ? `${fmt(r.metrics.firstPeak.hz, 1)}/${fmt(r.metrics.firstPeak.db, 1)}` : "—"}</td>
                <td style={{ padding: "2px 4px" }}>{r.metrics.firstNull ? `${fmt(r.metrics.firstNull.hz, 1)}/${fmt(r.metrics.firstNull.db, 1)}` : "—"}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{fmt(r.metrics.rms2065, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={{ border: "2px solid #3730a3", borderRadius: 10, background: "#eef2ff", padding: 14, fontFamily: "monospace", fontSize: 9.5 }}>
      <div style={{ fontWeight: 700, color: "#3730a3", fontSize: 13, marginBottom: 6 }}>
        Case 070 — Position Sensitivity / Coordinate Verification Audit (causal, read-only)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#e0e7ff", border: "1px solid #4338ca", color: "#3730a3", marginBottom: 10 }}>
        No production changes. Only sub/seat coordinates varied, one at a time. Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m. REW ref = Case 058. Modal baseline = Case 065 A&B correction.
      </div>

      <div style={{ marginBottom: 10, padding: 8, background: "#fff", borderRadius: 6, border: "1px solid #4338ca" }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>STEP 1 — BASELINE COORDINATES (as currently used by B44)</div>
        <div>Subwoofer: x = {fmt(baseline.sub.x, 3)} m (from LEFT wall), y = {fmt(baseline.sub.y, 3)} m (from FRONT wall), z = {fmt(baseline.sub.z, 3)} m (from FLOOR)</div>
        <div>Listener: x = {fmt(baseline.seat.x, 3)} m (from LEFT wall), y = {fmt(baseline.seat.y, 3)} m (from FRONT wall), z = {fmt(baseline.seat.z, 3)} m (from FLOOR)</div>
        <div style={{ marginTop: 4 }}>Coordinate origin: (0,0,0) at the room's front-left-floor corner. X increases toward the right wall, Y increases toward the rear wall, Z increases toward the ceiling — confirmed directly from the engine's mode-shape and distance calculations (dx = source.x − seat.x, etc., against widthM/lengthM/heightM).</div>
        <div style={{ marginTop: 4 }}>Baseline RMS (full 20–100Hz): {fmt(baseline.metrics.rms, 2)} dB &nbsp;|&nbsp; RMS (20–65Hz only): {fmt(baseline.metrics.rms2065, 2)} dB &nbsp;|&nbsp; Correlation: {fmt(baseline.metrics.correlation, 3)}</div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>STEP 2 — LOCAL POSITION SWEEP (±25/50/100mm, one coordinate at a time)</div>
        {Object.keys(COORD_LABELS).map((k) => <SweepTable key={k} coordKey={k} />)}
      </div>

      <div style={{ marginBottom: 10, padding: 8, background: "#fff", borderRadius: 6, border: "1px solid #4338ca" }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>STEP 3 — SENSITIVITY MAP</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7.5, marginBottom: 6 }}>
          <thead>
            <tr style={{ background: "#e0e7ff" }}>
              {["Rank", "Coordinate", "Avg RMS Δ per ±100mm (dB)"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #4338ca" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sensitivityRanked.map((s, i) => (
              <tr key={s.key}>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{i + 1}{i === 0 ? " (MOST sensitive)" : i === sensitivityRanked.length - 1 ? " (LEAST sensitive)" : ""}</td>
                <td style={{ padding: "2px 4px" }}>{s.label}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(s.avgSensitivityDbPer100mm, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>mm movement required to reduce RMS(20–65Hz) by:</div>
        <div>&nbsp;&nbsp;0.5 dB: {mmForTargets["0.5dB"] ? `${fmt(mmForTargets["0.5dB"].mmNeeded, 0)}mm on ${COORD_LABELS[mmForTargets["0.5dB"].key]}` : "not achievable within ±100mm on any coordinate"}</div>
        <div>&nbsp;&nbsp;1 dB: {mmForTargets["1dB"] ? `${fmt(mmForTargets["1dB"].mmNeeded, 0)}mm on ${COORD_LABELS[mmForTargets["1dB"].key]}` : "not achievable within ±100mm on any coordinate"}</div>
        <div>&nbsp;&nbsp;2 dB: {mmForTargets["2dB"] ? `${fmt(mmForTargets["2dB"].mmNeeded, 0)}mm on ${COORD_LABELS[mmForTargets["2dB"].key]}` : "not achievable within ±100mm on any coordinate"}</div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>STEP 4 — (0,1,0) LOW MODE COUPLING vs POSITION</div>
        {Object.keys(COORD_LABELS).map((k) => (
          <div key={k} style={{ marginBottom: 8, overflowX: "auto" }}>
            <div style={{ fontWeight: 700, fontSize: 8 }}>{COORD_LABELS[k]}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7 }}>
              <thead>
                <tr style={{ background: "#e0e7ff" }}>
                  {["Δmm", "Src coupling", "Recv coupling", "Combined", "Modal amplitude (magnitude)"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "2px 4px", borderBottom: "1px solid #4338ca" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mode010Sweep[k].map((row) => {
                  const m = row.mode010;
                  const mag = m ? Math.sqrt(m.activeReal * m.activeReal + m.activeImag * m.activeImag) : null;
                  return (
                    <tr key={row.mm} style={{ background: row.mm === 0 ? "#c7d2fe" : "transparent" }}>
                      <td style={{ padding: "2px 4px", fontWeight: 700 }}>{row.mm === 0 ? "baseline" : (row.mm > 0 ? `+${row.mm}` : row.mm)}</td>
                      <td style={{ padding: "2px 4px" }}>{fmt(m?.sourceCoupling, 3)}</td>
                      <td style={{ padding: "2px 4px" }}>{fmt(m?.receiverCoupling, 3)}</td>
                      <td style={{ padding: "2px 4px" }}>{fmt(m?.combinedCoupling, 3)}</td>
                      <td style={{ padding: "2px 4px" }}>{fmt(mag, 4)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        <div style={{ marginTop: 4 }}>
          Coupling changes approximately <b>{(() => {
            const rows = mode010Sweep.subY;
            const c0 = rows.find((r) => r.mm === 0)?.mode010?.combinedCoupling;
            const cPlus100 = rows.find((r) => r.mm === 100)?.mode010?.combinedCoupling;
            const cPlus25 = rows.find((r) => r.mm === 25)?.mode010?.combinedCoupling;
            if (c0 == null || cPlus100 == null || cPlus25 == null) return "unknown";
            const slopeAt25 = (cPlus25 - c0) / 25;
            const slopeAt100 = (cPlus100 - c0) / 100;
            const ratio = Math.abs(slopeAt100 / (slopeAt25 || 1e-9));
            return ratio > 1.5 || ratio < 0.67 ? "NON-LINEARLY (rapid change with position, cosine mode-shape curvature)" : "LINEARLY over this ±100mm range";
          })()}</b> (evaluated on Sub Y, the length-axis coordinate most relevant to the (0,1,0) length-axial mode).
        </div>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#3730a3", color: "#eef2ff", border: "1px solid #4338ca", fontSize: 9 }}>
        <div style={{ fontWeight: 700, fontSize: 11 }}>STEP 5 — CAUSAL TEST: {causalAnswer}</div>
        <div style={{ marginTop: 6 }}>Best variant found: {bestVariant.key === "baseline" ? "baseline (no coordinate change improves RMS)" : `${COORD_LABELS[bestVariant.key]} at Δ${bestVariant.mm > 0 ? "+" : ""}${bestVariant.mm}mm`} — RMS(20–65Hz) = {fmt(bestVariant.metrics.rms2065, 2)} dB vs baseline {fmt(baseline.metrics.rms2065, 2)} dB (improvement = {fmt(baseline.metrics.rms2065 - bestVariant.metrics.rms2065, 2)} dB).</div>

        <div style={{ marginTop: 10, fontWeight: 700, fontSize: 11 }}>FINAL VERDICT: {verdictNumber}. {verdictText}</div>
        <div style={{ marginTop: 10, lineHeight: 1.7 }}>
          <b>TEST:</b> Can the remaining REW mismatch in the 20–65Hz region be explained by realistic uncertainty (±25–100mm) in subwoofer or listener position?<br/><br/>
          <b>EXPECTED:</b> If REW and B44 are effectively modelling the same physical geometry, small coordinate changes should produce only minor (sub-1dB) RMS improvements — a large RMS drop from a small coordinate nudge would instead suggest a genuine origin/reference mismatch between how B44 and REW define "x/y/z".<br/><br/>
          <b>ACTUAL:</b> Best coordinate variant = {bestVariant.key === "baseline" ? "none (baseline already optimal among tested variants)" : `${COORD_LABELS[bestVariant.key]} at Δ${bestVariant.mm > 0 ? "+" : ""}${bestVariant.mm}mm`}, improving RMS(20–65Hz) from {fmt(baseline.metrics.rms2065, 2)} dB to {fmt(bestVariant.metrics.rms2065, 2)} dB ({fmt(baseline.metrics.rms2065 - bestVariant.metrics.rms2065, 2)} dB improvement). Most sensitive coordinate: {sensitivityRanked[0].label} ({fmt(sensitivityRanked[0].avgSensitivityDbPer100mm, 2)} dB avg change per ±100mm). Least sensitive: {sensitivityRanked[sensitivityRanked.length - 1].label} ({fmt(sensitivityRanked[sensitivityRanked.length - 1].avgSensitivityDbPer100mm, 2)} dB avg change per ±100mm).<br/><br/>
          <b>DELTA:</b> {fmt(baseline.metrics.rms2065 - bestVariant.metrics.rms2065, 2)} dB RMS improvement from the best single-coordinate ±100mm move, vs a baseline RMS(20–65Hz) mismatch of {fmt(baseline.metrics.rms2065, 2)} dB.<br/><br/>
          <b>SEVERITY:</b> {verdictNumber === 5 ? "LOW" : verdictNumber === 1 ? "HIGH" : "MEDIUM"}<br/><br/>
          <b>NEXT FIX CANDIDATE:</b> {verdictNumber === 1
            ? "Verify that REW's measurement position and B44's coordinate origin/axis convention (front-left-floor corner, X=width, Y=length, Z=height) are defined identically — a large RMS swing from a small coordinate nudge points to an origin or axis-labelling mismatch rather than true physical uncertainty."
            : verdictNumber === 2
              ? "The remaining error is largely explained by realistic ±25–100mm sub/listener placement uncertainty — treat this as REW measurement-position tolerance rather than an engine defect; re-measure REW at the exact documented coordinates to confirm."
              : verdictNumber === 3
                ? "Coordinate sensitivity does not explain the residual error — return to the modal solver itself (see Case 067/068/069 findings) as the primary suspect."
                : verdictNumber === 4
                  ? "Coordinate sensitivity is low and the residual error persists — investigate the reflection model's behaviour below 60Hz (image-source order, coherence weighting) as the next candidate."
                  : "Residual RMS is already small and coordinate sensitivity is low — production parity is essentially achieved for this room/position combination."}
        </div>
      </div>
    </div>
  );
}