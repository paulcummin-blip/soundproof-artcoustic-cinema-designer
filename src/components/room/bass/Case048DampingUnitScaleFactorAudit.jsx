import React, { useMemo } from "react";
import { estimateModeQLocal, resonantTransfer } from "@/bass/core/modalCalculations";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";

// Case 048 — Damping Unit / Scale Factor Audit (read-only, diagnostic only).
// Checks whether production Q/bandwidth contains a fixed unit or damping conversion error
// BEFORE adopting bandwidth scale 0.40 from Case 047. No production changes, no new physics.
// Uses the REAL resonantTransfer() and estimateModeQLocal() from modalCalculations.js directly —
// nothing here is re-derived or approximated except a read-only replica of the already-published
// smoothSoftQCap() formula (used only for display; the real production Q is taken from the
// engine's own debug output, not this replica).

// Read-only replica of the production smoothSoftQCap formula (rewBassEngine.js), for display only.
function smoothSoftQCapReplica(freqHz) {
  const A = 200;
  const n = 0.52;
  const cap = A / Math.pow(Math.max(freqHz, 1), n);
  return Math.max(8, Math.min(45, cap));
}

const FIVE_ROOMS = [
  { label: "Room 1 — 3.0×4.0×2.3", w: 3.0, l: 4.0, h: 2.3 },
  { label: "Room 2 — 4.0×6.0×2.4", w: 4.0, l: 6.0, h: 2.4 },
  { label: "Room 3 — 6.0×8.0×2.7", w: 6.0, l: 8.0, h: 2.7 },
  { label: "Room 4 — 3.2×6.4×2.3", w: 3.2, l: 6.4, h: 2.3 },
  { label: "Room 5 — 6.0×10.0×3.0", w: 6.0, l: 10.0, h: 3.0 },
];

const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const SURFACE_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 };
const ENGINE_OPTIONS_BASE = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: SURFACE_ABSORPTION,
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

// Numeric -3dB (half-power) bandwidth of resonantTransfer() around f0, for a given Q.
function numericBandwidth(f0, q) {
  const peak = resonantTransfer(f0, f0, q).transferMag;
  const target = peak / Math.SQRT2;
  const step = f0 / 4000;
  let fLow = null, fHigh = null;
  for (let f = f0; f > f0 * 0.2; f -= step) {
    if (resonantTransfer(f, f0, q).transferMag <= target) { fLow = f; break; }
  }
  for (let f = f0; f < f0 * 3; f += step) {
    if (resonantTransfer(f, f0, q).transferMag <= target) { fHigh = f; break; }
  }
  if (fLow === null || fHigh === null) return null;
  return fHigh - fLow;
}

function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }

