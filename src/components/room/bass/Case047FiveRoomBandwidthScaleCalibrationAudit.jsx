import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";

// Case 047 — Five-Room Bandwidth Scale Calibration (read-only, diagnostic only).
// Tests whether the "REW-style Modal Bandwidth" Q strategy (added for Case-selectable
// experimentation, rewBassEngine.js qStrategy: 'rew_modal_bandwidth') is a systematic
// REW-parity correction across five representative rooms. Uses ONLY the existing engine
// path and existing bandwidth-scale option — no new physics, no overlap boost, no
// normalisation, no source/receiver changes, no production default change.

const FIVE_ROOMS = [
  { label: "Room 1 — 3.0×4.0×2.3 (small)", w: 3.0, l: 4.0, h: 2.3 },
  { label: "Room 2 — 4.0×6.0×2.4 (typical)", w: 4.0, l: 6.0, h: 2.4 },
  { label: "Room 3 — 6.0×8.0×2.7 (large)", w: 6.0, l: 8.0, h: 2.7 },
  { label: "Room 4 — 3.2×6.4×2.3 (narrow/long)", w: 3.2, l: 6.4, h: 2.3 },
  { label: "Room 5 — 6.0×10.0×3.0 (very large)", w: 6.0, l: 10.0, h: 3.0 },
];

const SCALES = [
  { label: "Production / 1.00", scale: 1.00, isProduction: true },
  { label: "0.75", scale: 0.75, isProduction: false },
  { label: "0.65", scale: 0.65, isProduction: false },
  { label: "0.55", scale: 0.55, isProduction: false },
  { label: "0.50", scale: 0.50, isProduction: false },
  { label: "0.45", scale: 0.45, isProduction: false },
  { label: "0.40", scale: 0.40, isProduction: false },
];

const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const ENGINE_OPTIONS_BASE = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
  freqMinHz: 20,
  freqMaxHz: 200,
  pureDeterministicModalSum: true,
  disableLateField: true,
  disableModalPropagationPhase: true,
  modalSourceReferenceMode: "existing",
};

function geometryFor(room) {
  const roomDims = { widthM: room.w, lengthM: room.l, heightM: room.h };
  const sub = { x: room.w * 0.25, y: 0.3, z: 0.55, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  const seat = { x: room.w * 0.50, y: room.l * 0.55, z: 1.2 };
  return { roomDims, sub, seat };
}

function toSeries(engineResult) {
  return engineResult.freqsHz.map((f, i) => ({
    frequency: f,
    spl: 20 * Math.log10(Math.max(Math.sqrt(engineResult.complexPressure[i].re ** 2 + engineResult.complexPressure[i].im ** 2), 1e-10)),
  }));
}

function firstPeak(series) {
  const band = series.filter((p) => p.frequency >= 20 && p.frequency <= 80);
  for (let i = 1; i < band.length - 1; i++) {
    if (band[i].spl > band[i - 1].spl && band[i].spl > band[i + 1].spl) {
      return { peakFreq: band[i].frequency, peakSpl: band[i].spl, peakIdxInBand: i, band };
    }
  }
  return { peakFreq: null, peakSpl: null, peakIdxInBand: -1, band };
}

function shoulderAfterPeak(band, peakIdxInBand) {
  if (peakIdxInBand < 0) return { shoulderSpl: null };
  let minAfter = band[peakIdxInBand].spl;
  for (let i = peakIdxInBand + 1; i < band.length; i++) {
    if (band[i].spl < minAfter) minAfter = band[i].spl;
    else if (band[i].spl > minAfter + 0.3) break;
  }
  return { shoulderSpl: minAfter };
}

function firstMajorNull(series, loHz = 20, hiHz = 90) {
  const band = series.filter((p) => p.frequency >= loHz && p.frequency <= hiHz);
  if (band.length === 0) return { nullFreq: null, nullDepth: null };
  const min = band.reduce((best, p) => (p.spl < best.spl ? p : best), band[0]);
  return { nullFreq: min.frequency, nullDepth: min.spl };
}

function bandAverage(series, loHz, hiHz) {
  const band = series.filter((p) => p.frequency >= loHz && p.frequency <= hiHz);
  if (band.length === 0) return null;
  return band.reduce((s, p) => s + p.spl, 0) / band.length;
}

function bandRipple(series, loHz, hiHz) {
  const band = series.filter((p) => p.frequency >= loHz && p.frequency <= hiHz);
  if (band.length === 0) return null;
  const vals = band.map((p) => p.spl);
  return Math.max(...vals) - Math.min(...vals);
}

function fmt(v, d = 1) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }

