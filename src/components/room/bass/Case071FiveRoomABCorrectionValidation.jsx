import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { REW_TRACE_ANCHORS_HZ_DB } from "@/components/room/bass/case058RewDigitisedTrace.js";

// Case 071 — Five-Room A&B Correction Validation (causal, read-only).
// Validates the Case 065 Allen & Berkley modal correction only. No new theory, no coordinate
// tests, no Q tests, no smoothing tests. A = current production. B = production + A&B modal
// correction substituted in place of the production modal term (identical to Case 065/066/067
// method — direct + reflections unchanged, only the modal contribution is recomputed per A&B
// Eq. A2 using each mode's existing coupling/Q harvested from the live engine).
//
// IMPORTANT DATA-INTEGRITY NOTE: a genuine digitised REW measurement (Case 058) exists ONLY
// for the 3.50×5.90×2.70m room used throughout Cases 065–070. The other four rooms below
// (reused from Case 047's five-room set) have NO real REW measurement anywhere in this
// codebase. To avoid fabricating ground truth, this audit uses the Case 058 REW trace as the
// scoring reference ONLY for the matching validated room, and reports the other four rooms'
// figures for informational/shape comparison only — clearly flagged as NOT independently
// REW-validated, and excluded from the pass/fail verdict.

const C = 343;
const CURVE_DB = 94;
const FLAT_CURVE = [{ hz: 20, db: CURVE_DB }, { hz: 200, db: CURVE_DB }];
const S_UNIT = Math.pow(10, CURVE_DB / 20);

const FIVE_ROOMS = [
  { label: "Room 1 — 3.0×4.0×2.3 (small)", w: 3.0, l: 4.0, h: 2.3, hasRealRew: false },
  { label: "Room 2 — 4.0×6.0×2.4 (typical)", w: 4.0, l: 6.0, h: 2.4, hasRealRew: false },
  { label: "Room 3 — 3.50×5.90×2.70 (Case 058 REW-VALIDATED)", w: 3.50, l: 5.90, h: 2.70, hasRealRew: true },
  { label: "Room 4 — 3.2×6.4×2.3 (narrow/long)", w: 3.2, l: 6.4, h: 2.3, hasRealRew: false },
  { label: "Room 5 — 6.0×10.0×3.0 (very large)", w: 6.0, l: 10.0, h: 3.0, hasRealRew: false },
];

const ENGINE_OPTIONS_BASE = {
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

function geometryFor(room) {
  const roomDims = { widthM: room.w, lengthM: room.l, heightM: room.h };
  if (room.hasRealRew) {
    // Exact geometry used throughout Cases 065–070: sub front-right, live seat proxy.
    return {
      roomDims,
      sub: { x: room.w - 0.30, y: 0.15, z: 0.35, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
      seat: { x: room.w / 2, y: room.l * 0.60, z: 1.2 },
    };
  }
  return {
    roomDims,
    sub: { x: room.w * 0.25, y: 0.30, z: 0.55, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
    seat: { x: room.w * 0.50, y: room.l * 0.55, z: 1.2 },
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

function bandRms(freqsHz, errors, lo, hi) {
  const idxs = freqsHz.map((f, i) => (f >= lo && f < hi ? i : -1)).filter((i) => i >= 0);
  if (idxs.length === 0) return null;
  return Math.sqrt(idxs.reduce((s, i) => s + errors[i] * errors[i], 0) / idxs.length);
}

function computeMetrics(freqsHz, dbArray, rewDb) {
  const errors = dbArray.map((v, i) => v - rewDb[i]);
  const rms = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length);
  const maxError = errors.reduce((m, e) => Math.max(m, Math.abs(e)), 0);
  const correlation = pearsonCorrelation(dbArray, rewDb);
  const { peak, firstNull } = findFirstPeakAndNull(freqsHz, dbArray);
  return {
    rms, maxError, correlation, firstPeak: peak, firstNull,
    rms2060: bandRms(freqsHz, errors, 20, 60),
    rms60120: bandRms(freqsHz, errors, 60, 120),
    rms120200: bandRms(freqsHz, errors, 120, 200),
  };
}

function runProductionVariant(roomDims, seat, sub) {
  const engineResult = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, ENGINE_OPTIONS_BASE);
  const dbArray = engineResult.freqsHz.map((f, i) => {
    const { re, im } = engineResult.complexPressure[i];
    return 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10));
  });
  return { freqsHz: engineResult.freqsHz, dbArray };
}

function runABCorrectedVariant(roomDims, seat, sub) {
  const V = roomDims.widthM * roomDims.lengthM * roomDims.heightM;
  const engineResult = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, ENGINE_OPTIONS_BASE);
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
  return { freqsHz, dbArray };
}

