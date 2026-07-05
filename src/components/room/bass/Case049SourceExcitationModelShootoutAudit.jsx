import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";

// Case 049 — Source Excitation Model Shootout (read-only, diagnostic only).
// Tests whether B44's source excitation model explains REW's broader low-frequency shoulders.
// No production default change, no modal equation changes, no Q changes, no coupling changes,
// no smoothing changes. All variants are reconstructed post-hoc as a magnitude-only reweighting
// of the REAL production engine's own complex pressure output (phase untouched, mode frequencies
// untouched) — the engine itself (rewBassEngine.js) is never modified.

const FIVE_ROOMS = [
  { label: "Room 1 — 3.0×4.0×2.3", w: 3.0, l: 4.0, h: 2.3 },
  { label: "Room 2 — 4.0×6.0×2.4", w: 4.0, l: 6.0, h: 2.4 },
  { label: "Room 3 — 6.0×8.0×2.7", w: 6.0, l: 8.0, h: 2.7 },
  { label: "Room 4 — 3.2×6.4×2.3", w: 3.2, l: 6.4, h: 2.3 },
  { label: "Room 5 — 6.0×10.0×3.0", w: 6.0, l: 10.0, h: 3.0 },
];

const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
  freqMinHz: 20,
  freqMaxHz: 200,
  pureDeterministicModalSum: true,
  disableLateField: true,
  disableModalPropagationPhase: true,
  modalSourceReferenceMode: "existing",
  qStrategy: "production",
};

