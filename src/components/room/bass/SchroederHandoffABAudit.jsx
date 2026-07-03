// SchroederHandoffABAudit.jsx
// Temporary READ-ONLY diagnostic — compares production (A) against two candidate
// Schroeder-frequency handoff strategies (B: hard switch, C: fade-in) using the
// exact production direct/reflection/modal vectors (read via perFrequencyVectorDebug,
// unmodified). Recombination logic (the gating itself) is diagnostic-only — it does
// not alter simulateBassResponseRewCore, its options, or its returned values.
//
// No production behaviour, graph output, or physics is changed.
//
// Fixed test case: room 5.0m (L) x 4.5m (W) x 3.0m (H), sub centre-front,
// seat y=4.0m, absorption 0.30 all surfaces, frequencies 20-200Hz (detail 28-35Hz).

import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";

const ROOM_DIMS = { widthM: 4.5, lengthM: 5.0, heightM: 3.0 };
const SUB = { x: 4.5 / 2, y: 0.1, z: 0.35, modelKey: "test-sub", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
const SEAT = { x: 4.5 / 2, y: 4.0, z: 1.2 };
const SURFACE_ABSORPTION = { front: 0.3, back: 0.3, left: 0.3, right: 0.3, floor: 0.3, ceiling: 0.3 };
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const DETAIL_FREQS = [28, 29, 30, 31, 32, 33, 34, 35];
const FADE_WIDTH_HZ = 40;

function magDb(re, im) {
  return 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-10));
}

function schroederFrequency() {
  return 2000 * Math.sqrt(0.4 / (ROOM_DIMS.widthM * ROOM_DIMS.lengthM * ROOM_DIMS.heightM));
}

// Recombine production direct/reflection/modal vectors per the requested variant.
// Uses ONLY the exact vectors already computed by the production engine.
function recombine(variant, frequencyHz, schroederHz, vec) {
  const { directRe, directIm, reflectionRe, reflectionIm, modalSumRe, modalSumIm } = vec;

  if (variant === "A") {
    return { re: directRe + reflectionRe + modalSumRe, im: directIm + reflectionIm + modalSumIm };
  }

  if (variant === "B") {
    // Hard switch: below Schroeder, drop reflections entirely.
    if (frequencyHz < schroederHz) {
      return { re: directRe + modalSumRe, im: directIm + modalSumIm };
    }
    return { re: directRe + reflectionRe + modalSumRe, im: directIm + reflectionIm + modalSumIm };
  }

  // C: fade-in from schroederHz to schroederHz + FADE_WIDTH_HZ
  const fadeFactor = Math.max(0, Math.min(1, (frequencyHz - schroederHz) / FADE_WIDTH_HZ));
  return {
    re: directRe + modalSumRe + fadeFactor * reflectionRe,
    im: directIm + modalSumIm + fadeFactor * reflectionIm,
  };
}

function runSweep(freqMinHz, freqMaxHz) {
  return simulateBassResponseRewCore(ROOM_DIMS, SEAT, SUB, FLAT_CURVE, {
    freqMinHz,
    freqMaxHz,
    modeGenerationFMaxHz: 200,
    surfaceAbsorption: SURFACE_ABSORPTION,
    enableReflections: true,
    enableModes: true,
  });
}

function runSinglePoint(frequencyHz) {
  const result = runSweep(frequencyHz, frequencyHz + 0.01);
  return result.perFrequencyVectorDebug[0] || {};
}

