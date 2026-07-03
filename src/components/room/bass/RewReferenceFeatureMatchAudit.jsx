// RewReferenceFeatureMatchAudit.jsx
// Temporary READ-ONLY diagnostic — compares production (A) against three isolated
// component variants (B: direct+modal, C: direct+reflection, D: modal-only) using the
// exact production direct/reflection/modal vectors (perFrequencyVectorDebug, unmodified).
// Measurement only — no fix recommended, no production behaviour changed.
//
// Fixed test case: room 5.0m (L) x 4.5m (W) x 3.0m (H), sub centre-front,
// seat y=4.0m, absorption 0.30 all surfaces, frequencies 28-35Hz, one sub only.

import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";

const ROOM_DIMS = { widthM: 4.5, lengthM: 5.0, heightM: 3.0 };
const SUB = { x: 4.5 / 2, y: 0.1, z: 0.35, modelKey: "test-sub", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT = { x: 4.5 / 2, y: 4.0, z: 1.2 };
const SURFACE_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const TEST_FREQS = [28, 29, 30, 31, 32, 33, 34, 35];

function magDb(re, im) {
  return 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10));
}

function runSinglePoint(frequencyHz) {
  const result = simulateBassResponseRewCore(ROOM_DIMS, SEAT, SUB, FLAT_CURVE, {
    freqMinHz: frequencyHz,
    freqMaxHz: frequencyHz + 0.01,
    modeGenerationFMaxHz: 200,
    surfaceAbsorption: SURFACE_ABSORPTION,
    enableReflections: true,
    enableModes: true,
  });
  return result.perFrequencyVectorDebug[0] || {};
}

// Recombine production direct/reflection/modal vectors per variant. Uses ONLY the
// exact vectors already computed by the production engine — no new physics.
function recombine(variant, vec) {
  const { directRe = 0, directIm = 0, reflectionRe = 0, reflectionIm = 0, modalSumRe = 0, modalSumIm = 0 } = vec;
  if (variant === "A") return { re: directRe + reflectionRe + modalSumRe, im: directIm + reflectionIm + modalSumIm };
  if (variant === "B") return { re: directRe + modalSumRe, im: directIm + modalSumIm };
  if (variant === "C") return { re: directRe + reflectionRe, im: directIm + reflectionIm };
  return { re: modalSumRe, im: modalSumIm }; // D
}

function localExtrema(rows, key) {
  // local min/max = interior point lower/higher than both neighbours (edge points compared to single neighbour)
  let minHz = null, minDb = Infinity, maxHz = null, maxDb = -Infinity;
  rows.forEach((r) => {
    if (r[key] < minDb) { minDb = r[key]; minHz = r.hz; }
    if (r[key] > maxDb) { maxDb = r[key]; maxHz = r.hz; }
  });
  return { minHz, minDb, maxHz, maxDb };
}

function detectArtifact(rows, key, referenceRows, referenceKey) {
  // A "new" local extremum is one whose hz doesn't match production's local extremum hz.
  const variantExt = localExtrema(rows, key);
  const refExt = localExtrema(referenceRows, referenceKey);
  const newMin = variantExt.minHz !== refExt.minHz;
  const newMax = variantExt.maxHz !== refExt.maxHz;
  return { newMin, newMax, variantExt, refExt };
}