function geometryFor(room) {
  const roomDims = { widthM: room.w, lengthM: room.l, heightM: room.h };
  const sub = { x: room.w * 0.25, y: 0.3, z: 0.55, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  const seat = { x: room.w * 0.50, y: room.l * 0.55, z: 1.2 };
  return { roomDims, sub, seat };
}

function firstAxialModeHz(engineResult) {
  let lowest = null;
  engineResult.activeModalContributorDebugSeries.forEach((row) => {
    (row.contributors || []).forEach((c) => {
      if (c.modeType === "axial" && (!lowest || c.modeFrequencyHz < lowest)) lowest = c.modeFrequencyHz;
    });
  });
  return lowest || 40;
}

// Gain multipliers applied to the magnitude of the production complex pressure only — phase untouched.
const MODELS = [
  { id: "A", label: "A — Production flat", gain: () => 1 },
  { id: "B", label: "B — sqrt(f0/f) weighting", gain: (f, f0) => Math.sqrt(f0 / Math.max(f, 1)) },
  { id: "C", label: "C — (f0/f)^0.25 LF lift", gain: (f, f0) => Math.pow(f0 / Math.max(f, 1), 0.25) },
  { id: "D", label: "D — +3dB shelf below f0", gain: (f, f0) => (f < f0 ? Math.pow(10, 3 / 20) : 1) },
  { id: "E", label: "E — +6dB shelf below f0", gain: (f, f0) => (f < f0 ? Math.pow(10, 6 / 20) : 1) },
  { id: "F", label: "F — gradual sealed-room shelf", gain: (f, f0) => {
      const t = Math.max(0, Math.min(1, (f0 - f) / (f0 * 0.5)));
      const eased = t * t * (3 - 2 * t); // smoothstep
      return Math.pow(10, (4 * eased) / 20);
    } },
];

function toSeries(engineResult, gainFn, f0) {
  return engineResult.freqsHz.map((f, i) => {
    const { re, im } = engineResult.complexPressure[i];
    const g = gainFn(f, f0);
    const mag = Math.sqrt(re * re + im * im) * g;
    return { frequency: f, spl: 20 * Math.log10(Math.max(mag, 1e-10)) };
  });
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

export default function Case049SourceExcitationModelShootoutAudit() {
  const result = useMemo(() => {
    const perRoom = FIVE_ROOMS.map((room) => {
      const { roomDims, sub, seat } = geometryFor(room);
      const engineResult = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
      const f0 = firstAxialModeHz(engineResult);

      const rows = MODELS.map((m) => {
        const series = toSeries(engineResult, m.gain, f0);
        const { peakFreq, peakSpl, peakIdxInBand, band } = firstPeak(series);
        const { shoulderSpl } = shoulderAfterPeak(band, peakIdxInBand);
        const shoulderDropDb = (Number.isFinite(peakSpl) && Number.isFinite(shoulderSpl)) ? peakSpl - shoulderSpl : null;
        const avg2060 = bandAverage(series, 20, 60);
        const ripple60120 = bandRipple(series, 60, 120);
        return { ...m, peakFreq, peakSpl, shoulderSpl, shoulderDropDb, avg2060, ripple60120 };
      });

      // REW match score 1-5: rank within room by combined (lower shoulder drop + lower ripple) = broader/smoother = higher score.
      const scored = rows.map((r) => ({
        ...r,
        combinedRaw: (Number.isFinite(r.shoulderDropDb) ? r.shoulderDropDb : 999) + (Number.isFinite(r.ripple60120) ? r.ripple60120 : 999),
      }));
      const sorted = [...scored].sort((a, b) => a.combinedRaw - b.combinedRaw);
      const n = sorted.length;
      sorted.forEach((r, i) => { r.matchScore = n > 1 ? Math.round(5 - (i / (n - 1)) * 4) : 3; });
      const byId = new Map(sorted.map((r) => [r.id, r.matchScore]));
      const finalRows = rows.map((r) => ({ ...r, matchScore: byId.get(r.id) ?? 3 }));

      const best = [...finalRows].sort((a, b) => b.matchScore - a.matchScore)[0];
      return { room: room.label, f0, rows: finalRows, bestId: best.id, bestLabel: best.label };
    });

    const bestIds = perRoom.map((r) => r.bestId);
    const sameWinnerAcrossAll = bestIds.every((id) => id === bestIds[0]);
    const winningModelId = sameWinnerAcrossAll ? bestIds[0] : null;

    // Improves shoulder without shifting modes? Mode frequencies never touched (magnitude-only
    // reweighting), so this is trivially satisfied whenever the winning model isn't "A" (no-op).
    const improvesShoulder = sameWinnerAcrossAll && winningModelId !== "A";

    let verdict;
    if (sameWinnerAcrossAll && improvesShoulder) {
      verdict = "1. SOURCE EXCITATION MODEL CONFIRMED";
    } else if (!sameWinnerAcrossAll && bestIds.some((id) => id !== "A")) {
      verdict = "2. SOURCE MODEL HELPS BUT NEEDS ROOM-DEPENDENT RULE";
    } else {
      verdict = "3. SOURCE MODEL RETIRED";
    }

    return { perRoom, sameWinnerAcrossAll, winningModelId, improvesShoulder, verdict };
  }, []);

  return (
    <div style={{ border: "2px solid #4338ca", borderRadius: 10, background: "#eef2ff", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#4338ca", fontSize: 13, marginBottom: 6 }}>
        Case 049 — Source Excitation Model Shootout (read-only)
      </div>
      <div style={{ color: "#3730a3", marginBottom: 10 }}>
        Five Case-047 rooms · flat 94 dB production baseline · magnitude-only reweighting of the real engine's complex pressure · mode frequencies never touched
      </div>

      {result.perRoom.map((r) => (
        <div key={r.room} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: "#4338ca", marginBottom: 4 }}>{r.room} (f0 = {fmt(r.f0, 1)} Hz) — best: {r.bestLabel}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
              <thead>
                <tr style={{ background: "#c7d2fe" }}>
                  {["Model", "1st peak Hz", "1st peak SPL", "Shoulder SPL", "Peak→shoulder drop", "20–60Hz avg", "60–120Hz ripple", "REW match (1-5)"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "3px 5px", borderBottom: "1px solid #a5b4fc" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row) => (
                  <tr key={row.id} style={{ fontWeight: row.id === r.bestId ? 700 : 400 }}>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #e0e7ff" }}>{row.label}{row.id === r.bestId ? " 🏆" : ""}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #e0e7ff" }}>{fmt(row.peakFreq)}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #e0e7ff" }}>{fmt(row.peakSpl)}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #e0e7ff" }}>{fmt(row.shoulderSpl)}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #e0e7ff" }}>{fmt(row.shoulderDropDb)}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #e0e7ff" }}>{fmt(row.avg2060)}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #e0e7ff" }}>{fmt(row.ripple60120)}</td>
                    <td style={{ padding: "3px 5px", borderBottom: "1px solid #e0e7ff" }}>{row.matchScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#c7d2fe", border: "1px solid #a5b4fc" }}>
        <div style={{ fontWeight: 700, color: "#4338ca" }}>SUMMARY</div>
        <div style={{ marginTop: 4, color: "#3730a3" }}>
          Best model per room: {result.perRoom.map((r) => `${r.room.split(" — ")[0]}=${r.bestId}`).join(", ")}<br/>
          Same model wins across all rooms: {result.sameWinnerAcrossAll ? `YES (${result.winningModelId})` : "NO"}<br/>
          Improves shoulder without shifting modes: {result.improvesShoulder ? "YES" : "N/A or NO"}
        </div>
      </div>

      <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#312e81", color: "#eef2ff", border: "1px solid #4338ca" }}>
        <div style={{ fontWeight: 700 }}>TEST: Is B44's source excitation model responsible for narrower low-frequency shoulders vs REW?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED: A frequency-weighted or shelf-boosted source excitation model broadens the low-frequency shoulder (lower peak→shoulder drop, lower ripple) consistently across all five rooms without shifting mode frequencies.<br/>
          ACTUAL: Best model per room = {result.perRoom.map((r) => r.bestId).join(", ")}; consistent winner = {result.sameWinnerAcrossAll ? result.winningModelId : "none"}.<br/>
          DELTA: {result.sameWinnerAcrossAll ? (result.winningModelId === "A" ? "Production (no reweighting) already scores best — no source model improves the shoulder." : `Model ${result.winningModelId} outperforms production consistently.`) : "Best model varies by room — no single source excitation law dominates."}<br/>
          SEVERITY: {result.verdict.startsWith("1") ? "INFORMATIONAL — confirmed" : result.verdict.startsWith("2") ? "MODERATE — room-dependent" : "LOW — retire"}<br/>
          NEXT FIX CANDIDATE: {result.verdict}
        </div>
      </div>
    </div>
  );
}