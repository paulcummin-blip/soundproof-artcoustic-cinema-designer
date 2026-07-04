import React, { useMemo } from "react";
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from "@/bass/core/modalCalculations.js";

// Case 039 — Modal Transfer Phase Function Audit.
// Read-only forensic audit. Does not touch production engine, graph, or state.
// Investigates only resonantTransfer() and the wrapper that converts its output
// into modal Re/Im (coupling-sign multiplication), per the case brief.

const C = 343;
const ROOM = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SEAT = { x: 2.5, y: 4.00, z: 1.2 };
const SUB = { x: 2.5, y: 0.15, z: 0.35 };
const ABSORPTION = { front: 0.30, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 };
const CURVE_DB = 94;
const TARGET_HZ = 30.40;
const TOP_N = 20;
const SAMPLE_FREQS = [28, 30.4, 34.4, 38.1, 42, 45];

function mag(re, im) { return Math.sqrt(re * re + im * im); }
function phaseDeg(re, im) { return (Math.atan2(im, re) * 180) / Math.PI; }
function fmt(v, d = 4) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }

function buildModes() {
  return computeRoomModesLocal({ ...ROOM, fMax: 200, c: C }).map((m) => ({
    ...m,
    qValue: estimateModeQLocal({ roomDims: ROOM, surfaceAbsorption: ABSORPTION, f0: m.freq, mode: m }),
  }));
}

function familyLabel(mode) {
  const order = (mode.nx > 0 ? 1 : 0) + (mode.ny > 0 ? 1 : 0) + (mode.nz > 0 ? 1 : 0);
  if (order === 1) {
    if (mode.ny > 0) return "axial length";
    if (mode.nx > 0) return "axial width";
    return "axial height";
  }
  if (order === 2) {
    if (mode.nx > 0 && mode.ny > 0) return "tangential L/W";
    if (mode.nx > 0 && mode.nz > 0) return "tangential W/H";
    return "tangential L/H";
  }
  return "oblique";
}

// Coupling sign/scalar as used in the production wrapper: sourceShape(sub) * receiverShape(seat).
function couplingScalar(mode) {
  const sc = modeShapeValueLocal(mode, SUB.x, SUB.y, SUB.z, ROOM);
  const rc = modeShapeValueLocal(mode, SEAT.x, SEAT.y, SEAT.z, ROOM);
  return sc * rc;
}

function modalSourceAmplitude() {
  return Math.pow(10, CURVE_DB / 20);
}

function modeFinalReIm(mode, freqHz) {
  const coupling = couplingScalar(mode);
  const t = resonantTransfer(freqHz, mode.freq, mode.qValue);
  const amp = modalSourceAmplitude();
  return { re: amp * coupling * t.re, im: amp * coupling * t.im, transfer: t, coupling };
}

// Continuous theoretical resonant phase from the same denominator terms resonantTransfer
// computes internally: atan2(-imagDen, realDen), i.e. the phase implied by the transfer
// function's own real/imag denominator components before any coupling sign is applied.
function expectedContinuousPhase(freqHz, f0, q) {
  const t = resonantTransfer(freqHz, f0, q);
  return (Math.atan2(-t.imagDen, t.realDen) * 180) / Math.PI;
}

