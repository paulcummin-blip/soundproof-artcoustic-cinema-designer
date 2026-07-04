import React, { useMemo } from "react";
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from "@/bass/core/modalCalculations.js";

// Case 040 — Off-Resonance Modal Magnitude Falloff Audit.
// Read-only forensic audit. Does not touch production engine, graph, or state.

const C = 343;
const ROOM = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SEAT = { x: 2.5, y: 4.00, z: 1.2 };
const SUB = { x: 2.5, y: 0.15, z: 0.35 };
const ABSORPTION = { front: 0.30, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 };
const CURVE_DB = 94;
const TARGET_LO_HZ = 30.40;
const TARGET_HI_HZ = 34.40;
const NULL_GAP_THRESHOLD_DB = 6;
const TABLE_LO_HZ = 34;
const TABLE_HI_HZ = 200;
const RIPPLE_SAMPLE_FREQS = [20, 30, 40, 55, 70, 85, 100, 120];

function mag(re, im) { return Math.sqrt(re * re + im * im); }
function splDb(re, im) { return 20 * Math.log10(Math.max(mag(re, im), 1e-10)); }
function fmt(v, d = 4) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }

function directVector(freqHz) {
  const dx = SUB.x - SEAT.x, dy = SUB.y - SEAT.y, dz = SUB.z - SEAT.z;
  const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const distanceLossDb = -20 * Math.log10(distanceM);
  const amp = Math.pow(10, (CURVE_DB + distanceLossDb) / 20);
  const phase = -2 * Math.PI * freqHz * (distanceM / C);
  return { re: amp * Math.cos(phase), im: amp * Math.sin(phase) };
}

function reflectionVector(freqHz) {
  const W = ROOM.widthM, L = ROOM.lengthM, H = ROOM.heightM;
  const walls = [
    { imgX: 2 * W - SUB.x, imgY: SUB.y, imgZ: SUB.z, alpha: ABSORPTION.right },
    { imgX: -SUB.x, imgY: SUB.y, imgZ: SUB.z, alpha: ABSORPTION.left },
    { imgX: SUB.x, imgY: 2 * L - SUB.y, imgZ: SUB.z, alpha: ABSORPTION.back },
    { imgX: SUB.x, imgY: -SUB.y, imgZ: SUB.z, alpha: ABSORPTION.front },
    { imgX: SUB.x, imgY: SUB.y, imgZ: 2 * H - SUB.z, alpha: ABSORPTION.ceiling },
    { imgX: SUB.x, imgY: SUB.y, imgZ: -SUB.z, alpha: ABSORPTION.floor },
  ];
  const coherenceWeight = Math.min(0.75, Math.max(0.25, 0.25 + 0.5 * Math.max(0, Math.min(1, (freqHz - 20) / 140))));
  let sumRe = 0, sumIm = 0;
  walls.forEach((w) => {
    const dx = w.imgX - SEAT.x, dy = w.imgY - SEAT.y, dz = w.imgZ - SEAT.z;
    const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const distanceLossDb = -20 * Math.log10(distanceM);
    const rc = Math.sqrt(Math.max(0, 1 - w.alpha));
    const amp = Math.pow(10, (CURVE_DB + distanceLossDb) / 20) * rc;
    const phase = -2 * Math.PI * freqHz * (distanceM / C);
    sumRe += coherenceWeight * amp * Math.cos(phase);
    sumIm += coherenceWeight * amp * Math.sin(phase);
  });
  return { re: sumRe, im: sumIm };
}

function buildModes() {
  return computeRoomModesLocal({ ...ROOM, fMax: 200, c: C }).map((m) => ({
    ...m,
    qValue: estimateModeQLocal({ roomDims: ROOM, surfaceAbsorption: ABSORPTION, f0: m.freq, mode: m }),
    order: m.nx + m.ny + m.nz,
  }));
}

function modeParts(mode, freqHz) {
  const modalSourceAmplitude = Math.pow(10, CURVE_DB / 20);
  const sourceCoupling = modeShapeValueLocal(mode, SUB.x, SUB.y, SUB.z, ROOM);
  const receiverCoupling = modeShapeValueLocal(mode, SEAT.x, SEAT.y, SEAT.z, ROOM);
  const transfer = resonantTransfer(freqHz, mode.freq, mode.qValue);
  return { modalSourceAmplitude, sourceCoupling, receiverCoupling, transfer };
}

