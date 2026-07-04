import React, { useMemo } from "react";
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from "@/bass/core/modalCalculations.js";

// Case 036 — Final Pressure Combination Audit.
// Read-only forensic audit. Does not touch production engine, graph, or state.
// Same fixed reference config as Case 035 (per investigation brief) — no live room/seat wiring.
// Objective: isolate ONLY the final pressure assembly (direct + reflection + modal) to
// determine whether the 30.4 Hz null is destructive interference at final summation.

const C = 343;
const ROOM = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SEAT = { x: 2.5, y: 4.00, z: 1.2 };
const SUB = { x: 2.5, y: 0.15, z: 0.35 };
const ABSORPTION = { front: 0.30, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 };
const CURVE_DB = 94; // flat REW-parity reference source
const TARGET_LO_HZ = 30.4;
const TARGET_HI_HZ = 34.4;
const NULL_GAP_THRESHOLD_DB = 6; // treated as "null present" if lo is this much quieter than hi
const ALIGNMENT_TOLERANCE_DEG = 20;

function mag(re, im) { return Math.sqrt(re * re + im * im); }
function phaseDeg(re, im) { return (Math.atan2(im, re) * 180) / Math.PI; }
function wrappedPhaseDiff(a, b) {
  let d = Math.abs(a - b);
  if (d > 180) d = 360 - d;
  return d;
}
function splDb(re, im) { return 20 * Math.log10(Math.max(mag(re, im), 1e-10)); }
function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }

function directVector(freqHz) {
  const dx = SUB.x - SEAT.x, dy = SUB.y - SEAT.y, dz = SUB.z - SEAT.z;
  const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
  const distanceLossDb = -20 * Math.log10(distanceM);
  const amp = Math.pow(10, (CURVE_DB + distanceLossDb) / 20);
  const phase = -2 * Math.PI * freqHz * (distanceM / C);
  return { re: amp * Math.cos(phase), im: amp * Math.sin(phase) };
}

// First-order image sources (one per wall) — same formula/coherence-weight convention as
// the production engine's reflection path, evaluated here in isolation for this audit only.
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
  }));
}

function modalVector(freqHz, modes) {
  const modalSourceAmplitude = Math.pow(10, CURVE_DB / 20);
  let sumRe = 0, sumIm = 0;
  modes.forEach((mode) => {
    const sc = modeShapeValueLocal(mode, SUB.x, SUB.y, SUB.z, ROOM);
    const rc = modeShapeValueLocal(mode, SEAT.x, SEAT.y, SEAT.z, ROOM);
    const coupling = sc * rc;
    const { re, im } = resonantTransfer(freqHz, mode.freq, mode.qValue);
    sumRe += modalSourceAmplitude * coupling * re;
    sumIm += modalSourceAmplitude * coupling * im;
  });
  return { re: sumRe, im: sumIm };
}

function buildVariantRow(label, key, direct, reflection, modal) {
  const finalLo = { re: direct.lo.re + reflection.lo.re + modal.lo.re, im: direct.lo.im + reflection.lo.im + modal.lo.im };
  const finalHi = { re: direct.hi.re + reflection.hi.re + modal.hi.re, im: direct.hi.im + reflection.hi.im + modal.hi.im };
  const loDb = splDb(finalLo.re, finalLo.im);
  const hiDb = splDb(finalHi.re, finalHi.im);
  const gapDb = hiDb - loDb;
  const nullDisappears = gapDb < NULL_GAP_THRESHOLD_DB;
  const directPhaseLo = phaseDeg(direct.lo.re, direct.lo.im);
  const modalPhaseLo = phaseDeg(modal.lo.re, modal.lo.im);
  return {
    key, label,
    loDb, hiDb, gapDb, nullDisappears,
    finalLo, finalHi,
    directPhaseLo, modalPhaseLo,
    directModalPhaseDiff: wrappedPhaseDiff(directPhaseLo, modalPhaseLo),
  };
}