export default function Case039ModalTransferPhaseFunctionAudit() {
  const result = useMemo(() => {
    const modes = buildModes();

    const withContribution = modes.map((m) => {
      const r = modeFinalReIm(m, TARGET_HZ);
      return { mode: m, ...r, magnitude: mag(r.re, r.im) };
    });

    const top20 = [...withContribution]
      .sort((a, b) => b.magnitude - a.magnitude)
      .slice(0, TOP_N)
      .map((c) => {
        const freqRatio = TARGET_HZ / c.mode.freq;
        const expectedPhase = expectedContinuousPhase(TARGET_HZ, c.mode.freq, c.mode.qValue);
        const actualTransferPhase = phaseDeg(c.transfer.re, c.transfer.im);
        const finalPhase = phaseDeg(c.re, c.im);
        return {
          key: `${c.mode.nx},${c.mode.ny},${c.mode.nz}`,
          mode: `(${c.mode.nx},${c.mode.ny},${c.mode.nz})`,
          type: familyLabel(c.mode),
          modeFreq: c.mode.freq,
          freqRatio,
          q: c.mode.qValue,
          expectedPhase,
          actualTransferPhase,
          finalPhase,
          re: c.re,
          im: c.im,
          magnitude: c.magnitude,
          coupling: c.coupling,
        };
      });

    // Critical check — does the SET of actualTransferPhase values (pre-coupling) form a
    // continuous spread, or do the FINAL (post-coupling) phases collapse near 0°/180°?
    const distToNearestBinary = (deg) => {
      const norm = ((deg % 360) + 360) % 360;
      const d0 = Math.min(norm, 360 - norm);
      const d180 = Math.abs(norm - 180);
      return Math.min(d0, d180);
    };
    const transferPhases = top20.map((r) => r.actualTransferPhase);
    const finalPhases = top20.map((r) => r.finalPhase);
    const transferSpreadDeg = Math.max(...transferPhases) - Math.min(...transferPhases);
    const avgDistFromBinaryTransfer = transferPhases.reduce((s, p) => s + distToNearestBinary(p), 0) / transferPhases.length;
    const avgDistFromBinaryFinal = finalPhases.reduce((s, p) => s + distToNearestBinary(p), 0) / finalPhases.length;
    const couplingIsBinarySign = top20.every((r) => Math.abs(Math.abs(r.coupling) - 1) < 0.5 || Math.abs(r.coupling) < 1e-6 || true);

    // Dominant 38.1 Hz axial length mode — nearest axial-length mode to 38.1 Hz.
    const axialLengthModes = modes.filter((m) => familyLabel(m) === "axial length");
    const mode381 = axialLengthModes.reduce(
      (best, m) => (Math.abs(m.freq - 38.1) < Math.abs((best?.freq ?? Infinity) - 38.1) ? m : best),
      null
    );

    const sampleRows = mode381
      ? SAMPLE_FREQS.map((f) => {
          const r = modeFinalReIm(mode381, f);
          return { freq: f, re: r.re, im: r.im, magnitude: mag(r.re, r.im), phase: phaseDeg(r.re, r.im) };
        })
      : [];

    // Verdict selection based purely on computed spreads (no interpretation beyond the four fixed options).
    let verdict;
    if (avgDistFromBinaryTransfer > 20) {
      verdict = "MODAL TRANSFER PHASE IS CONTINUOUS AND CORRECT";
    } else if (avgDistFromBinaryTransfer <= 20 && avgDistFromBinaryFinal <= 20 && transferSpreadDeg < 40) {
      verdict = "MODAL PHASE IS COLLAPSING TO SIGN-ONLY / BINARY BEHAVIOUR";
    } else if (avgDistFromBinaryTransfer > avgDistFromBinaryFinal + 10) {
      verdict = "MODAL TRANSFER PHASE IS BEING LOST AFTER resonantTransfer()";
    } else {
      verdict = "PHASE IS CORRECT — INVESTIGATE COUPLING SIGN ONLY";
    }

    const nextFixCandidate =
      verdict === "MODAL PHASE IS COLLAPSING TO SIGN-ONLY / BINARY BEHAVIOUR"
        ? "src/bass/core/modalCalculations.js → resonantTransfer() imagDen term (omega / (q * omega0)) — too small relative to realDen at these Q values, forcing near-0°/180° output"
        : verdict === "PHASE IS CORRECT — INVESTIGATE COUPLING SIGN ONLY"
        ? "modeShapeValueLocal() coupling sign multiplication in the modal Re/Im wrapper (src/bass/core/modalCalculations.js)"
        : verdict === "MODAL TRANSFER PHASE IS BEING LOST AFTER resonantTransfer()"
        ? "the wrapper that consumes resonantTransfer()'s {re, im} output (modal Re/Im assembly step)"
        : "no fix required — resonantTransfer() in src/bass/core/modalCalculations.js";

    return {
      top20,
      avgDistFromBinaryTransfer,
      avgDistFromBinaryFinal,
      transferSpreadDeg,
      mode381,
      sampleRows,
      verdict,
      nextFixCandidate,
    };
  }, []);

  return (
    <div style={{ border: "2px solid #7c2d12", borderRadius: 10, background: "#fff7ed", padding: 14, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: "#7c2d12", fontSize: 13, marginBottom: 6 }}>
        Case 039 — Modal Transfer Phase Function Audit (read-only)
      </div>
      <div style={{ color: "#9a3412", marginBottom: 10 }}>
        Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m · Sub centre-front ({SUB.x.toFixed(2)}, {SUB.y.toFixed(2)}, {SUB.z.toFixed(2)}) ·
        Seat ({SEAT.x.toFixed(2)}, {SEAT.y.toFixed(2)}, {SEAT.z.toFixed(2)}) · Absorption 0.30 all surfaces · Frequency {TARGET_HZ.toFixed(2)} Hz
      </div>

      {/* Top 20 modal contributors */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: "#7c2d12", marginBottom: 4 }}>Top {TOP_N} modal contributors @ {TARGET_HZ.toFixed(2)} Hz</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: "#ffedd5" }}>
                {["Mode", "Freq", "f/f0", "Q", "Expected phase (°)", "Actual transfer phase (°)", "Final phase (°)", "Re", "Im", "Magnitude"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #fed7aa" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.top20.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5", fontWeight: 700 }}>{r.mode}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.modeFreq, 2)} Hz</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.freqRatio, 3)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.q, 2)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.expectedPhase, 2)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.actualTransferPhase, 2)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.finalPhase, 2)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.re)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.im)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.magnitude)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Critical check */}
      <div style={{ marginBottom: 12, padding: 10, borderRadius: 6, background: "#ffedd5", border: "1px solid #fed7aa" }}>
        <div>Transfer-phase spread across top {TOP_N} (max − min): {fmt(result.transferSpreadDeg, 2)}°</div>
        <div>Average distance from nearest 0°/180° — actual transfer phase: {fmt(result.avgDistFromBinaryTransfer, 2)}°</div>
        <div>Average distance from nearest 0°/180° — final modal phase (post-coupling): {fmt(result.avgDistFromBinaryFinal, 2)}°</div>
      </div>

      {/* Dominant 38.1 Hz axial length mode sweep */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: "#7c2d12", marginBottom: 4 }}>
          Dominant axial length mode {result.mode381 ? `(${result.mode381.nx},${result.mode381.ny},${result.mode381.nz}) @ ${fmt(result.mode381.freq, 2)} Hz` : "(not found)"} — frequency sweep
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: "#ffedd5" }}>
                {["Freq (Hz)", "Re", "Im", "Magnitude", "Phase (°)"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #fed7aa" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.sampleRows.map((r) => (
                <tr key={r.freq}>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5", fontWeight: 700 }}>{r.freq}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.re)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.im)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.magnitude)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ffedd5" }}>{fmt(r.phase, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Verdict */}
      <div style={{ padding: 10, borderRadius: 6, background: "#ffedd5", border: "1px solid #fed7aa" }}>
        <div style={{ fontWeight: 700, color: "#7c2d12" }}>Verdict: {result.verdict}</div>
        <div style={{ marginTop: 6, color: "#9a3412" }}>Next fix candidate: {result.nextFixCandidate}</div>
      </div>
    </div>
  );
}