function modeReIm(mode, freqHz, weightFn) {
  const p = modeParts(mode, freqHz);
  const weight = weightFn ? weightFn(mode) : 1;
  const re = p.modalSourceAmplitude * p.sourceCoupling * p.receiverCoupling * p.transfer.re * weight;
  const im = p.modalSourceAmplitude * p.sourceCoupling * p.receiverCoupling * p.transfer.im * weight;
  return { re, im };
}

function modalVectorFromModes(modes, freqHz, filterFn, weightFn) {
  let sumRe = 0, sumIm = 0;
  modes.forEach((m) => {
    if (filterFn && !filterFn(m)) return;
    const c = modeReIm(m, freqHz, weightFn);
    sumRe += c.re;
    sumIm += c.im;
  });
  return { re: sumRe, im: sumIm };
}

function finalVector(modes, freqHz, filterFn, weightFn) {
  const d = directVector(freqHz);
  const r = reflectionVector(freqHz);
  const mo = modalVectorFromModes(modes, freqHz, filterFn, weightFn);
  return { re: d.re + r.re + mo.re, im: d.im + r.im + mo.im };
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

function computeRipple(modes, filterFn, weightFn) {
  const spls = RIPPLE_SAMPLE_FREQS.map((f) => {
    const v = finalVector(modes, f, filterFn, weightFn);
    return splDb(v.re, v.im);
  });
  return Math.max(...spls) - Math.min(...spls);
}

function buildVariantRow(label, key, modes, filterFn, weightFn) {
  const vLo = finalVector(modes, TARGET_LO_HZ, filterFn, weightFn);
  const vHi = finalVector(modes, TARGET_HI_HZ, filterFn, weightFn);
  const loDb = splDb(vLo.re, vLo.im);
  const hiDb = splDb(vHi.re, vHi.im);
  const gapDb = hiDb - loDb;
  const ripple = computeRipple(modes, filterFn, weightFn);
  return { key, label, loDb, hiDb, gapDb, nullRemains: gapDb >= NULL_GAP_THRESHOLD_DB, ripple };
}

export default function Case040OffResonanceModalMagnitudeFalloffAudit() {
  const result = useMemo(() => {
    const modes = buildModes();

    const tableModes = modes.filter((m) => m.freq >= TABLE_LO_HZ && m.freq <= TABLE_HI_HZ);
    const totalModalVec = modalVectorFromModes(modes, TARGET_LO_HZ, null, null);
    const totalModalMag = mag(totalModalVec.re, totalModalVec.im);

    const tableRows = tableModes
      .map((m) => {
        const p = modeParts(m, TARGET_LO_HZ);
        const c = modeReIm(m, TARGET_LO_HZ, null);
        const finalMag = mag(c.re, c.im);
        return {
          key: `${m.nx},${m.ny},${m.nz}`,
          mode: `(${m.nx},${m.ny},${m.nz})`,
          type: familyLabel(m),
          modeFreq: m.freq,
          freqRatio: TARGET_LO_HZ / m.freq,
          q: m.qValue,
          transferMag: p.transfer.transferMag,
          modalSourceAmplitude: p.modalSourceAmplitude,
          sourceCoupling: p.sourceCoupling,
          receiverCoupling: p.receiverCoupling,
          finalMag,
          pctOfTotal: totalModalMag > 0 ? (finalMag / totalModalMag) * 100 : 0,
        };
      })
      .sort((a, b) => b.finalMag - a.finalMag);

    // Variants.
    const rowA = buildVariantRow("A — Production", "A", modes, null, null);
    const rowB = buildVariantRow("B — Only modes within ±20 Hz of 30.4 Hz", "B", modes,
      (m) => Math.abs(m.freq - TARGET_LO_HZ) <= 20, null);
    const rowC = buildVariantRow("C — Only modes below 80 Hz", "C", modes,
      (m) => m.freq < 80, null);
    const rowD = buildVariantRow("D — Only modes below 120 Hz", "D", modes,
      (m) => m.freq < 120, null);
    const rowE = buildVariantRow("E — Apply 1/frequency falloff", "E", modes, null,
      (m) => 1 / Math.max(m.freq, 1));
    const rowF = buildVariantRow("F — Apply 1/frequency² falloff", "F", modes, null,
      (m) => 1 / Math.max(m.freq * m.freq, 1));
    const rowG = buildVariantRow("G — Apply 1/modal order falloff", "G", modes, null,
      (m) => 1 / Math.max(m.order, 1));
    const rowH = buildVariantRow("H — Apply 1/modal order² falloff", "H", modes, null,
      (m) => 1 / Math.max(m.order * m.order, 1));

    const variantRows = [rowA, rowB, rowC, rowD, rowE, rowF, rowG, rowH];

    // Verdict selection.
    // Distant-mode excessive authority: restricting to nearby modes (B) removes the null
    // while production (A) has it — meaning distant modes are propping up 30.4 Hz.
    let verdict;
    if (rowA.nullRemains && !rowB.nullRemains) {
      verdict = "DISTANT MODES HAVE EXCESSIVE OFF-RESONANCE AUTHORITY";
    } else if (!rowA.nullRemains) {
      verdict = "HIGHER MODES ARE NOT THE CAUSE";
    } else if (rowG.gapDb > rowA.gapDb || rowH.gapDb > rowA.gapDb) {
      verdict = "MODE ORDER FALLOFF IS MISSING";
    } else if (rowE.gapDb > rowA.gapDb || rowF.gapDb > rowA.gapDb) {
      verdict = "MODE FREQUENCY FALLOFF IS MISSING";
    } else {
      verdict = "HIGHER MODES ARE NOT THE CAUSE";
    }

    const nextFixCandidate =
      verdict === "DISTANT MODES HAVE EXCESSIVE OFF-RESONANCE AUTHORITY"
        ? "src/bass/core/modalCalculations.js → resonantTransfer() — add a frequency-distance falloff term so far-off-resonance modes contribute less magnitude"
        : verdict === "MODE ORDER FALLOFF IS MISSING"
        ? "modal summation wrapper — add a 1/modal-order (nx+ny+nz) weighting factor per mode before summation"
        : verdict === "MODE FREQUENCY FALLOFF IS MISSING"
        ? "modal summation wrapper — add a 1/mode-frequency weighting factor per mode before summation"
        : "no fix required — off-resonance high modes are not material contributors at 30.4 Hz";

    return { tableRows, variantRows, verdict, nextFixCandidate };
  }, []);

  return (
    <div style={{ border: "2px solid #4c1d95", borderRadius: 10, background: "#f5f3ff", padding: 14, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: "#4c1d95", fontSize: 13, marginBottom: 6 }}>
        Case 040 — Off-Resonance Modal Magnitude Falloff Audit (read-only)
      </div>
      <div style={{ color: "#5b21b6", marginBottom: 10 }}>
        Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m · Sub centre-front ({SUB.x.toFixed(2)}, {SUB.y.toFixed(2)}, {SUB.z.toFixed(2)}) ·
        Seat ({SEAT.x.toFixed(2)}, {SEAT.y.toFixed(2)}, {SEAT.z.toFixed(2)}) · Absorption 0.30 all surfaces · Frequency {TARGET_LO_HZ.toFixed(2)} Hz · Modes {TABLE_LO_HZ}–{TABLE_HI_HZ} Hz
      </div>

      {/* Mode table */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: "#4c1d95", marginBottom: 4 }}>Modes {TABLE_LO_HZ}–{TABLE_HI_HZ} Hz — contribution @ {TARGET_LO_HZ.toFixed(2)} Hz</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: "#ede9fe" }}>
                {["Mode", "Freq", "f/f0", "Q", "|H|", "Source amp", "Source coupling", "Receiver coupling", "Final mag", "% of total"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #ddd6fe" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.tableRows.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe", fontWeight: 700 }}>{r.mode}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.modeFreq, 2)} Hz</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.freqRatio, 3)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.q, 2)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.transferMag)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.modalSourceAmplitude)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.sourceCoupling)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.receiverCoupling)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.finalMag)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.pctOfTotal, 2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Variant tests */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#ede9fe" }}>
              {["Variant", `SPL @${TARGET_LO_HZ.toFixed(1)}Hz`, `SPL @${TARGET_HI_HZ.toFixed(1)}Hz`, "Δ", "Null remains?", "20–120Hz ripple"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #ddd6fe" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.variantRows.map((r) => (
              <tr key={r.key}>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{r.label}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.loDb, 1)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.hiDb, 1)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.gapDb, 1)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe", fontWeight: 700, color: r.nullRemains ? "#b91c1c" : "#166534" }}>
                  {r.nullRemains ? "YES" : "NO"}
                </td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ede9fe" }}>{fmt(r.ripple, 1)} dB</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: "#ede9fe", border: "1px solid #ddd6fe" }}>
        <div style={{ fontWeight: 700, color: "#4c1d95" }}>Verdict: {result.verdict}</div>
        <div style={{ marginTop: 6, color: "#5b21b6" }}>Next fix candidate: {result.nextFixCandidate}</div>
      </div>
    </div>
  );
}