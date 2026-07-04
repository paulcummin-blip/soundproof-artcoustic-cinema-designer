import React, { useMemo } from "react";
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from "@/bass/core/modalCalculations.js";

// Case 043 — Source / Receiver Coupling Equation Parity Audit.
// Read-only forensic audit. Does not touch production engine, graph, or state.
//
// Production uses ONE function, modeShapeValueLocal(mode, x, y, z, roomDims), for BOTH
// source coupling (evaluated at the sub position) and receiver coupling (evaluated at the
// seat position): shapeX * shapeY * shapeZ, where each axis term is
// cos(n * PI * coord / dimension) when n > 0, else 1.
//
// This is exactly the standard rigid-wall (Neumann boundary, zero particle velocity at
// each wall) rectangular-room pressure eigenfunction from Morse & Ingard:
//   psi(x,y,z) = cos(nx*pi*x/Lx) * cos(ny*pi*y/Ly) * cos(nz*pi*z/Lz)
// with coordinate origin at the room corner (x=0,y=0,z=0), unit amplitude normalization
// (no 1/sqrt(V) or RMS scaling applied), and pressure basis (not particle velocity).
//
// Because production calls the identical function/equation for both source and receiver
// evaluation points, "textbook" here is computed via the exact same formula applied
// independently — this audit exists to prove that identity numerically, not to introduce
// a second competing equation.

const C = 343;
const ROOM = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SUB = { x: 2.50, y: 0.15, z: 0.35 };
const SEAT = { x: 2.50, y: 4.00, z: 1.20 };
const ABSORPTION = { front: 0.30, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 };
const CURVE_DB = 94;
const MODE_MAX_HZ = 120;
const TARGET_LO_HZ = 30.4;
const TARGET_HI_HZ = 34.4;
const DIFF_TOLERANCE = 1e-9;

function fmt(v, d = 4) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }
function mag(re, im) { return Math.sqrt(re * re + im * im); }
function splDb(re, im) { return 20 * Math.log10(Math.max(mag(re, im), 1e-10)); }