export default function Case036FinalPressureCombinationAudit() {
  const result = useMemo(() => {
    const modes = buildModes();

    const dLo = directVector(TARGET_LO_HZ), dHi = directVector(TARGET_HI_HZ);
    const rLo = reflectionVector(TARGET_LO_HZ), rHi = reflectionVector(TARGET_HI_HZ);
    const mLo = modalVector(TARGET_LO_HZ, modes), mHi = modalVector(TARGET_HI_HZ, modes);

    const vectors = {
      direct: { lo: dLo, hi: dHi },
      reflection: { lo: rLo, hi: rHi },
      modal: { lo: mLo, hi: mHi },
    };

    // Variant A — current production (no changes).
    const rowA = buildVariantRow("A — Current production", "A",
      { lo: dLo, hi: dHi }, { lo: rLo, hi: rHi }, { lo: mLo, hi: mHi });

    // Variant B — direct field rotated +180° (negated).
    const dLoRot = { re: -dLo.re, im: -dLo.im };
    const dHiRot = { re: -dHi.re, im: -dHi.im };
    const rowB = buildVariantRow("B — Direct field rotated +180°", "B",
      { lo: dLoRot, hi: dHiRot }, { lo: rLo, hi: rHi }, { lo: mLo, hi: mHi });

    // Variant C — modal field rotated +180° (negated).
    const mLoRot = { re: -mLo.re, im: -mLo.im };
    const mHiRot = { re: -mHi.re, im: -mHi.im };
    const rowC = buildVariantRow("C — Modal field rotated +180°", "C",
      { lo: dLo, hi: dHi }, { lo: rLo, hi: rHi }, { lo: mLoRot, hi: mHiRot });

    // Variant D — direct and modal phase aligned before summation (modal rotated onto direct's phase,
    // magnitude preserved) at each target frequency independently.
    const alignModalToDirect = (directVec, modalVec) => {
      const directPhase = Math.atan2(directVec.im, directVec.re);
      const modalMag = mag(modalVec.re, modalVec.im);
      return { re: modalMag * Math.cos(directPhase), im: modalMag * Math.sin(directPhase) };
    };
    const mLoAligned = alignModalToDirect(dLo, mLo);
    const mHiAligned = alignModalToDirect(dHi, mHi);
    const rowD = buildVariantRow("D — Direct and modal phase-aligned before summation", "D",
      { lo: dLo, hi: dHi }, { lo: rLo, hi: rHi }, { lo: mLoAligned, hi: mHiAligned });

    const rows = [rowA, rowB, rowC, rowD];

    // Final verdict, based on Variant A (production) phase relationship.
    const productionPhaseDiff = rowA.directModalPhaseDiff;
    const isDestructiveInterference = Math.abs(productionPhaseDiff - 180) <= ALIGNMENT_TOLERANCE_DEG;

    let dominantCauseText = null;
    if (!isDestructiveInterference) {
      // Check the other two pairwise relationships to see if either is closer to 180°.
      const directReflectionDiff = wrappedPhaseDiff(phaseDeg(dLo.re, dLo.im), phaseDeg(rLo.re, rLo.im));
      const reflectionModalDiff = wrappedPhaseDiff(phaseDeg(rLo.re, rLo.im), phaseDeg(mLo.re, mLo.im));
      const directReflectionAligned = Math.abs(directReflectionDiff - 180) <= ALIGNMENT_TOLERANCE_DEG;
      const reflectionModalAligned = Math.abs(reflectionModalDiff - 180) <= ALIGNMENT_TOLERANCE_DEG;

      if (directReflectionAligned) {
        dominantCauseText = `Destructive interference between direct field and reflection field (phase difference ${fmt(directReflectionDiff, 1)}°, within ±${ALIGNMENT_TOLERANCE_DEG}° of 180°).`;
      } else if (reflectionModalAligned) {
        dominantCauseText = `Destructive interference between reflection field and modal field (phase difference ${fmt(reflectionModalDiff, 1)}°, within ±${ALIGNMENT_TOLERANCE_DEG}° of 180°).`;
      } else {
        const magDirect = mag(dLo.re, dLo.im), magReflection = mag(rLo.re, rLo.im), magModal = mag(mLo.re, mLo.im);
        const ranked = [
          { label: "direct field", magnitude: magDirect },
          { label: "reflection field", magnitude: magReflection },
          { label: "modal field", magnitude: magModal },
        ].sort((a, b) => b.magnitude - a.magnitude);
        dominantCauseText = `No pairwise vector relationship is within ±${ALIGNMENT_TOLERANCE_DEG}° of 180° destructive interference. The null at ${TARGET_LO_HZ} Hz is a multi-vector combination effect, dominated by magnitude from the ${ranked[0].label} (${fmt(ranked[0].magnitude, 2)}), not by two-vector phase cancellation.`;
      }
    }

    return { vectors, rows, productionPhaseDiff, isDestructiveInterference, dominantCauseText };
  }, []);

  return (
    <div style={{ border: "2px solid #b45309", borderRadius: 10, background: "#fffbeb", padding: 14, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: "#92400e", fontSize: 13, marginBottom: 6 }}>
        Case 036 — Final Pressure Combination Audit (read-only)
      </div>
      <div style={{ color: "#b45309", marginBottom: 10 }}>
        Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m · Sub centre-front ({SUB.x.toFixed(2)}, {SUB.y.toFixed(2)}, {SUB.z.toFixed(2)}) ·
        Seat ({SEAT.x.toFixed(2)}, {SEAT.y.toFixed(2)}, {SEAT.z.toFixed(2)}) · Absorption 0.30 all surfaces · Target frequencies {TARGET_LO_HZ} Hz / {TARGET_HI_HZ} Hz
      </div>

      {/* Exact complex vectors before every addition, at 30.4 Hz */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "#92400e", marginBottom: 4 }}>Complex vectors before every addition (@ {TARGET_LO_HZ} Hz)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: "#fef3c7" }}>
                {["Field", "Re", "Im", "Magnitude", "Phase (°)"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #fde68a" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Direct field", v: result.vectors.direct.lo },
                { label: "Reflection field", v: result.vectors.reflection.lo },
                { label: "Modal field", v: result.vectors.modal.lo },
                { label: "Final summed field", v: result.rows[0].finalLo },
              ].map((row) => (
                <tr key={row.label}>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7", fontWeight: 700 }}>{row.label}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{fmt(row.v.re, 3)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{fmt(row.v.im, 3)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{fmt(mag(row.v.re, row.v.im), 3)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{fmt(phaseDeg(row.v.re, row.v.im), 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Four temporary read-only variants */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#fef3c7" }}>
              {["Variant", `SPL @${TARGET_LO_HZ}Hz`, `SPL @${TARGET_HI_HZ}Hz`, "Final Re", "Final Im", "Dir↔Modal Δ°", "Null disappears?"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #fde68a" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.key}>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{r.label}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.loDb, 1)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.hiDb, 1)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.finalLo.re, 3)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.finalLo.im, 3)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7" }}>{fmt(r.directModalPhaseDiff, 1)}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #fef3c7", fontWeight: 700, color: r.nullDisappears ? "#166534" : "#b91c1c" }}>
                  {r.nullDisappears ? "YES" : "NO"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: "#fef3c7", border: "1px solid #fde68a" }}>
        <div style={{ fontWeight: 700, color: "#92400e" }}>
          Phase angle between direct and modal in production (Variant A, @ {TARGET_LO_HZ} Hz): {fmt(result.productionPhaseDiff, 1)}°
        </div>
        <div style={{ marginTop: 6, fontWeight: 700, color: result.isDestructiveInterference ? "#166534" : "#b91c1c" }}>
          {result.isDestructiveInterference
            ? `Within ±${ALIGNMENT_TOLERANCE_DEG}° of 180° — the null is caused by destructive interference during final pressure summation.`
            : `Not within ±${ALIGNMENT_TOLERANCE_DEG}° of 180° — direct/modal cancellation alone does not explain the null.`}
        </div>
        {!result.isDestructiveInterference && (
          <div style={{ marginTop: 6, color: "#92400e" }}>{result.dominantCauseText}</div>
        )}
      </div>
    </div>
  );
}