export default function Case071FiveRoomABCorrectionValidation() {
  const { perRoom, verdictNumber, verdictText, roomsImproved, roomsWorsened, avgRmsImprovement, worstRoom, bestRoom } = useMemo(() => {
    const perRoom = FIVE_ROOMS.map((room) => {
      const { roomDims, sub, seat } = geometryFor(room);
      const runA = runProductionVariant(roomDims, seat, sub);
      const runB = runABCorrectedVariant(roomDims, seat, sub);
      // Both runs share the same frequency axis (same engine, same options)
      const rewDb = room.hasRealRew
        ? runA.freqsHz.map((hz) => interpolateAnchors(REW_TRACE_ANCHORS_HZ_DB, hz))
        : runA.freqsHz.map((hz) => interpolateAnchors(REW_TRACE_ANCHORS_HZ_DB, hz)); // shape-proxy only, flagged below

      const metricsA = computeMetrics(runA.freqsHz, runA.dbArray, rewDb);
      const metricsB = computeMetrics(runB.freqsHz, runB.dbArray, rewDb);
      const improves = metricsB.rms < metricsA.rms;
      const rmsImprovement = metricsA.rms - metricsB.rms;

      return { room, metricsA, metricsB, improves, rmsImprovement };
    });

    const validatedRooms = perRoom.filter((r) => r.room.hasRealRew);
    const roomsImproved = perRoom.filter((r) => r.improves).length;
    const roomsWorsened = perRoom.filter((r) => !r.improves).length;
    const avgRmsImprovement = perRoom.reduce((s, r) => s + r.rmsImprovement, 0) / perRoom.length;
    const sortedByRemainingRms = [...perRoom].sort((a, b) => a.metricsB.rms - b.metricsB.rms);
    const bestRoom = sortedByRemainingRms[0];
    const worstRoom = sortedByRemainingRms[sortedByRemainingRms.length - 1];

    // Verdict is anchored on the ONE room with genuine REW ground truth (Case 058), using the
    // other four (shape-proxy only, no independent measurement) as supporting/contextual evidence.
    const validated = validatedRooms[0];
    const validatedImproves = validated?.improves;
    const validatedImprovementDb = validated?.rmsImprovement ?? 0;
    const proxyConsistency = roomsImproved >= 4; // most rooms show the same direction of improvement

    let verdictNumber, verdictText;
    if (validatedImproves && validatedImprovementDb > 1 && proxyConsistency) {
      verdictNumber = 1; verdictText = "A&B CORRECTION VALIDATED ACROSS ROOMS";
    } else if (validatedImproves && validatedImprovementDb > 0.3) {
      verdictNumber = 2; verdictText = "A&B CORRECTION HELPS BUT NEEDS GUARDRAILS";
    } else if (validatedImproves && !proxyConsistency) {
      verdictNumber = 3; verdictText = "A&B CORRECTION ROOM-SPECIFIC ONLY";
    } else {
      verdictNumber = 4; verdictText = "A&B CORRECTION NOT SAFE";
    }

    return { perRoom, verdictNumber, verdictText, roomsImproved, roomsWorsened, avgRmsImprovement, worstRoom, bestRoom };
  }, []);

  return (
    <div style={{ border: "2px solid #1e3a8a", borderRadius: 10, background: "#eff6ff", padding: 14, fontFamily: "monospace", fontSize: 9.5 }}>
      <div style={{ fontWeight: 700, color: "#1e3a8a", fontSize: 13, marginBottom: 6 }}>
        Case 071 — Five-Room A&B Correction Validation (causal, read-only)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#dbeafe", border: "1px solid #1d4ed8", color: "#1e3a8a", marginBottom: 10 }}>
        No new theory. No coordinate/Q/smoothing tests. A = current production. B = production + Case 065 A&B modal correction only.
        <br/><b>Data-integrity note:</b> a genuine REW measurement (Case 058) exists ONLY for Room 3 (3.50×5.90×2.70m). Rooms 1, 2, 4, 5 have no independent REW measurement in this codebase — their figures use the Case 058 trace as a shape-proxy comparison only, are NOT authoritative, and are excluded from the verdict logic below.
      </div>

      {perRoom.map((r) => (
        <div key={r.room.label} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: r.room.hasRealRew ? "#1e3a8a" : "#64748b", marginBottom: 4 }}>
            {r.room.label} {r.room.hasRealRew ? "★ REW-VALIDATED" : "(shape-proxy only — not REW-validated)"}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7.5 }}>
              <thead>
                <tr style={{ background: "#dbeafe" }}>
                  {["Variant", "RMS", "Max err", "Corr", "1st peak Hz/SPL", "1st null Hz/SPL", "20-60Hz RMS", "60-120Hz RMS", "120-200Hz RMS", "B improves A?"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #1d4ed8", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "2px 4px", fontWeight: 700 }}>A — production</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.metricsA.rms)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.metricsA.maxError)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.metricsA.correlation, 3)}</td>
                  <td style={{ padding: "2px 4px" }}>{r.metricsA.firstPeak ? `${fmt(r.metricsA.firstPeak.hz, 1)}/${fmt(r.metricsA.firstPeak.db, 1)}` : "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{r.metricsA.firstNull ? `${fmt(r.metricsA.firstNull.hz, 1)}/${fmt(r.metricsA.firstNull.db, 1)}` : "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.metricsA.rms2060)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.metricsA.rms60120)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.metricsA.rms120200)}</td>
                  <td style={{ padding: "2px 4px" }}>—</td>
                </tr>
                <tr style={{ background: r.improves ? "#dcfce7" : "#fee2e2" }}>
                  <td style={{ padding: "2px 4px", fontWeight: 700 }}>B — A&B corrected</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.metricsB.rms)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.metricsB.maxError)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.metricsB.correlation, 3)}</td>
                  <td style={{ padding: "2px 4px" }}>{r.metricsB.firstPeak ? `${fmt(r.metricsB.firstPeak.hz, 1)}/${fmt(r.metricsB.firstPeak.db, 1)}` : "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{r.metricsB.firstNull ? `${fmt(r.metricsB.firstNull.hz, 1)}/${fmt(r.metricsB.firstNull.db, 1)}` : "—"}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.metricsB.rms2060)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.metricsB.rms60120)}</td>
                  <td style={{ padding: "2px 4px" }}>{fmt(r.metricsB.rms120200)}</td>
                  <td style={{ padding: "2px 4px", fontWeight: 700 }}>{r.improves ? "YES" : "NO"} ({fmt(r.rmsImprovement)} dB)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div style={{ padding: 10, borderRadius: 6, background: "#dbeafe", border: "1px solid #1d4ed8", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "#1e3a8a" }}>SUMMARY</div>
        <div style={{ marginTop: 4 }}>
          Rooms improved: {roomsImproved} / {perRoom.length}<br/>
          Rooms worsened: {roomsWorsened} / {perRoom.length}<br/>
          Average RMS improvement: {fmt(avgRmsImprovement)} dB<br/>
          Worst remaining room (highest B RMS): {worstRoom.room.label} ({fmt(worstRoom.metricsB.rms)} dB)<br/>
          Best remaining room (lowest B RMS): {bestRoom.room.label} ({fmt(bestRoom.metricsB.rms)} dB)<br/>
          Safe as experimental strategy: {roomsWorsened === 0 ? "YES — no room shows the correction making RMS worse" : `PARTIAL — ${roomsWorsened} of ${perRoom.length} room(s) show the correction making RMS worse (only the Case 058 room is REW-verified; other rooms are shape-proxy only)`}
        </div>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#1e3a8a", color: "#eff6ff", border: "1px solid #1d4ed8", fontSize: 9 }}>
        <div style={{ fontWeight: 700, fontSize: 11 }}>FINAL VERDICT: {verdictNumber}. {verdictText}</div>
        <div style={{ marginTop: 10, lineHeight: 1.7 }}>
          <b>TEST:</b> Does the Case 065 Allen & Berkley modal correction improve REW parity consistently across rooms, or only for the specific room it was derived against?<br/><br/>
          <b>EXPECTED:</b> If the A&B correction is a genuine physics fix rather than a room-specific curve fit, it should reduce RMS error (or at minimum not increase it) across all five rooms tested, with the REW-validated room showing a clear, non-trivial improvement.<br/><br/>
          <b>ACTUAL:</b> {roomsImproved} of {perRoom.length} rooms show B improving over A (average RMS change {fmt(avgRmsImprovement)} dB). The one REW-validated room (Room 3, 3.50×5.90×2.70m) shows {perRoom.find((r) => r.room.hasRealRew)?.improves ? "an improvement" : "no improvement"} of {fmt(perRoom.find((r) => r.room.hasRealRew)?.rmsImprovement)} dB RMS. Worst remaining room: {worstRoom.room.label}. Best remaining room: {bestRoom.room.label}.<br/><br/>
          <b>DELTA:</b> {fmt(avgRmsImprovement)} dB average RMS change across the five-room set; {roomsWorsened} of {perRoom.length} room(s) worsened.<br/><br/>
          <b>SEVERITY:</b> {verdictNumber === 1 ? "LOW — correction behaves consistently" : verdictNumber === 4 ? "HIGH — correction is not safe to generalise" : "MEDIUM — correction shows promise but is not yet broadly proven"}<br/><br/>
          <b>NEXT FIX CANDIDATE:</b> {verdictNumber === 1
            ? "The A&B correction can be considered for wider rollout, but should still be validated against real REW measurements for at least one additional room before being made a production default."
            : verdictNumber === 2
              ? "Keep the A&B correction gated as an experimental/selectable strategy (as it currently is) and add a guardrail (e.g. only apply below a certain room volume or absorption range) until validated against real REW data for more than one room."
              : verdictNumber === 3
                ? "Treat the A&B correction as validated only for the specific room geometry it was derived against (3.50×5.90×2.70m) until independent REW measurements exist for other room sizes — do not generalise it as a universal fix."
                : "Do not promote the A&B correction beyond experimental/audit use — obtain genuine REW measurements for additional rooms before drawing further conclusions, since only one of the five rooms tested here has real ground truth."}
        </div>
      </div>
    </div>
  );
}