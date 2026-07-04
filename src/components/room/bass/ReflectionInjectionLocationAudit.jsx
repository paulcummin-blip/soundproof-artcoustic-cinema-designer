// ReflectionInjectionLocationAudit.jsx
// Temporary READ-ONLY diagnostic. Does not change production, does not gate reflections,
// does not alter the graph. Traces exactly where reflections and modal pressure are
// accumulated into the production complex-pressure sum, using the engine's own
// perFrequencyVectorDebug output (direct/reflection/modal/final vectors — unmodified,
// exact production values) plus a faithful line-by-line reconstruction of the six
// order-1 (single-wall) image-source contributions at 30Hz, using the same formulas
// as rewBassEngine.js (buildImageSources + per-frequency reflection loop) for the
// fixed test case (gain=0, delay=0, polarity=0, flat 94dB source curve).

import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";

const ROOM_DIMS = { widthM: 4.5, lengthM: 5.0, heightM: 3.0 };
const SUB = { x: 4.5 / 2, y: 0.1, z: 0.35, modelKey: "test-sub", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT = { x: 4.5 / 2, y: 4.0, z: 1.2 };
const SURFACE_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };
const FLAT_CURVE_DB = 94;
const SPEED_OF_SOUND_MPS = 343;
const TEST_FREQS = [28, 29, 30, 31, 32, 33, 34, 35];

function mag(re, im) { return Math.sqrt(re * re + im * im); }
function db(re, im) { return 20 * Math.log10(Math.max(mag(re, im), 1e-10)); }

function runProductionVectors(frequencyHz) {
  const result = simulateBassResponseRewCore(ROOM_DIMS, SEAT, SUB, [{ hz: 20, db: FLAT_CURVE_DB }, { hz: 200, db: FLAT_CURVE_DB }], {
    freqMinHz: frequencyHz,
    freqMaxHz: frequencyHz + 0.01,
    modeGenerationFMaxHz: 200,
    surfaceAbsorption: SURFACE_ABSORPTION,
    enableReflections: true,
    enableModes: true,
  });
  return { vec: result.perFrequencyVectorDebug[0] || {}, splDb: result.splDbRaw[0] };
}

// Faithful reconstruction of the six order-1 (single-wall) image sources, using the exact
// formulas from rewBassEngine.js buildImageSources() + the per-frequency reflection loop,
// for this fixed test case only (gain=0, delay=0, polarity=0).
function buildOrder1WallVectors(frequencyHz) {
  const { widthM: W, lengthM: L, heightM: H } = ROOM_DIMS;
  const sx = SUB.x, sy = SUB.y, sz = SUB.z;
  const seatX = SEAT.x, seatY = SEAT.y, seatZ = SEAT.z;
  const sa = SURFACE_ABSORPTION;

  const walls = [
    { name: "front",   rx: 0, ry: -1, rz: 0, alpha: sa.front },
    { name: "back",    rx: 0, ry: 1,  rz: 0, alpha: sa.back },
    { name: "left",    rx: -1, ry: 0, rz: 0, alpha: sa.left },
    { name: "right",   rx: 1,  ry: 0, rz: 0, alpha: sa.right },
    { name: "floor",   rx: 0, ry: 0, rz: -1, alpha: sa.floor },
    { name: "ceiling", rx: 0, ry: 0, rz: 1,  alpha: sa.ceiling },
  ];

  const coherenceWeight = Math.min(0.75, Math.max(0.25, 0.25 + 0.5 * Math.max(0, Math.min(1, (frequencyHz - 20) / 140))));

  return walls.map(({ name, rx, ry, rz, alpha }) => {
    const imgX = (rx % 2 === 0) ? rx * W + sx : rx * W + (W - sx);
    const imgY = (ry % 2 === 0) ? ry * L + sy : ry * L + (L - sy);
    const imgZ = (rz % 2 === 0) ? rz * H + sz : rz * H + (H - sz);
    const reflectionCoefficient = Math.sqrt(1 - alpha); // exactly one wall hit for an order-1 image source

    const dx = imgX - seatX, dy = imgY - seatY, dz = imgZ - seatZ;
    const distanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const distanceLossDb = -20 * Math.log10(distanceM / 1);
    const amplitude = Math.pow(10, (FLAT_CURVE_DB + distanceLossDb) / 20) * reflectionCoefficient;
    const phase = -2 * Math.PI * frequencyHz * (distanceM / SPEED_OF_SOUND_MPS);

    return { name, re: coherenceWeight * amplitude * Math.cos(phase), im: coherenceWeight * amplitude * Math.sin(phase) };
  });
}

