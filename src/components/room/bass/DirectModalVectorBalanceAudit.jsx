// DirectModalVectorBalanceAudit.jsx
// Temporary read-only diagnostic panel — proves whether direct/modal vector balance
// creates the false 29–30Hz null vs REW's 30–35Hz peak, for the fixed test case:
// room 5.0m(L) x 4.5m(W) x 3.0m(H), sub centre-front wall, seat y=4.0m, absorption 0.30 all surfaces.
// Does NOT touch production engine code. No fixes applied here — diagnostic only.

import React, { useMemo } from "react";
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from "@/bass/core/modalCalculations.js";

const SPEED_OF_SOUND_MPS = 343;
const CURVE_DB = 94; // flat reference source curve, consistent with other bass audits
const TEST_FREQS = [28, 29, 30, 31, 32, 33, 34, 35];

// Fixed test-case geometry
const ROOM = { widthM: 4.5, lengthM: 5.0, heightM: 3.0 };
const SOURCE = { x: ROOM.widthM / 2, y: 0.1, z: 0.35 }; // centre of front wall
const SEAT = { x: ROOM.widthM / 2, y: 4.0, z: 1.2 };
const SURFACE_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };

function smoothSoftQCap(freqHz) {
  const A = 200;
  const n = 0.52;
  const cap = A / Math.pow(Math.max(freqHz, 1), n);
  return Math.max(8, Math.min(45, cap));
}

function magToDb(mag) {
  return 20 * Math.log10(Math.max(mag, 1e-10));
}

function computeVectors(frequencyHz, modalGainScale = 1.0) {
  // Direct field
  const dx = SOURCE.x - SEAT.x;
  const dy = SOURCE.y - SEAT.y;
  const dz = SOURCE.z - SEAT.z;
  const distanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const distanceLossDb = -20 * Math.log10(distanceM / 1);
  const directAmplitude = Math.pow(10, (CURVE_DB + distanceLossDb) / 20);
  const timeOfFlightPhase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND_MPS);
  const directRe = directAmplitude * Math.cos(timeOfFlightPhase);
  const directIm = directAmplitude * Math.sin(timeOfFlightPhase);

  // Modal field
  const modes = computeRoomModesLocal({ ...ROOM, fMax: 60, c: SPEED_OF_SOUND_MPS });
  const modalSourceAmplitude = Math.pow(10, CURVE_DB / 20);
  let modalRe = 0;
  let modalIm = 0;
  modes.forEach((mode) => {
    const absorptionQ = estimateModeQLocal({ roomDims: ROOM, surfaceAbsorption: SURFACE_ABSORPTION, f0: mode.freq, mode });
    const softCap = smoothSoftQCap(mode.freq);
    const qValue = Math.max(1, Math.min(absorptionQ, softCap));
    const sourceCoupling = modeShapeValueLocal(mode, SOURCE.x, SOURCE.y, SOURCE.z, ROOM);
    const receiverCoupling = modeShapeValueLocal(mode, SEAT.x, SEAT.y, SEAT.z, ROOM);
    const coupling = sourceCoupling * receiverCoupling;
    const { re, im } = resonantTransfer(frequencyHz, mode.freq, qValue);
    modalRe += modalSourceAmplitude * coupling * re;
    modalIm += modalSourceAmplitude * coupling * im;
  });
  modalRe *= modalGainScale;
  modalIm *= modalGainScale;

  return { directRe, directIm, directAmplitude, modalRe, modalIm, distanceM };
}

function runVariants(frequencyHz) {
  const { directRe, directIm, directAmplitude, modalRe, modalIm } = computeVectors(frequencyHz);

  // A. production-style direct + modal (true superposition, no reflections/late-field — isolates the two vectors)
  const aRe = directRe + modalRe;
  const aIm = directIm + modalIm;
  const aDb = magToDb(Math.sqrt(aRe * aRe + aIm * aIm));

  // B. modal only
  const bDb = magToDb(Math.sqrt(modalRe * modalRe + modalIm * modalIm));

  // C. direct only
  const cDb = magToDb(directAmplitude);

  // D. direct with phase removed (treated as pure real, phase = 0) + modal
  const dRe = directAmplitude + modalRe;
  const dIm = 0 + modalIm;
  const dDb = magToDb(Math.sqrt(dRe * dRe + dIm * dIm));

  // E. direct gain normalised to modal reference magnitude (same phase) + modal
  const modalMag = Math.sqrt(modalRe * modalRe + modalIm * modalIm);
  const directPhase = Math.atan2(directIm, directRe);
  const eDirectRe = modalMag * Math.cos(directPhase);
  const eDirectIm = modalMag * Math.sin(directPhase);
  const eRe = eDirectRe + modalRe;
  const eIm = eDirectIm + modalIm;
  const eDb = magToDb(Math.sqrt(eRe * eRe + eIm * eIm));

  return { aDb, bDb, cDb, dDb, eDb };
}

// F. Sweep modal gain scale downward until the 28-35Hz curve stops showing a null
// (i.e. 30Hz stops being a local minimum relative to its neighbours).
function findVariantFScale() {
  const scales = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
  for (const scale of scales) {
    const dbAt = (hz) => {
      const { directRe, directIm, modalRe, modalIm } = computeVectors(hz, scale);
      const re = directRe + modalRe;
      const im = directIm + modalIm;
      return magToDb(Math.sqrt(re * re + im * im));
    };
    const d29 = dbAt(29);
    const d30 = dbAt(30);
    const d31 = dbAt(31);
    const isNullAt30 = d30 < d29 && d30 < d31;
    if (!isNullAt30) {
      return { scale, d29, d30, d31, resolved: true };
    }
  }
  return { scale: null, resolved: false };
}