// Textbook rectangular-room rigid-wall pressure eigenfunction — identical formula to
// production's modeShapeValueLocal, evaluated independently for audit purposes.
function textbookModeShape(mode, x, y, z, roomDims) {
  const widthM = Math.max(1e-6, roomDims.widthM);
  const lengthM = Math.max(1e-6, roomDims.lengthM);
  const heightM = Math.max(1e-6, roomDims.heightM);
  const shapeX = mode.nx > 0 ? Math.cos(mode.nx * Math.PI * x / widthM) : 1;
  const shapeY = mode.ny > 0 ? Math.cos(mode.ny * Math.PI * y / lengthM) : 1;
  const shapeZ = mode.nz > 0 ? Math.cos(mode.nz * Math.PI * z / heightM) : 1;
  return shapeX * shapeY * shapeZ;
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

function buildModes() {
  return computeRoomModesLocal({ ...ROOM, fMax: MODE_MAX_HZ, c: C }).map((m) => ({
    ...m,
    qValue: estimateModeQLocal({ roomDims: ROOM, surfaceAbsorption: ABSORPTION, f0: m.freq, mode: m }),
  }));
}

// Sums modal contribution at freqHz for a given (source coupling fn, receiver coupling fn) pair.
function modalVector(modes, freqHz, sourceFn, receiverFn) {
  const modalSourceAmplitude = Math.pow(10, CURVE_DB / 20);
  let sumRe = 0, sumIm = 0;
  modes.forEach((m) => {
    const sc = sourceFn(m, SUB.x, SUB.y, SUB.z, ROOM);
    const rc = receiverFn(m, SEAT.x, SEAT.y, SEAT.z, ROOM);
    const t = resonantTransfer(freqHz, m.freq, m.qValue);
    sumRe += modalSourceAmplitude * sc * rc * t.re;
    sumIm += modalSourceAmplitude * sc * rc * t.im;
  });
  return { re: sumRe, im: sumIm };
}

function directVector(freqHz) {
  const dx = SUB.x - SEAT.x, dy = SUB.y - SEAT.y, dz = SUB.z - SEAT.z;
  const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const distanceLossDb = -20 * Math.log10(distanceM);
  const amp = Math.pow(10, (CURVE_DB + distanceLossDb) / 20);
  const phase = -2 * Math.PI * freqHz * (distanceM / C);
  return { re: amp * Math.cos(phase), im: amp * Math.sin(phase) };
}

function finalVector(modes, freqHz, sourceFn, receiverFn) {
  const d = directVector(freqHz);
  const mo = modalVector(modes, freqHz, sourceFn, receiverFn);
  return { re: d.re + mo.re, im: d.im + mo.im };
}

function evaluateVariant(label, key, modes, sourceFn, receiverFn) {
  const vLo = finalVector(modes, TARGET_LO_HZ, sourceFn, receiverFn);
  const vHi = finalVector(modes, TARGET_HI_HZ, sourceFn, receiverFn);
  const loDb = splDb(vLo.re, vLo.im);
  const hiDb = splDb(vHi.re, vHi.im);
  const nullDepthDb = hiDb - loDb;
  const peakDb = Math.max(loDb, hiDb);
  return { key, label, loDb, hiDb, nullDepthDb, peakDb };
}

export default function Case043SourceReceiverCouplingParityAudit() {
  const result = useMemo(() => {
    const modes = buildModes();

    const rows = modes.map((m) => {
      const prodSource = modeShapeValueLocal(m, SUB.x, SUB.y, SUB.z, ROOM);
      const textbookSource = textbookModeShape(m, SUB.x, SUB.y, SUB.z, ROOM);
      const prodReceiver = modeShapeValueLocal(m, SEAT.x, SEAT.y, SEAT.z, ROOM);
      const textbookReceiver = textbookModeShape(m, SEAT.x, SEAT.y, SEAT.z, ROOM);
      return {
        key: `${m.nx},${m.ny},${m.nz}`,
        mode: `(${m.nx},${m.ny},${m.nz})`,
        type: familyLabel(m),
        freq: m.freq,
        prodSource,
        textbookSource,
        sourceDiff: Math.abs(prodSource - textbookSource),
        prodReceiver,
        textbookReceiver,
        receiverDiff: Math.abs(prodReceiver - textbookReceiver),
      };
    });

    const sourceMatches = rows.every((r) => r.sourceDiff <= DIFF_TOLERANCE);
    const receiverMatches = rows.every((r) => r.receiverDiff <= DIFF_TOLERANCE);

    // Controlled variants — since production and textbook use the identical formula,
    // A (textbook only), B (production replaced with textbook), and C (textbook replaced
    // with production) all reduce to the same calls; computed independently for the record.
    const testA = evaluateVariant("A — Textbook equations only", "A", modes, textbookModeShape, textbookModeShape);
    const testB = evaluateVariant("B — Production replaced with textbook", "B", modes, textbookModeShape, textbookModeShape);
    const testC = evaluateVariant("C — Textbook replaced with production", "C", modes, modeShapeValueLocal, modeShapeValueLocal);
    const production = evaluateVariant("Production (baseline)", "PROD", modes, modeShapeValueLocal, modeShapeValueLocal);

    let verdict;
    if (sourceMatches && receiverMatches) verdict = "Production coupling equals textbook.";
    else if (!sourceMatches && receiverMatches) verdict = "Source coupling differs.";
    else if (sourceMatches && !receiverMatches) verdict = "Receiver coupling differs.";
    else verdict = "Both differ.";

    const offendingTerm = sourceMatches && receiverMatches
      ? null
      : !sourceMatches
      ? "modeShapeValueLocal() axis term for the source (sub) evaluation call"
      : "modeShapeValueLocal() axis term for the receiver (seat) evaluation call";

    return {
      rows, sourceMatches, receiverMatches, verdict, offendingTerm,
      testA, testB, testC, production,
    };
  }, []);

  const severityFor = (diff) => (diff <= DIFF_TOLERANCE ? "PASS" : diff <= 0.01 ? "MODERATE" : "CRITICAL");

  return (
    <div style={{ border: "2px solid #164e63", borderRadius: 10, background: "#ecfeff", padding: 14, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: "#164e63", fontSize: 13, marginBottom: 6 }}>
        Case 043 — Source / Receiver Coupling Equation Parity Audit (read-only)
      </div>
      <div style={{ color: "#155e75", marginBottom: 10 }}>
        Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m · Sub ({SUB.x.toFixed(2)}, {SUB.y.toFixed(2)}, {SUB.z.toFixed(2)}) · Seat ({SEAT.x.toFixed(2)}, {SEAT.y.toFixed(2)}, {SEAT.z.toFixed(2)}) ·
        Absorption 0.30 all surfaces · Modes below {MODE_MAX_HZ} Hz
      </div>

      {/* Equation metadata — reported once since identical for every mode */}
      <div style={{ marginBottom: 12, padding: 10, borderRadius: 6, background: "#cffafe", border: "1px solid #a5f3fc" }}>
        <div>Axis equations actually used: shapeX·shapeY·shapeZ, each cos(n·π·coord/dimension) when n&gt;0, else 1 (modeShapeValueLocal)</div>
        <div>Coordinate origin: room corner (x=0, y=0, z=0)</div>
        <div>Pressure or velocity basis: pressure eigenfunction (rigid-wall / Neumann boundary cosine modes)</div>
        <div>Normalization: unit amplitude at antinode — no 1/√V or RMS scaling applied</div>
        <div>Boundary assumptions: perfectly rigid walls (zero normal particle velocity at each surface)</div>
      </div>

      {/* Per-mode table */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: "#164e63", marginBottom: 4 }}>Per-mode coupling parity (below {MODE_MAX_HZ} Hz)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: "#cffafe" }}>
                {["Mode", "Freq", "Prod source", "Textbook source", "Δ source", "Prod receiver", "Textbook receiver", "Δ receiver"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #a5f3fc" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe", fontWeight: 700 }}>{r.mode}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>{fmt(r.freq, 2)} Hz</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>{fmt(r.prodSource)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>{fmt(r.textbookSource)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>{fmt(r.sourceDiff, 8)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>{fmt(r.prodReceiver)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>{fmt(r.textbookReceiver)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>{fmt(r.receiverDiff, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fixed output format */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#cffafe" }}>
              {["TEST", "EXPECTED", "ACTUAL", "DELTA", "SEVERITY", "NEXT TEST"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #a5f3fc" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe", fontWeight: 700 }}>Source coupling parity</td>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>Δ ≤ {DIFF_TOLERANCE} for all modes</td>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>max Δ = {fmt(Math.max(...result.rows.map((r) => r.sourceDiff)), 8)}</td>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>{result.sourceMatches ? "0" : "nonzero"}</td>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe", fontWeight: 700, color: result.sourceMatches ? "#166534" : "#b91c1c" }}>{result.sourceMatches ? "PASS" : "CRITICAL"}</td>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>{result.sourceMatches ? "receiver coupling parity" : "isolate source axis term"}</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe", fontWeight: 700 }}>Receiver coupling parity</td>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>Δ ≤ {DIFF_TOLERANCE} for all modes</td>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>max Δ = {fmt(Math.max(...result.rows.map((r) => r.receiverDiff)), 8)}</td>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>{result.receiverMatches ? "0" : "nonzero"}</td>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe", fontWeight: 700, color: result.receiverMatches ? "#166534" : "#b91c1c" }}>{result.receiverMatches ? "PASS" : "CRITICAL"}</td>
              <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>{result.receiverMatches ? "variant SPL tests" : "isolate receiver axis term"}</td>
            </tr>
            {[result.production, result.testA, result.testB, result.testC].map((t) => (
              <tr key={t.key}>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe", fontWeight: 700 }}>{t.label}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>matches production SPL</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>
                  SPL@{TARGET_LO_HZ}Hz={fmt(t.loDb, 2)}dB · SPL@{TARGET_HI_HZ}Hz={fmt(t.hiDb, 2)}dB · null depth={fmt(t.nullDepthDb, 2)}dB · peak={fmt(t.peakDb, 2)}dB
                </td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>
                  {t.key === "PROD" ? "—" : fmt(Math.abs(t.loDb - result.production.loDb), 4) + " dB"}
                </td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe", fontWeight: 700, color: "#166534" }}>
                  {t.key === "PROD" || Math.abs(t.loDb - result.production.loDb) <= 0.01 ? "PASS" : "CRITICAL"}
                </td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #cffafe" }}>
                  {t.key === "C" ? "final verdict" : "next variant"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: "#cffafe", border: "1px solid #a5f3fc" }}>
        <div style={{ fontWeight: 700, color: "#164e63" }}>Verdict: {result.verdict}</div>
        <div style={{ marginTop: 6, color: "#155e75" }}>
          {result.offendingTerm ? `Offending term: ${result.offendingTerm}` : "No offending term — production and textbook equations are numerically identical."}
        </div>
      </div>
    </div>
  );
}