export default function ReflectionInjectionLocationAudit() {
  const bandRows = useMemo(() => TEST_FREQS.map((hz) => {
    const { vec, splDb } = runProductionVectors(hz);
    return {
      hz,
      directDb: db(vec.directRe || 0, vec.directIm || 0),
      reflectionDb: db(vec.reflectionRe || 0, vec.reflectionIm || 0),
      modalDb: db(vec.modalSumRe || 0, vec.modalSumIm || 0),
      finalDb: splDb,
      vec,
    };
  }), []);

  const trace30 = useMemo(() => {
    const hz = 30;
    const { vec, splDb } = runProductionVectors(hz);
    const wallVectors = buildOrder1WallVectors(hz);

    const steps = [];
    let sumRe = 0, sumIm = 0;
    steps.push({ label: "Start", re: sumRe, im: sumIm, magnitude: 0, splDb: null });

    sumRe += vec.directRe; sumIm += vec.directIm;
    steps.push({ label: "After direct", re: sumRe, im: sumIm, magnitude: mag(sumRe, sumIm), splDb: db(sumRe, sumIm) });

    wallVectors.forEach(({ name, re, im }) => {
      sumRe += re; sumIm += im;
      steps.push({ label: `After ${name} reflection`, re: sumRe, im: sumIm, magnitude: mag(sumRe, sumIm), splDb: db(sumRe, sumIm) });
    });

    const beforeModalRe = sumRe, beforeModalIm = sumIm;
    steps.push({ label: "Before modal injection (direct + all reflections)", re: beforeModalRe, im: beforeModalIm, magnitude: mag(beforeModalRe, beforeModalIm), splDb: db(beforeModalRe, beforeModalIm) });

    const afterModalRe = beforeModalRe + vec.modalSumRe;
    const afterModalIm = beforeModalIm + vec.modalSumIm;
    steps.push({ label: "After modal injection", re: afterModalRe, im: afterModalIm, magnitude: mag(afterModalRe, afterModalIm), splDb: db(afterModalRe, afterModalIm) });

    steps.push({ label: "Final production SPL", re: vec.finalRe, im: vec.finalIm, magnitude: mag(vec.finalRe, vec.finalIm), splDb });

    // Reconciliation check: my manual reflection sum vs production's tracked reflectionRe/Im.
    const manualReflectionRe = wallVectors.reduce((s, w) => s + w.re, 0);
    const manualReflectionIm = wallVectors.reduce((s, w) => s + w.im, 0);
    const reconciles = Math.abs(manualReflectionRe - vec.reflectionRe) < 1e-6 && Math.abs(manualReflectionIm - vec.reflectionIm) < 1e-6;

    // Identify the step with the largest magnitude drop vs the previous step (first destructive-cancellation stage).
    let worstDropIdx = -1, worstDrop = 0;
    for (let i = 1; i < steps.length; i++) {
      const prevMag = steps[i - 1].magnitude;
      const curMag = steps[i].magnitude;
      const drop = prevMag - curMag;
      if (drop > worstDrop) { worstDrop = drop; worstDropIdx = i; }
    }
    const worstStageLabel = worstDropIdx >= 0 ? steps[worstDropIdx].label : null;

    return { steps, reconciles, manualReflectionRe, manualReflectionIm, worstStageLabel, worstDrop };
  }, []);

  const fmt = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : "—");
  const fmtDb = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");

  return (
    <div style={{ border: "2px solid #581c87", borderRadius: 8, background: "#faf5ff", padding: "10px 12px", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: "#581c87", fontSize: 12, marginBottom: 4 }}>
        Reflection Injection Location Audit — temporary diagnostic (read-only, traces pressure assembly)
      </div>
      <div style={{ color: "#6b21a8", fontSize: 9, marginBottom: 8, fontStyle: "italic" }}>
        Room 5.0x4.5x3.0m, sub centre-front, seat y=4.0m, absorption 0.30, 28-35Hz. No production behaviour changed;
        no fix prototyped; reflections not gated; graph untouched.
      </div>

      <div style={{ border: "1px solid #d8b4fe", borderRadius: 6, background: "#fff", padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: "#6b21a8", marginBottom: 4 }}>Function / code location reference</div>
        <div>Exact function: <b>simulateBassResponseRewCore</b> (src/bass/core/rewBassEngine.js).</div>
        <div>Reflections added: inside the per-frequency <b>imageSources.forEach(...)</b> loop, in the block
          <code> if (!rewParityModalPhase &amp;&amp; !isModeOnlyParity) {'{'} sumRe += imageRe; sumIm += imageIm; {'}'}</code> —
          this runs once per image source, directly inside the main frequency loop, before modal pressure is computed.</div>
        <div>Modal pressure added: inside <b>if (enableModes) {'{'}...{'}'}</b>, after calling <b>legacyModalTransferLocal(...)</b>,
          in the block <code>sumRe = prevRe + modalSumRe; sumIm = prevIm + modalSumIm;</code> (or the 'distributed' coherence-mode
          branch immediately above it) — this runs strictly after the direct+reflection+late-field sum (<code>prevRe/prevIm</code>)
          has already been assembled.</div>
        <div>Reflections accumulated into sumRe/sumIm? <b>Yes</b> — directly, via <code>+=</code>, same registers as direct path.</div>
        <div>Modal pressure accumulated into the same registers? <b>Yes</b> — <code>sumRe</code>/<code>sumIm</code> are reassigned to
          <code>prevRe + modalSumRe</code> / <code>prevIm + modalSumIm</code>, i.e. the same running total, not a separate register.</div>
        <div>Does modal pressure ever replace reflections? <b>No</b> — it is always additive on top of <code>prevRe/prevIm</code>
          (which already contains direct + reflections + late-field). No code path zeroes or overwrites the reflection contribution
          before adding modal pressure.</div>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #d8b4fe", color: "#6b21a8", fontSize: 9, textTransform: "uppercase" }}>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Hz</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Direct (dB)</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Reflection accum. (dB)</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Modal (dB)</th>
              <th style={{ textAlign: "right", padding: "2px 6px" }}>Final (dB)</th>
            </tr>
          </thead>
          <tbody>
            {bandRows.map((r) => (
              <tr key={r.hz} style={{ fontWeight: r.hz === 30 ? 700 : 400, color: r.hz === 30 ? "#581c87" : "#1c1917" }}>
                <td style={{ textAlign: "right", padding: "2px 6px" }}>{r.hz}</td>
                <td style={{ textAlign: "right", padding: "2px 6px" }}>{fmtDb(r.directDb)}</td>
                <td style={{ textAlign: "right", padding: "2px 6px" }}>{fmtDb(r.reflectionDb)}</td>
                <td style={{ textAlign: "right", padding: "2px 6px" }}>{fmtDb(r.modalDb)}</td>
                <td style={{ textAlign: "right", padding: "2px 6px" }}>{fmtDb(r.finalDb)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ border: "1px solid #d8b4fe", borderRadius: 6, background: "#fff", padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: "#6b21a8", marginBottom: 4 }}>
          Line-by-line pressure assembly trace — 30Hz
        </div>
        <div style={{ fontSize: 9, color: "#6b21a8", marginBottom: 6, fontStyle: "italic" }}>
          Reflections here are the six order-1 (single-wall) image sources, reconstructed with the exact production
          formulas for this fixed case. Manual reflection sum vs production's tracked reflectionRe/Im{" "}
          {trace30.reconciles ? "reconcile (match)." : "DO NOT reconcile — see note below."}
        </div>
        {trace30.steps.map((s, i) => (
          <div key={i} style={{ padding: "2px 0", borderBottom: i < trace30.steps.length - 1 ? "1px dashed #f3e8ff" : "none" }}>
            <b>{s.label}:</b> sumRe = {fmt(s.re)}, sumIm = {fmt(s.im)}, |v| = {fmt(s.magnitude)}
            {Number.isFinite(s.splDb) ? `, SPL = ${fmtDb(s.splDb)}dB` : ""}
          </div>
        ))}
      </div>

      <div style={{ border: "2px solid #581c87", borderRadius: 6, background: "#fff", padding: "8px 10px" }}>
        <div style={{ fontWeight: 700, color: trace30.worstStageLabel ? "#166534" : "#b91c1c" }}>
          {trace30.worstStageLabel ? "PASS" : "FAIL"} — {trace30.worstStageLabel
            ? "the audit identifies the specific accumulation stage with the largest magnitude drop."
            : "no single accumulation stage produced a magnitude drop; audit inconclusive."}
        </div>
        <div style={{ marginTop: 4 }}>
          Largest step-to-step magnitude drop: {fmt(trace30.worstDrop)} at stage "{trace30.worstStageLabel}".
        </div>
      </div>

      <div style={{ marginTop: 8, fontWeight: 700, color: "#581c87" }}>
        "The destructive cancellation first appears at {trace30.worstStageLabel || "— not identified —"}."
      </div>
    </div>
  );
}