export default function RewReferenceFeatureMatchAudit() {
  const variantRows = useMemo(() => {
    const perFreqVec = TEST_FREQS.map((hz) => ({ hz, vec: runSinglePoint(hz) }));
    const build = (variant) => perFreqVec.map(({ hz, vec }) => {
      const { re, im } = recombine(variant, vec);
      return { hz, db: magDb(re, im) };
    });
    return { A: build("A"), B: build("B"), C: build("C"), D: build("D") };
  }, []);

  const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

  const analyses = useMemo(() => {
    const refRows = variantRows.A;
    return ["A", "B", "C", "D"].map((variant) => {
      const rows = variantRows[variant];
      const ext = localExtrema(rows, "db");
      const row30 = rows.find((r) => r.hz === 30);
      // REW expectation: rising/peak trend 30-34Hz, not a deep null centred at 30Hz.
      const row28 = rows.find((r) => r.hz === 28);
      const row34 = rows.find((r) => r.hz === 34);
      const trendRising = row34 && row30 ? (row34.db - row30.db) > 1 : false;
      const nullAt30 = ext.minHz === 30 || ext.minHz === 29 || ext.minHz === 31;
      const sameStoryAsRew = trendRising && !nullAt30;
      const artifact = variant === "A" ? { newMin: false, newMax: false } : detectArtifact(rows, "db", refRows, "db");
      const removedNull = variant === "A" ? false : (ext.minDb - localExtrema(refRows, "db").minDb) > 1;
      const passes = variant !== "A" && removedNull && !artifact.newMin && !artifact.newMax;
      return { variant, rows, ext, row30, trendRising, nullAt30, sameStoryAsRew, artifact, removedNull, passes };
    });
  }, [variantRows]);

  const VARIANT_LABELS = {
    A: "A — Production (direct + reflection + modal)",
    B: "B — REW-visible-equivalent (direct + modal only)",
    C: "C — Reflection-only (direct + reflection, no modal)",
    D: "D — Modal-only (no direct, no reflection)",
  };

  const passingVariants = analyses.filter((a) => a.passes).map((a) => a.variant);

  return (
    <div style={{ border: "2px solid #0f766e", borderRadius: 8, background: "#f0fdfa", padding: "10px 12px", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: "#134e4a", fontSize: 12, marginBottom: 4 }}>
        REW Reference Feature Match Audit — temporary diagnostic (measurement only, no fix applied)
      </div>
      <div style={{ color: "#115e59", fontSize: 9, marginBottom: 8, fontStyle: "italic" }}>
        Room 5.0m x 4.5m x 3.0m — sub centre-front — seat y=4.0m — absorption 0.30 — one sub — 28-35Hz.
        Vectors (direct/reflection/modal) are exact production values; only the summation (which vectors are included) differs per variant.
        REW expectation: a peak/rise around 30-34Hz, not a deep null.
      </div>

      {analyses.map(({ variant, rows, ext, row30, trendRising, nullAt30, sameStoryAsRew, artifact, removedNull, passes }) => (
        <div key={variant} style={{ border: "1px solid #99f6e4", borderRadius: 6, background: "#fff", padding: "8px 10px", marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: "#0f766e", marginBottom: 6 }}>{VARIANT_LABELS[variant]}</div>
          <div style={{ overflowX: "auto", marginBottom: 6 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 480 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #99f6e4", color: "#0f766e", fontSize: 9, textTransform: "uppercase" }}>
                  {TEST_FREQS.map((hz) => (
                    <th key={hz} style={{ textAlign: "right", padding: "2px 6px" }}>{hz}Hz</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {rows.map((r) => (
                    <td key={r.hz} style={{ textAlign: "right", padding: "2px 6px", fontWeight: r.hz === ext.minHz || r.hz === ext.maxHz ? 700 : 400, color: r.hz === ext.minHz ? "#b91c1c" : r.hz === ext.maxHz ? "#166534" : "#1c1917" }}>
                      {fmt(r.db)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div>Local min: {fmt(ext.minDb)}dB at {ext.minHz}Hz &nbsp; | &nbsp; Local max: {fmt(ext.maxDb)}dB at {ext.maxHz}Hz</div>
          <div>30Hz SPL: {fmt(row30?.db)}dB &nbsp; | &nbsp; Trend 30&rarr;34Hz rising (&gt;1dB): {trendRising ? "yes" : "no"} &nbsp; | &nbsp; Null centred at 30Hz: {nullAt30 ? "yes" : "no"}</div>
          <div>Tells same story as REW (rise, no null): <span style={{ fontWeight: 700, color: sameStoryAsRew ? "#166534" : "#b91c1c" }}>{sameStoryAsRew ? "YES" : "NO"}</span></div>
          {variant !== "A" && (
            <>
              <div>Removes 30Hz null vs production (&gt;1dB rise in local min): {removedNull ? "YES" : "no"}</div>
              <div>New artificial local min introduced (different Hz than production): {artifact.newMin ? "YES ⚠" : "no"}</div>
              <div>New artificial local max introduced (different Hz than production): {artifact.newMax ? "YES ⚠" : "no"}</div>
              <div style={{ fontWeight: 700, color: passes ? "#166534" : "#b91c1c", marginTop: 4 }}>
                Pass criteria (removes null, no new artifact): {passes ? "PASS" : "FAIL"}
              </div>
            </>
          )}
        </div>
      ))}

      <div style={{ border: "2px solid #0f766e", borderRadius: 6, background: "#fff", padding: "8px 10px" }}>
        <div>TEST: Compare production (A) vs isolated-component variants (B: direct+modal, C: direct+reflection, D: modal-only) at 28-35Hz against REW's expected 30-34Hz rise.</div>
        <div>EXPECTED: A variant matching REW's documented behaviour would show a rising/peaking trend from 30-34Hz with no deep null centred at 30Hz, and no new artificial peak/null introduced elsewhere in the band.</div>
        <div>
          ACTUAL: A shows local min {fmt(localExtrema(variantRows.A, "db").minDb)}dB at {localExtrema(variantRows.A, "db").minHz}Hz.
          {" "}{analyses.filter(a => a.variant !== "A").map(a => ` ${a.variant} local min ${fmt(a.ext.minDb)}dB at ${a.ext.minHz}Hz (${a.sameStoryAsRew ? "matches REW story" : "does not match REW story"}).`).join("")}
        </div>
        <div>DELTA: {passingVariants.length > 0 ? `Variant(s) ${passingVariants.join(", ")} meet the pass criteria (null removed, no new artifact).` : "No variant meets the pass criteria without introducing a new artifact or failing to remove the null."}</div>
        <div>SEVERITY: {passingVariants.length > 0 ? "Informative — candidate(s) identified for further investigation" : "Unresolved — none of the isolated component variants alone reproduce REW's expected curve shape"}</div>
        <div>NEXT TEST: This is measurement only — no fix is recommended here. Further audits should test blended/partial recombinations (e.g. frequency-dependent gating) rather than the hard on/off variants tested above.</div>
      </div>
    </div>
  );
}