export default function Case047FiveRoomBandwidthScaleCalibrationAudit() {
  const result = useMemo(() => {
    const perRoom = FIVE_ROOMS.map((room) => {
      const { roomDims, sub, seat } = geometryFor(room);

      const rows = SCALES.map((s) => {
        const engineResult = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, {
          ...ENGINE_OPTIONS_BASE,
          qStrategy: s.isProduction ? "production" : "rew_modal_bandwidth",
          rewModalBandwidthScale: s.scale,
        });
        const series = toSeries(engineResult);
        const { peakFreq, peakSpl, peakIdxInBand, band } = firstPeak(series);
        const { shoulderSpl } = shoulderAfterPeak(band, peakIdxInBand);
        const { nullFreq, nullDepth } = firstMajorNull(series);
        const avg2060 = bandAverage(series, 20, 60);
        const ripple60120 = bandRipple(series, 60, 120);
        const shoulderDropDb = (Number.isFinite(peakSpl) && Number.isFinite(shoulderSpl)) ? peakSpl - shoulderSpl : null;
        return { ...s, peakFreq, peakSpl, shoulderSpl, shoulderDropDb, nullFreq, nullDepth, avg2060, ripple60120 };
      });

      // Heuristic "visual REW match score 1-5": rank within this room by a combined
      // measure of broader skirts (lower shoulder drop) and lower high-band ripple —
      // both direction-of-travel indicators of a REW-like envelope. Best row = 5, worst = 1.
      const scored = rows.map((r) => {
        const dropTerm = Number.isFinite(r.shoulderDropDb) ? r.shoulderDropDb : 999;
        const rippleTerm = Number.isFinite(r.ripple60120) ? r.ripple60120 : 999;
        return { ...r, combinedScoreRaw: dropTerm + rippleTerm };
      });
      const sortedByRaw = [...scored].sort((a, b) => a.combinedScoreRaw - b.combinedScoreRaw);
      const n = sortedByRaw.length;
      sortedByRaw.forEach((r, i) => {
        // Lowest combinedScoreRaw (broadest/smoothest) → score 5, highest → score 1
        r.matchScore = n > 1 ? Math.round(5 - (i / (n - 1)) * 4) : 3;
      });
      const byScale = new Map(sortedByRaw.map((r) => [r.scale, r]));
      const finalRows = rows.map((r) => ({ ...r, matchScore: byScale.get(r.scale)?.matchScore ?? 3 }));

      const best = [...finalRows].sort((a, b) => b.matchScore - a.matchScore)[0];

      return { room, rows: finalRows, bestScale: best.scale, bestLabel: best.label };
    });

    const avgBestScale = perRoom.reduce((s, r) => s + r.bestScale, 0) / perRoom.length;
    const bestScales = perRoom.map((r) => r.bestScale);
    const spread = Math.max(...bestScales) - Math.min(...bestScales);
    const oneScaleWorksForAll = spread <= 0.15;

    let verdict;
    if (oneScaleWorksForAll) {
      verdict = "1. BANDWIDTH SCALE CONFIRMED";
    } else if (spread <= 0.35) {
      verdict = "2. BANDWIDTH SCALE HELPS BUT NEEDS ROOM-DEPENDENT RULE";
    } else {
      verdict = "3. BANDWIDTH SCALE RETIRED";
    }

    return { perRoom, avgBestScale, spread, oneScaleWorksForAll, verdict };
  }, []);

  return (
    <div style={{ border: "2px solid #0f766e", borderRadius: 10, background: "#f0fdfa", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#0f766e", fontSize: 13, marginBottom: 6 }}>
        Case 047 — Five-Room Bandwidth Scale Calibration (read-only)
      </div>
      <div style={{ color: "#115e59", marginBottom: 10 }}>
        REW-style Modal Bandwidth strategy only · flat 94 dB source · absorption 0.30 all surfaces · sub 25% width/front wall · seat 50% width / 55% length
      </div>

      {result.perRoom.map((r) => (
        <div key={r.room.label} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: "#0f766e", marginBottom: 4 }}>{r.room.label} — best scale: {r.bestLabel}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
              <thead>
                <tr style={{ background: "#ccfbf1" }}>
                  {["Scale", "1st peak Hz", "1st peak SPL", "Shoulder SPL", "Peak→shoulder drop", "1st null Hz", "1st null depth", "20–60Hz avg", "60–120Hz ripple", "REW match (1-5)"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "3px 5px", borderBottom: "1px solid #99f6e4" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row) => (
                  <tr key={row.label} style={{ background: row.isProduction ? "#f0fdfa" : undefined, fontWeight: row.scale === r.bestScale ? 700 : 400 }}>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #f0fdfa" }}>{row.label}{row.scale === r.bestScale ? " 🏆" : ""}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #f0fdfa" }}>{fmt(row.peakFreq)}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #f0fdfa" }}>{fmt(row.peakSpl)}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #f0fdfa" }}>{fmt(row.shoulderSpl)}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #f0fdfa" }}>{fmt(row.shoulderDropDb)}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #f0fdfa" }}>{fmt(row.nullFreq)}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #f0fdfa" }}>{fmt(row.nullDepth)}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #f0fdfa" }}>{fmt(row.avg2060)}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #f0fdfa" }}>{fmt(row.ripple60120)}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #f0fdfa" }}>{row.matchScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#ccfbf1", border: "1px solid #99f6e4" }}>
        <div style={{ fontWeight: 700, color: "#0f766e" }}>SUMMARY</div>
        <div style={{ marginTop: 4, color: "#115e59" }}>
          Best scale per room: {result.perRoom.map((r) => `${r.room.label.split(" — ")[0]}=${r.bestScale.toFixed(2)}`).join(", ")}<br/>
          Average best scale: {result.avgBestScale.toFixed(2)}<br/>
          Spread across rooms: {result.spread.toFixed(2)} — {result.oneScaleWorksForAll ? "one scale works across all rooms" : "best scale varies by room"}
        </div>
      </div>

      <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#134e4a", color: "#f0fdfa", border: "1px solid #0f766e" }}>
        <div style={{ fontWeight: 700 }}>TEST: Is effective modal Q/bandwidth a systematic REW-parity correction across rooms?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED: A single bandwidth scale broadens resonance skirts consistently across all five rooms, improving REW match score without shifting mode frequencies.<br/>
          ACTUAL: Best scale per room = {result.perRoom.map((r) => r.bestScale.toFixed(2)).join(", ")}; spread = {result.spread.toFixed(2)}.<br/>
          DELTA: {result.oneScaleWorksForAll ? "Best scales cluster tightly (≤0.15 spread)." : result.spread <= 0.35 ? "Best scales vary moderately (0.15–0.35 spread)." : "Best scales vary widely (>0.35 spread)."}<br/>
          SEVERITY: {result.verdict.startsWith("1") ? "INFORMATIONAL — confirmed" : result.verdict.startsWith("2") ? "MODERATE — needs room-dependent rule" : "LOW — retire"}<br/>
          NEXT FIX CANDIDATE: {result.verdict}
        </div>
      </div>
    </div>
  );
}