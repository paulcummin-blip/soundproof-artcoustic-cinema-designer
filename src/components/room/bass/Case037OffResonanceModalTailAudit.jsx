import React, { useMemo } from "react";
import {
  computeRoomModesLocal,
  estimateModeQLocal,
  modeShapeValueLocal,
  resonantTransfer,
} from "@/bass/core/modalCalculations.js";

// Case 037 — Off-Resonance Modal Tail Audit.
// Read-only forensic audit. Does not touch production engine, graph, or state.
// Same fixed reference config as Case 035/036 — no live room/seat wiring.
// Objective: identify which nearby mode's off-resonance tail is pulling down 30.4 Hz.

const C = 343;
const ROOM = { widthM: 5.0, lengthM: 4.5, heightM: 3.0 };
const SEAT = { x: 2.5, y: 4.00, z: 1.2 };
const SUB = { x: 2.5, y: 0.15, z: 0.35 };
const ABSORPTION = { front: 0.30, back: 0.30, left: 0.30, right: 0.30, floor: 0.30, ceiling: 0.30 };
const CURVE_DB = 94;
const TARGET_LO_HZ = 30.4;
const TARGET_HI_HZ = 34.4;
const NULL_GAP_THRESHOLD_DB = 6;
const MODE_TABLE_LO_HZ = 25;
const MODE_TABLE_HI_HZ = 45;

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

function modeContribution(mode, freqHz) {
  const modalSourceAmplitude = Math.pow(10, CURVE_DB / 20);
  const sc = modeShapeValueLocal(mode, SUB.x, SUB.y, SUB.z, ROOM);
  const rc = modeShapeValueLocal(mode, SEAT.x, SEAT.y, SEAT.z, ROOM);
  const coupling = sc * rc;
  const { re, im } = resonantTransfer(freqHz, mode.freq, mode.qValue);
  return { re: modalSourceAmplitude * coupling * re, im: modalSourceAmplitude * coupling * im };
}