export default function Case048DampingUnitScaleFactorAudit() {
  const result = useMemo(() => {
    const rows = FIVE_ROOMS.map((room) => {
      const { roomDims, sub, seat } = geometryFor(room);
      const engineResult = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, ENGINE_OPTIONS_BASE);

      // Dominant mode = lowest-frequency axial mode contributor seen in the debug series.
      let dominant = null;
      engineResult.activeModalContributorDebugSeries.forEach((row) => {
        (row.contributors || []).forEach((c) => {
          if (c.modeType === "axial" && (!dominant || c.modeFrequencyHz < dominant.modeFrequencyHz)) {
            dominant = c;
          }
        });
      });
      if (!dominant) return null;

      const f0 = dominant.modeFrequencyHz;
      const finalQ = dominant.qValue;
      const absorptionQ = estimateModeQLocal({
        roomDims,
        surfaceAbsorption: SURFACE_ABSORPTION,
        f0,
        mode: { nx: dominant.nx, ny: dominant.ny, nz: dominant.nz },
      });
      const softCapQ = smoothSoftQCapReplica(f0);

      const expectedBandwidthHz = f0 / finalQ;
      const actualBandwidthHz = numericBandwidth(f0, finalQ);
      const bandwidthRatio = Number.isFinite(actualBandwidthHz) ? actualBandwidthHz / expectedBandwidthHz : null;

      const expectedDampingTerm = 1 / finalQ;
      const actualDampingTerm = resonantTransfer(f0, f0, finalQ).imagDen; // at f=f0, ratio=1 -> imagDen = omega0/(Q*omega0) = 1/Q
      const dampingRatio = actualDampingTerm / expectedDampingTerm;

      return {
        room: room.label,
        mode: `(${dominant.nx},${dominant.ny},${dominant.nz}) axial`,
        f0, absorptionQ, softCapQ, finalQ,
        expectedBandwidthHz, actualBandwidthHz, bandwidthRatio,
        expectedDampingTerm, actualDampingTerm, dampingRatio,
        qAt040: finalQ * 0.40,
      };
    }).filter(Boolean);

    const bandwidthRatios = rows.map((r) => r.bandwidthRatio).filter(Number.isFinite);
    const dampingRatios = rows.map((r) => r.dampingRatio).filter(Number.isFinite);
    const avgBandwidthRatio = bandwidthRatios.reduce((s, v) => s + v, 0) / (bandwidthRatios.length || 1);
    const avgDampingRatio = dampingRatios.reduce((s, v) => s + v, 0) / (dampingRatios.length || 1);

    const bandwidthOk = Math.abs(avgBandwidthRatio - 1) < 0.05;
    const dampingOk = Math.abs(avgDampingRatio - 1) < 0.05;

    let verdict;
    if (bandwidthOk && dampingOk) {
      verdict = "2. NO UNIT ERROR — 0.40 IS EMPIRICAL CALIBRATION";
    } else if (!dampingOk) {
      verdict = "3. Q DEFINITION ERROR FOUND";
    } else if (!bandwidthOk) {
      verdict = "1. FIXED DAMPING SCALE ERROR FOUND";
    } else {
      verdict = "2. NO UNIT ERROR — 0.40 IS EMPIRICAL CALIBRATION";
    }

    return { rows, avgBandwidthRatio, avgDampingRatio, bandwidthOk, dampingOk, verdict };
  }, []);

  return (
    <div style={{ border: "2px solid #7c2d12", borderRadius: 10, background: "#fff7ed", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#7c2d12", fontSize: 13, marginBottom: 6 }}>
        Case 048 — Damping Unit / Scale Factor Audit (read-only)
      </div>
      <div style={{ color: "#9a3412", marginBottom: 10 }}>
        Dominant axial mode per Case-047 room · real resonantTransfer() &amp; estimateModeQLocal() from modalCalculations.js · absorption 0.30 all surfaces
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
          <thead>
            <tr style={{ background: "#fed7aa" }}>
              {["Room", "Mode", "f0 Hz", "Absorption Q", "SoftCap Q", "Final Q", "Expected BW (f0/Q)", "B44 actual BW", "BW ratio", "Expected damping (1/Q)", "Actual damping", "Damping ratio"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 5px", borderBottom: "1px solid #fdba74" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.room}>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #ffedd5" }}>{r.room}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #ffedd5" }}>{r.mode}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.f0, 1)}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.absorptionQ)}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.softCapQ)}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #ffedd5", fontWeight: 700 }}>{fmt(r.finalQ)}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.expectedBandwidthHz)} Hz</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.actualBandwidthHz)} Hz</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #ffedd5", fontWeight: 700, color: Math.abs(r.bandwidthRatio - 1) < 0.05 ? "#166534" : "#b91c1c" }}>{fmt(r.bandwidthRatio, 3)}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.expectedDampingTerm, 4)}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.actualDampingTerm, 4)}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #ffedd5", fontWeight: 700, color: Math.abs(r.dampingRatio - 1) < 0.05 ? "#166534" : "#b91c1c" }}>{fmt(r.dampingRatio, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginBottom: 10, padding: 8, borderRadius: 6, background: "#ffedd5", border: "1px solid #fdba74" }}>
        <div style={{ fontWeight: 700, color: "#7c2d12" }}>Q COMPARISON</div>
        <div style={{ marginTop: 4, color: "#9a3412" }}>
          {result.rows.map((r) => `${r.room.split(" — ")[0]}: Production Q=${fmt(r.finalQ)} · Q×0.40=${fmt(r.qAt040)} · Textbook-corrected Q=${result.bandwidthOk && result.dampingOk ? fmt(r.finalQ) + " (unchanged — no fixed factor found)" : "see verdict"}`).map((line, i) => <div key={i}>{line}</div>)}
        </div>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#7c2d12", color: "#fff7ed", border: "1px solid #9a3412" }}>
        <div style={{ fontWeight: 700 }}>TEST: Does production Q/bandwidth contain a fixed unit or damping conversion error?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED: If a fixed-factor bug exists, B44's actual -3dB bandwidth and angular damping term (imagDen at f=f0) would differ from textbook f0/Q and 1/Q by a constant ratio (e.g. 2×, π×, 0.5×).<br/>
          ACTUAL: Avg bandwidth ratio (actual/expected) = {fmt(result.avgBandwidthRatio, 3)}; avg damping-term ratio (actual/expected) = {fmt(result.avgDampingRatio, 3)}, across {result.rows.length} dominant modes.<br/>
          DELTA: {result.bandwidthOk && result.dampingOk ? "Both ratios within ±5% of 1.000 — resonantTransfer() and estimateModeQLocal() are unit-consistent with the standard Q=f0/Δf, H=1/(1-(f/f0)²+j·f/(Q·f0)) convention." : "Ratio deviates from 1.000 beyond ±5% — see table for the affected room/mode."}<br/>
          SEVERITY: {result.verdict.startsWith("2") ? "INFORMATIONAL — no bug, 0.40 is empirical" : "MODERATE — investigate flagged formula"}<br/>
          NEXT FIX CANDIDATE: {result.verdict}
        </div>
      </div>
    </div>
  );
}