export default function SchroederHandoffABAudit() {
  const schroederHz = useMemo(() => schroederFrequency(), []);

  // Detail rows: 28-35Hz, exact production vectors per integer Hz.
  const detailRows = useMemo(() => DETAIL_FREQS.map((hz) => {
    const vec = runSinglePoint(hz);
    const a = recombine("A", hz, schroederHz, vec);
    const b = recombine("B", hz, schroederHz, vec);
    const c = recombine("C", hz, schroederHz, vec);
    const aDb = magDb(a.re, a.im);
    const bDb = magDb(b.re, b.im);
    const cDb = magDb(c.re, c.im);
    return { hz, aDb, bDb, cDb, deltaBvA: bDb - aDb, deltaCvA: cDb - aDb };
  }), [schroederHz]);

  // Full sweep 20-200Hz for null-depth and artificial peak/null detection.
  const sweep = useMemo(() => {
    const result = runSweep(20, 200);
    return result.perFrequencyVectorDebug.map((vec) => {
      const hz = vec.frequencyHz;
      const a = recombine("A", hz, schroederHz, vec);
      const b = recombine("B", hz, schroederHz, vec);
      const c = recombine("C", hz, schroederHz, vec);
      return { hz, aDb: magDb(a.re, a.im), bDb: magDb(b.re, b.im), cDb: magDb(c.re, c.im) };
    });
  }, [schroederHz]);

  const nullDepth = (rows, key) => {
    const inBand = rows.filter((r) => r.hz >= 29 && r.hz <= 31);
    if (inBand.length === 0) return null;
    return Math.min(...inBand.map((r) => r[key]));
  };
  const nullA = nullDepth(detailRows, "aDb");
  const nullB = nullDepth(detailRows, "bDb");
  const nullC = nullDepth(detailRows, "cDb");

  const peakAt30 = (rows, key) => {
    const row30 = rows.find((r) => r.hz === 30);
    return row30 ? row30[key] : null;
  };

  // Detect new artificial peak/null above Schroeder: any |delta| > 3dB vs production (A) above schroederHz.
  const aboveSchroeder = sweep.filter((r) => r.hz > schroederHz);
  const findArtifact = (key) => {
    let worst = null;
    aboveSchroeder.forEach((r) => {
      const delta = Math.abs(r[key] - r.aDb);
      if (delta > 3 && (!worst || delta > worst.delta)) {
        worst = { hz: r.hz, delta, variantDb: r[key], productionDb: r.aDb };
      }
    });
    return worst;
  };
  const artifactB = findArtifact("bDb");
  const artifactC = findArtifact("cDb");

  const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "—");

  const nullRaisedB = nullA !== null && nullB !== null && (nullB - nullA) > 1;
  const nullRaisedC = nullA !== null && nullC !== null && (nullC - nullA) > 1;
  const restored30HzB = peakAt30(detailRows, "bDb") !== null && nullA !== null && (peakAt30(detailRows, "bDb") - nullA) > 3;
  const restored30HzC = peakAt30(detailRows, "cDb") !== null && nullA !== null && (peakAt30(detailRows, "cDb") - nullA) > 3;

  let verdictLabel;
  if ((nullRaisedB || nullRaisedC) && !artifactB && !artifactC) {
    verdictLabel = "LOW-FREQUENCY IMAGE-SOURCE / MODAL OVERLAP CONFIRMED AS CAUSE — HANDOFF RAISES NULL WITHOUT DAMAGING HIGHER-FREQUENCY RESPONSE";
  } else if ((nullRaisedB || nullRaisedC) && (artifactB || artifactC)) {
    verdictLabel = "NULL PARTIALLY EXPLAINED BY OVERLAP, BUT HANDOFF INTRODUCES NEW ARTIFACTS ABOVE SCHROEDER";
  } else {
    verdictLabel = "OVERLAP NOT THE PRIMARY CAUSE OF THE 29-31 Hz NULL";
  }

  const testStr = `A/B/C comparison of production (A) vs Schroeder hard-switch (B) vs fade-in (C) reflection gating at 28-35Hz, room 5.0x4.5x3.0m, Schroeder=${fmt(schroederHz, 1)}Hz.`;
  const expectedStr = "If low-frequency image-source/modal overlap causes the 29-30Hz null, B and C should raise the null depth without introducing new peaks/nulls above Schroeder.";
  const actualStr = `Null depth: A=${fmt(nullA)}dB, B=${fmt(nullB)}dB (Δ${fmt(nullB - nullA)}dB), C=${fmt(nullC)}dB (Δ${fmt(nullC - nullA)}dB). 30Hz restored: B=${restored30HzB ? "yes" : "no"}, C=${restored30HzC ? "yes" : "no"}.`;
  const deltaStr = `Artifacts above Schroeder: B=${artifactB ? `${fmt(artifactB.delta)}dB at ${fmt(artifactB.hz)}Hz` : "none >3dB"}, C=${artifactC ? `${fmt(artifactC.delta)}dB at ${fmt(artifactC.hz)}Hz` : "none >3dB"}.`;
  const severityStr = verdictLabel.startsWith("LOW-FREQUENCY") ? "High (candidate fix)" : verdictLabel.startsWith("NULL PARTIALLY") ? "Medium" : "Low";
  const nextTestStr = verdictLabel.startsWith("LOW-FREQUENCY")
    ? "Prototype variant C (fade-in) as the production reflection-gating strategy and re-run the full REW parity benchmark."
    : verdictLabel.startsWith("NULL PARTIALLY")
      ? "Narrow the fade width or adjust the hard-switch threshold to avoid the introduced artifact, then re-test."
      : "Investigate other candidate causes (modal Q, source excitation, direct/modal phase alignment) for the 29-31Hz null.";

  return (
    <div style={{ border: "2px solid #7c2d12", borderRadius: 8, background: "#fff7ed", padding: "10px 12px", fontSize: 10, fontFamily: "monospace", marginBottom: 8 }}>
      <div style={{ fontWeight: 700, color: "#7c2d12", fontSize: 12, marginBottom: 4 }}>
        Schroeder Handoff A/B Audit — temporary diagnostic (production vectors, unmodified)
      </div>
      <div style={{ color: "#9a3412", fontSize: 9, marginBottom: 8, fontStyle: "italic" }}>
        Room 5.0m x 4.5m x 3.0m — sub centre-front — seat y=4.0m — absorption 0.30 — Schroeder frequency = {fmt(schroederHz, 1)}Hz.
        A = production (direct+reflection+modal always). B = hard switch (reflections only above Schroeder). C = fade-in (reflections fade from Schroeder to Schroeder+{FADE_WIDTH_HZ}Hz).
        Direct/reflection/modal vectors are exact production values — only the recombination (gating) is diagnostic.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 8 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620, background: "#fff", borderRadius: 6 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #fed7aa", color: "#7c2d12", fontSize: 9, textTransform: "uppercase" }}>
              <th style={{ textAlign: "right", padding: "3px 8px" }}>Hz</th>
              <th style={{ textAlign: "right", padding: "3px 8px" }}>A (prod) dB</th>
              <th style={{ textAlign: "right", padding: "3px 8px" }}>B (hard) dB</th>
              <th style={{ textAlign: "right", padding: "3px 8px" }}>C (fade) dB</th>
              <th style={{ textAlign: "right", padding: "3px 8px" }}>Δ B vs A</th>
              <th style={{ textAlign: "right", padding: "3px 8px" }}>Δ C vs A</th>
            </tr>
          </thead>
          <tbody>
            {detailRows.map((r) => (
              <tr key={r.hz} style={{ borderBottom: "1px solid #ffedd5", background: r.hz >= 29 && r.hz <= 31 ? "#ffedd5" : undefined }}>
                <td style={{ textAlign: "right", padding: "2px 8px", fontWeight: 700 }}>{r.hz}</td>
                <td style={{ textAlign: "right", padding: "2px 8px" }}>{fmt(r.aDb)}</td>
                <td style={{ textAlign: "right", padding: "2px 8px" }}>{fmt(r.bDb)}</td>
                <td style={{ textAlign: "right", padding: "2px 8px" }}>{fmt(r.cDb)}</td>
                <td style={{ textAlign: "right", padding: "2px 8px", color: r.deltaBvA > 0 ? "#166534" : "#b91c1c" }}>{fmt(r.deltaBvA)}</td>
                <td style={{ textAlign: "right", padding: "2px 8px", color: r.deltaCvA > 0 ? "#166534" : "#b91c1c" }}>{fmt(r.deltaCvA)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ border: "1px solid #fed7aa", borderRadius: 6, background: "#fff", padding: "8px 10px", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: "#7c2d12", marginBottom: 4 }}>Summary</div>
        <div>Null depth (29-31Hz): A={fmt(nullA)}dB, B={fmt(nullB)}dB, C={fmt(nullC)}dB</div>
        <div>30Hz SPL: A={fmt(peakAt30(detailRows, "aDb"))}dB, B={fmt(peakAt30(detailRows, "bDb"))}dB, C={fmt(peakAt30(detailRows, "cDb"))}dB</div>
        <div>30Hz peak restored vs null (&gt;3dB rise): B={restored30HzB ? "YES" : "no"}, C={restored30HzC ? "YES" : "no"}</div>
        <div>New artificial peak/null above Schroeder (&gt;3dB vs production): B={artifactB ? `YES at ${fmt(artifactB.hz)}Hz (Δ${fmt(artifactB.delta)}dB)` : "no"}, C={artifactC ? `YES at ${fmt(artifactC.hz)}Hz (Δ${fmt(artifactC.delta)}dB)` : "no"}</div>
      </div>

      <div style={{ border: "2px solid #7c2d12", borderRadius: 6, background: "#fff", padding: "8px 10px" }}>
        <div>TEST: {testStr}</div>
        <div>EXPECTED: {expectedStr}</div>
        <div>ACTUAL: {actualStr}</div>
        <div>DELTA: {deltaStr}</div>
        <div>SEVERITY: {severityStr}</div>
        <div>NEXT TEST: {nextTestStr}</div>
        <div style={{ fontWeight: 700, marginTop: 6, color: "#b91c1c" }}>{verdictLabel}</div>
      </div>
    </div>
  );
}