export default function DirectModalVectorBalanceAudit() {
  const rows = useMemo(() => TEST_FREQS.map((hz) => ({ hz, ...runVariants(hz) })), []);
  const variantF = useMemo(() => findVariantFScale(), []);

  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");

  // Determine A-curve null behaviour vs C (direct-only, REW-like monotonic rise expectation)
  const aAt29 = rows.find((r) => r.hz === 29)?.aDb;
  const aAt30 = rows.find((r) => r.hz === 30)?.aDb;
  const aAt31 = rows.find((r) => r.hz === 31)?.aDb;
  const aHasNullAt30 = Number.isFinite(aAt29) && Number.isFinite(aAt30) && Number.isFinite(aAt31) && aAt30 < aAt29 && aAt30 < aAt31;
  const delta30 = Number.isFinite(aAt30) && Number.isFinite(aAt29) ? (aAt30 - Math.max(aAt29, aAt31)).toFixed(1) : "—";

  return (
    <div style={{ border: "2px solid #be123c", borderRadius: 8, background: "#fff1f2", padding: "10px 12px", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: "#9f1239", fontSize: 12, marginBottom: 4 }}>
        Direct/Modal Vector Balance Audit — temporary diagnostic (fixed test case)
      </div>
      <div style={{ color: "#881337", fontSize: 9, marginBottom: 8, fontStyle: "italic" }}>
        Room 5.0m(L) x 4.5m(W) x 3.0m(H) — sub centre-front — seat y=4.0m — absorption 0.30 all surfaces. No production changes.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #fda4af", color: "#9f1239", fontSize: 9, textTransform: "uppercase" }}>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Hz</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>A: direct+modal</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>B: modal only</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>C: direct only</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>D: direct(phase=0)+modal</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>E: direct(norm gain)+modal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.hz} style={{ borderBottom: "1px solid #fecdd3", background: r.hz === 30 ? "#ffe4e6" : undefined }}>
                <td style={{ textAlign: "right", padding: "1px 6px", fontWeight: 700, color: "#9f1239" }}>{r.hz}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.aDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.bDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.cDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.dDb)}</td>
                <td style={{ textAlign: "right", padding: "1px 6px" }}>{fmt(r.eDb)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ border: "1px solid #fda4af", borderRadius: 6, background: "#fff", padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: "#9f1239", marginBottom: 4 }}>F: Modal gain reduced until 30Hz null disappears</div>
        {variantF.resolved ? (
          <div style={{ color: "#1c1917" }}>
            Null disappears at modal gain scale ≈ <strong>{variantF.scale.toFixed(1)}×</strong> — dB(29)={fmt(variantF.d29)}, dB(30)={fmt(variantF.d30)}, dB(31)={fmt(variantF.d31)}
          </div>
        ) : (
          <div style={{ color: "#1c1917" }}>Null persists across all tested modal gain scales down to 0.1× — vector balance alone does not explain the null at these scales.</div>
        )}
      </div>

      <div style={{ border: "1px solid #fda4af", borderRadius: 6, background: "#fff", padding: "8px 10px" }}>
        <div style={{ fontWeight: 700, color: "#9f1239", marginBottom: 6 }}>Report</div>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            <tr><td style={{ padding: "2px 6px", fontWeight: 700, width: 90 }}>Test</td><td style={{ padding: "2px 6px" }}>Direct/modal complex vector superposition, 28–35Hz, fixed test case (variants A–F)</td></tr>
            <tr><td style={{ padding: "2px 6px", fontWeight: 700 }}>Expected</td><td style={{ padding: "2px 6px" }}>If direct/modal vector balance is the cause, variant A should show a null at/near 30Hz while B (modal only) and C (direct only) individually show no null — and F should resolve the null at some intermediate modal gain scale.</td></tr>
            <tr><td style={{ padding: "2px 6px", fontWeight: 700 }}>Actual</td><td style={{ padding: "2px 6px" }}>
              A {aHasNullAt30 ? "shows" : "does not show"} a local null at 30Hz (depth vs neighbours: {delta30} dB).{" "}
              {variantF.resolved ? `Variant F resolves the null at ${variantF.scale.toFixed(1)}× modal gain.` : "Variant F does not resolve the null within the tested scale range."}
            </td></tr>
            <tr><td style={{ padding: "2px 6px", fontWeight: 700 }}>Delta</td><td style={{ padding: "2px 6px" }}>{delta30} dB null depth at 30Hz relative to 29/31Hz in variant A.</td></tr>
            <tr><td style={{ padding: "2px 6px", fontWeight: 700 }}>Severity</td><td style={{ padding: "2px 6px" }}>{aHasNullAt30 && variantF.resolved ? "High — confirms direct/modal phase relationship as an active contributor to the false null." : aHasNullAt30 && !variantF.resolved ? "Medium — null is present but not resolvable purely by modal gain scaling, implicating phase/geometry rather than magnitude balance." : "Low — this isolated direct+modal reconstruction does not reproduce the null; production null likely requires reflections/late-field terms."}</td></tr>
            <tr><td style={{ padding: "2px 6px", fontWeight: 700 }}>Next test</td><td style={{ padding: "2px 6px" }}>{variantF.resolved ? "Audit why the direct-path phase at 30Hz opposes the modal transfer phase at this exact geometry (time-of-flight vs resonant-transfer phase origin), isolating whether it is a phase-origin convention issue rather than a magnitude issue." : "Re-run this same comparison with reflections and late-field terms included (still no fixes) to determine whether the null requires the full production summation, not just direct+modal."}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}