function modalVectorFromModes(modes, freqHz) {
  let sumRe = 0, sumIm = 0;
  modes.forEach((mode) => {
    const c = modeContribution(mode, freqHz);
    sumRe += c.re;
    sumIm += c.im;
  });
  return { re: sumRe, im: sumIm };
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

function nearestMode(modes, targetFreq, predicate) {
  return modes
    .filter(predicate)
    .reduce((best, m) => (Math.abs(m.freq - targetFreq) < Math.abs((best?.freq ?? Infinity) - targetFreq) ? m : best), null);
}

function finalVectorWithExclusions(modes, freqHz, excludeKeys) {
  const included = modes.filter((m) => !excludeKeys.has(`${m.nx},${m.ny},${m.nz}`));
  const d = directVector(freqHz);
  const r = reflectionVector(freqHz);
  const mo = modalVectorFromModes(included, freqHz);
  return { re: d.re + r.re + mo.re, im: d.im + r.im + mo.im };
}

function finalVectorOnlyIncluded(modes, freqHz, includeKeys) {
  const included = modes.filter((m) => includeKeys.has(`${m.nx},${m.ny},${m.nz}`));
  const d = directVector(freqHz);
  const r = reflectionVector(freqHz);
  const mo = modalVectorFromModes(included, freqHz);
  return { re: d.re + r.re + mo.re, im: d.im + r.im + mo.im };
}

function buildRemovalRow(label, key, vecLo, vecHi) {
  const loDb = splDb(vecLo.re, vecLo.im);
  const hiDb = splDb(vecHi.re, vecHi.im);
  const gapDb = hiDb - loDb;
  return { key, label, loDb, hiDb, gapDb, nullRemains: gapDb >= NULL_GAP_THRESHOLD_DB };
}

export default function Case037OffResonanceModalTailAudit() {
  const result = useMemo(() => {
    const modes = buildModes();

    const dLo = directVector(TARGET_LO_HZ);
    const rLo = reflectionVector(TARGET_LO_HZ);
    const finalLo = { re: dLo.re + rLo.re + modalVectorFromModes(modes, TARGET_LO_HZ).re, im: dLo.im + rLo.im + modalVectorFromModes(modes, TARGET_LO_HZ).im };
    const finalPhaseLo = phaseDeg(finalLo.re, finalLo.im);

    // Per-mode table, 25-45 Hz.
    const modeRows = modes
      .filter((m) => m.freq >= MODE_TABLE_LO_HZ && m.freq <= MODE_TABLE_HI_HZ)
      .sort((a, b) => a.freq - b.freq)
      .map((m) => {
        const contrib = modeContribution(m, TARGET_LO_HZ);
        const contribMag = mag(contrib.re, contrib.im);
        const contribPhase = phaseDeg(contrib.re, contrib.im);
        const diffVsFinal = wrappedPhaseDiff(contribPhase, finalPhaseLo);
        const isConstructive = diffVsFinal <= 90;

        // Effect if removed temporarily: SPL(30.4Hz) with this single mode excluded, vs production.
        const excludeKeys = new Set([`${m.nx},${m.ny},${m.nz}`]);
        const withoutMode = finalVectorWithExclusions(modes, TARGET_LO_HZ, excludeKeys);
        const splWithout = splDb(withoutMode.re, withoutMode.im);
        const splProduction = splDb(finalLo.re, finalLo.im);
        const effectDb = splWithout - splProduction;

        return {
          key: `${m.nx},${m.ny},${m.nz}`,
          mode: `(${m.nx},${m.ny},${m.nz})`,
          modeFreq: m.freq,
          type: familyLabel(m),
          magnitude: contribMag,
          phase: contribPhase,
          re: contrib.re,
          im: contrib.im,
          isConstructive,
          effectDb,
        };
      });

    // Identify the two named modes for removal variants.
    const mode343 = nearestMode(modes, 34.3, (m) => familyLabel(m) === "axial length");
    const mode381 = nearestMode(modes, 38.1, (m) => familyLabel(m) === "axial width");
    const key343 = mode343 ? `${mode343.nx},${mode343.ny},${mode343.nz}` : null;
    const key381 = mode381 ? `${mode381.nx},${mode381.ny},${mode381.nz}` : null;

    const allKeys = new Set();
    const noneExcluded = new Set();
    const excl343 = new Set(key343 ? [key343] : []);
    const excl381 = new Set(key381 ? [key381] : []);
    const exclBoth = new Set([...(key343 ? [key343] : []), ...(key381 ? [key381] : [])]);
    const only343 = new Set(key343 ? [key343] : []);
    const only381 = new Set(key381 ? [key381] : []);

    const rowA = buildRemovalRow("A — Production", "A",
      finalVectorWithExclusions(modes, TARGET_LO_HZ, noneExcluded),
      finalVectorWithExclusions(modes, TARGET_HI_HZ, noneExcluded));
    const rowB = buildRemovalRow(`B — Remove ${mode343 ? mode343.freq.toFixed(1) : "?"} Hz axial length mode only`, "B",
      finalVectorWithExclusions(modes, TARGET_LO_HZ, excl343),
      finalVectorWithExclusions(modes, TARGET_HI_HZ, excl343));
    const rowC = buildRemovalRow(`C — Remove ${mode381 ? mode381.freq.toFixed(1) : "?"} Hz axial width mode only`, "C",
      finalVectorWithExclusions(modes, TARGET_LO_HZ, excl381),
      finalVectorWithExclusions(modes, TARGET_HI_HZ, excl381));
    const rowD = buildRemovalRow("D — Remove both modes", "D",
      finalVectorWithExclusions(modes, TARGET_LO_HZ, exclBoth),
      finalVectorWithExclusions(modes, TARGET_HI_HZ, exclBoth));
    const rowE = buildRemovalRow(`E — Keep only ${mode343 ? mode343.freq.toFixed(1) : "?"} Hz mode`, "E",
      finalVectorOnlyIncluded(modes, TARGET_LO_HZ, only343),
      finalVectorOnlyIncluded(modes, TARGET_HI_HZ, only343));
    const rowF = buildRemovalRow(`F — Keep only ${mode381 ? mode381.freq.toFixed(1) : "?"} Hz mode`, "F",
      finalVectorOnlyIncluded(modes, TARGET_LO_HZ, only381),
      finalVectorOnlyIncluded(modes, TARGET_HI_HZ, only381));

    const removalRows = [rowA, rowB, rowC, rowD, rowE, rowF];

    // Verdict: the mode whose removal shrinks the null gap the most (biggest reduction in gapDb vs A).
    const candidateRows = [rowB, rowC].filter((r) => !r.nullRemains || r.gapDb < rowA.gapDb);
    const rankedByGapReduction = [rowB, rowC]
      .map((r) => ({ row: r, gapReduction: rowA.gapDb - r.gapDb }))
      .sort((a, b) => b.gapReduction - a.gapReduction);
    const topCandidate = rankedByGapReduction[0];
    const causingModeLabel = topCandidate?.row.key === "B"
      ? (mode343 ? `(${mode343.nx},${mode343.ny},${mode343.nz}) axial length @ ${mode343.freq.toFixed(1)} Hz` : "unresolved")
      : (mode381 ? `(${mode381.nx},${mode381.ny},${mode381.nz}) axial width @ ${mode381.freq.toFixed(1)} Hz` : "unresolved");

    const isOffResonanceTail = !!topCandidate && topCandidate.gapReduction > 0 && !rowA.nullRemains && (topCandidate.row.key === "B" ? !rowB.nullRemains : !rowC.nullRemains) === false;
    // Simpler, explicit off-resonance tail determination: production null present, and removing the
    // identified nearby mode (whose own resonance is NOT at 30.4 Hz) makes the null disappear.
    const identifiedModeFreq = topCandidate?.row.key === "B" ? mode343?.freq : mode381?.freq;
    const offResonanceTailConfirmed = rowA.nullRemains
      && Number.isFinite(identifiedModeFreq)
      && Math.abs(identifiedModeFreq - TARGET_LO_HZ) > 1
      && !!topCandidate
      && !(topCandidate.row.key === "B" ? rowB.nullRemains : rowC.nullRemains);

    return { modeRows, removalRows, mode343, mode381, causingModeLabel, offResonanceTailConfirmed, rowA };
  }, []);

  return (
    <div style={{ border: "2px solid #0f766e", borderRadius: 10, background: "#f0fdfa", padding: 14, fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: "#115e59", fontSize: 13, marginBottom: 6 }}>
        Case 037 — Off-Resonance Modal Tail Audit (read-only)
      </div>
      <div style={{ color: "#0f766e", marginBottom: 10 }}>
        Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m · Sub centre-front ({SUB.x.toFixed(2)}, {SUB.y.toFixed(2)}, {SUB.z.toFixed(2)}) ·
        Seat ({SEAT.x.toFixed(2)}, {SEAT.y.toFixed(2)}, {SEAT.z.toFixed(2)}) · Absorption 0.30 all surfaces · Frequencies {MODE_TABLE_LO_HZ}–{MODE_TABLE_HI_HZ} Hz
      </div>

      {/* Per-mode table 25-45 Hz */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "#115e59", marginBottom: 4 }}>Modes 25–45 Hz — contribution @ {TARGET_LO_HZ} Hz</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: "#ccfbf1" }}>
                {["Mode", "Mode Freq", "Type", "Magnitude", "Phase (°)", "Re", "Im", "vs Final", "Effect if removed"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #99f6e4" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.modeRows.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccfbf1", fontWeight: 700 }}>{r.mode}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccfbf1" }}>{fmt(r.modeFreq, 1)} Hz</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccfbf1" }}>{r.type}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccfbf1" }}>{fmt(r.magnitude, 3)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccfbf1" }}>{fmt(r.phase, 1)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccfbf1" }}>{fmt(r.re, 3)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccfbf1" }}>{fmt(r.im, 3)}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccfbf1", fontWeight: 700, color: r.isConstructive ? "#166534" : "#b91c1c" }}>
                    {r.isConstructive ? "constructive" : "destructive"}
                  </td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccfbf1" }}>{r.effectDb >= 0 ? "+" : ""}{fmt(r.effectDb, 2)} dB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* One-at-a-time removal tests */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#ccfbf1" }}>
              {["Variant", `SPL @${TARGET_LO_HZ}Hz`, `SPL @${TARGET_HI_HZ}Hz`, "Δ(34.4-30.4)", "Null remains?"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #99f6e4" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.removalRows.map((r) => (
              <tr key={r.key}>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccfbf1" }}>{r.label}</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccfbf1" }}>{fmt(r.loDb, 1)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccfbf1" }}>{fmt(r.hiDb, 1)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccfbf1" }}>{fmt(r.gapDb, 1)} dB</td>
                <td style={{ padding: "4px 6px", borderBottom: "1px solid #ccfbf1", fontWeight: 700, color: r.nullRemains ? "#b91c1c" : "#166534" }}>
                  {r.nullRemains ? "YES" : "NO"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: "#ccfbf1", border: "1px solid #99f6e4" }}>
        <div style={{ fontWeight: 700, color: "#115e59" }}>
          Exact mode causing the {TARGET_LO_HZ} Hz dip: {result.causingModeLabel}
        </div>
        <div style={{ marginTop: 6, fontWeight: 700, color: result.offResonanceTailConfirmed ? "#166534" : "#b91c1c" }}>
          {result.offResonanceTailConfirmed
            ? "Confirmed — the dip is caused by an off-resonance phase tail from a nearby mode, not a resonance located at 30.4 Hz."
            : "Not confirmed by the removal tests above — see per-mode table for the actual dominant contributor."}
        </div>
        <div style={{ marginTop: 6, color: "#115e59" }}>
          Next fix candidate: target the Q/damping or storage factor of the identified mode ({result.causingModeLabel}) rather than any mode at 30.4 Hz itself, since no resonance exists there.
        </div>
      </div>
    </div>
  );
}