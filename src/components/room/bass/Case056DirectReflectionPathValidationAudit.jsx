import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 056 — Direct / Reflection Path Validation (read-only, diagnostic only).
// Isolates whether the remaining REW mismatch comes from B44's direct/reflection field
// rather than the modal engine (already cleared in Cases 052-055). Reflection geometry,
// attenuation, and coherence-weight formulas below are copied verbatim from
// rewBassEngine.js's production reflection path for reporting only — nothing here feeds
// back into the production engine.

const SPEED_OF_SOUND_MPS = 343;
const TARGET_FREQS = [30.8, 45.6, 58.9, 84.0];
const NULL_BAND_LO = 20;
const NULL_BAND_HI = 80;
const REW_OBSERVED_NULL_HZ = 45.6;
const CURVE_DB = 94; // flat reference curve used by this audit, matches FLAT_CURVE below

const FLAT_CURVE = [{ hz: 20, db: CURVE_DB }, { hz: 200, db: CURVE_DB }];
const ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
  freqMinHz: 20,
  freqMaxHz: 200,
  pureDeterministicModalSum: true,
  disableLateField: true,
  disableModalPropagationPhase: true,
  modalSourceReferenceMode: "existing",
  qStrategy: "production",
  debugReflectionOrder: 1,
};

function fmt(v, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }
function magPhase(re, im) { return { mag: Math.sqrt(re * re + im * im), phaseDeg: (Math.atan2(im, re) * 180) / Math.PI }; }
function toDb(mag) { return 20 * Math.log10(Math.max(mag, 1e-10)); }

function resolveLiveInputs(appState) {
  const roomDims = appState?.roomDims || { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
  const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
  const seat = seats.find((s) => s && s.isPrimary) || seats[0] || { x: (roomDims.widthM || 4.5) / 2, y: (roomDims.lengthM || 6) * 0.6, z: 1.2 };
  const frontCfg = appState?.frontSubsCfg;
  const roomWidth = roomDims.widthM || 4.5;
  let sub;
  if (frontCfg?.count > 0 && Array.isArray(frontCfg.positions) && frontCfg.positions[0]) {
    const pos = frontCfg.positions[0];
    sub = { x: pos.x, y: pos.y, z: Number.isFinite(pos.z) ? pos.z : 0.35, modelKey: frontCfg.model || "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  } else {
    sub = { x: roomWidth * 0.33, y: 0.15, z: 0.35, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  }
  return { roomDims: { widthM: roomWidth, lengthM: roomDims.lengthM || 6.0, heightM: roomDims.heightM || 2.4 }, seat, sub };
}

// First-order image sources — mirrors rewBassEngine.js buildImageSources() exactly for order=1.
function buildFirstOrderImages(sx, sy, sz, W, L, H, sa) {
  const images = [];
  const push = (label, x, y, z, alpha) => images.push({ label, x, y, z, reflectionCoefficient: Math.sqrt(1 - alpha) });
  push("left (x=0)", -sx, sy, sz, sa.left);
  push("right (x=W)", 2 * W - sx, sy, sz, sa.right);
  push("front (y=0)", sx, -sy, sz, sa.front);
  push("back (y=L)", sx, 2 * L - sy, sz, sa.back);
  push("floor (z=0)", sx, sy, -sz, sa.floor);
  push("ceiling (z=H)", sx, sy, 2 * H - sz, sa.ceiling);
  return images;
}

function reflectionCoherenceWeight(freqHz) {
  return Math.min(0.75, Math.max(0.25, 0.25 + 0.5 * Math.max(0, Math.min(1, (freqHz - 20) / 140))));
}

function findFirstDestructiveNull(series) {
  const band = series.filter((p) => p.frequency >= NULL_BAND_LO && p.frequency <= NULL_BAND_HI && Number.isFinite(p.spl));
  for (let i = 1; i < band.length - 1; i++) {
    if (band[i].spl < band[i - 1].spl && band[i].spl < band[i + 1].spl) return band[i];
  }
  if (band.length === 0) return null;
  return band.reduce((min, p) => (p.spl < min.spl ? p : min), band[0]);
}

export default function Case056DirectReflectionPathValidationAudit() {
  const appState = useAppState();

  const result = useMemo(() => {
    const { roomDims, seat, sub } = resolveLiveInputs(appState);
    const engineResult = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const vecDebug = engineResult.perFrequencyVectorDebug || [];
    const nearestVecRow = (targetHz) => vecDebug.reduce((best, row) =>
      !best || Math.abs(row.frequencyHz - targetHz) < Math.abs(best.frequencyHz - targetHz) ? row : best, null);

    const surfaceAbsorption = ENGINE_OPTIONS.surfaceAbsorption;
    const images = buildFirstOrderImages(sub.x, sub.y, sub.z, roomDims.widthM, roomDims.lengthM, roomDims.heightM, surfaceAbsorption);
    const directDistanceM = Math.max(0.01, Math.sqrt(
      (sub.x - seat.x) ** 2 + (sub.y - seat.y) ** 2 + (sub.z - seat.z) ** 2
    ));

    // --- Per-target-frequency direct/reflection/combined report ---
    const perFrequencyReport = TARGET_FREQS.map((targetHz) => {
      const vecRow = nearestVecRow(targetHz);
      if (!vecRow) return { targetHz, error: "no data at this frequency" };
      const f = vecRow.frequencyHz;

      // Direct field (matches engine's direct path formula exactly)
      const distanceLossDb = -20 * Math.log10(directDistanceM / 1);
      const totalPhase = -2 * Math.PI * f * (directDistanceM / SPEED_OF_SOUND_MPS);
      const directAmp = Math.pow(10, (CURVE_DB + distanceLossDb) / 20);
      const direct = {
        pathDistanceM: directDistanceM,
        delayMs: (directDistanceM / SPEED_OF_SOUND_MPS) * 1000,
        attenuationDb: distanceLossDb,
        phaseDeg: (totalPhase * 180) / Math.PI,
        re: vecRow.directRe,
        im: vecRow.directIm,
        magnitude: magPhase(vecRow.directRe, vecRow.directIm).mag,
      };

      // Reflection field — per active image path
      const weight = reflectionCoherenceWeight(f);
      const reflectionRows = images.map((img) => {
        const dx = img.x - seat.x, dy = img.y - seat.y, dz = img.z - seat.z;
        const imgDistanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
        const imgLossDb = -20 * Math.log10(imgDistanceM / 1);
        const imgAmp = Math.pow(10, (CURVE_DB + imgLossDb) / 20) * img.reflectionCoefficient;
        const imgPhase = -2 * Math.PI * f * (imgDistanceM / SPEED_OF_SOUND_MPS);
        const re = weight * imgAmp * Math.cos(imgPhase);
        const im = weight * imgAmp * Math.sin(imgPhase);
        const mag = Math.sqrt(re * re + im * im);
        const vsDirect = re * vecRow.directRe + im * vecRow.directIm;
        const vsModal = re * vecRow.modalSumRe + im * vecRow.modalSumIm;
        return {
          label: img.label,
          pathDistanceM: imgDistanceM,
          extraPathM: imgDistanceM - directDistanceM,
          delayMs: (imgDistanceM / SPEED_OF_SOUND_MPS) * 1000,
          reflectionCoefficient: img.reflectionCoefficient,
          attenuationDb: imgLossDb,
          phaseDeg: (imgPhase * 180) / Math.PI,
          re, im, magnitude: mag,
          vsDirect: vsDirect >= 0 ? "constructive" : "destructive",
          vsModal: vsModal >= 0 ? "constructive" : "destructive",
        };
      });

      const reflectionVec = magPhase(vecRow.reflectionRe, vecRow.reflectionIm);
      const directVec = magPhase(vecRow.directRe, vecRow.directIm);
      const directPlusReflection = magPhase(vecRow.directRe + vecRow.reflectionRe, vecRow.directIm + vecRow.reflectionIm);
      const modalVec = magPhase(vecRow.modalSumRe, vecRow.modalSumIm);
      const finalVec = magPhase(vecRow.finalRe, vecRow.finalIm);

      return {
        targetHz, actualHz: f, direct, reflectionRows,
        directVec, reflectionVec, directPlusReflection, modalVec, finalVec,
        finalSpl: toDb(finalVec.mag),
      };
    });

    // --- Variants A-J across the full spectrum ---
    const variantKeys = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
    const variantSeries = {};

    // J needs its own per-frequency reflection recompute with delay removed (phase from direct distance).
    const jReflectionAt = (row) => {
      const f = row.frequencyHz;
      const weight = reflectionCoherenceWeight(f);
      const jPhase = -2 * Math.PI * f * (directDistanceM / SPEED_OF_SOUND_MPS);
      let sumRe = 0, sumIm = 0;
      images.forEach((img) => {
        const dx = img.x - seat.x, dy = img.y - seat.y, dz = img.z - seat.z;
        const imgDistanceM = Math.max(0.01, Math.sqrt(dx * dx + dy * dy + dz * dz));
        const imgLossDb = -20 * Math.log10(imgDistanceM / 1);
        const imgAmp = Math.pow(10, (CURVE_DB + imgLossDb) / 20) * img.reflectionCoefficient;
        sumRe += weight * imgAmp * Math.cos(jPhase);
        sumIm += weight * imgAmp * Math.sin(jPhase);
      });
      return { re: sumRe, im: sumIm };
    };

    variantKeys.forEach((variant) => {
      variantSeries[variant] = vecDebug.map((row) => {
        let re = 0, im = 0;
        switch (variant) {
          case "A": re = row.finalRe; im = row.finalIm; break;
          case "B": re = row.directRe; im = row.directIm; break;
          case "C": re = row.reflectionRe; im = row.reflectionIm; break;
          case "D": re = row.directRe + row.reflectionRe; im = row.directIm + row.reflectionIm; break;
          case "E": re = row.modalSumRe; im = row.modalSumIm; break;
          case "F": re = row.directRe + row.modalSumRe; im = row.directIm + row.modalSumIm; break;
          case "G": re = row.reflectionRe + row.modalSumRe; im = row.reflectionIm + row.modalSumIm; break;
          case "H": re = row.directRe - row.reflectionRe + row.modalSumRe; im = row.directIm - row.reflectionIm + row.modalSumIm; break;
          case "I": re = row.directRe + row.modalSumRe; im = row.directIm + row.modalSumIm; break;
          case "J": { const j = jReflectionAt(row); re = row.directRe + j.re + row.modalSumRe; im = row.directIm + j.im + row.modalSumIm; break; }
          default: break;
        }
        return { frequency: row.frequencyHz, spl: toDb(Math.sqrt(re * re + im * im)) };
      }).sort((a, b) => a.frequency - b.frequency);
    });

    const variantReport = variantKeys.map((variant) => {
      const series = variantSeries[variant];
      const splAt = (targetHz) => {
        const p = series.reduce((best, pt) => Math.abs(pt.frequency - targetHz) < Math.abs(best.frequency - targetHz) ? pt : best, series[0]);
        return p ? p.spl : null;
      };
      const nullPt = findFirstDestructiveNull(series);
      const nullDepth = nullPt ? (Math.max(...series.filter(p => Math.abs(p.frequency - nullPt.frequency) <= 8).map(p => p.spl)) - nullPt.spl) : null;
      return { variant, spl30_8: splAt(30.8), spl45_6: splAt(45.6), spl58_9: splAt(58.9), nullFreq: nullPt?.frequency ?? null, nullDepth };
    });

    const productionRow = variantReport.find((r) => r.variant === "A");
    variantReport.forEach((r) => {
      const freqDeltaToRew = Number.isFinite(r.nullFreq) ? Math.abs(r.nullFreq - REW_OBSERVED_NULL_HZ) : Infinity;
      const prodFreqDeltaToRew = Number.isFinite(productionRow?.nullFreq) ? Math.abs(productionRow.nullFreq - REW_OBSERVED_NULL_HZ) : Infinity;
      const deeperThanProd = Number.isFinite(r.nullDepth) && Number.isFinite(productionRow?.nullDepth) ? r.nullDepth >= productionRow.nullDepth : false;
      r.closerToRew = (freqDeltaToRew < prodFreqDeltaToRew - 0.5) || (freqDeltaToRew <= prodFreqDeltaToRew && deeperThanProd) ? "YES" : "NO";
    });

    const bestNonProdVariant = variantReport
      .filter((r) => r.variant !== "A" && r.closerToRew === "YES")
      .sort((a, b) => Math.abs(a.nullFreq - REW_OBSERVED_NULL_HZ) - Math.abs(b.nullFreq - REW_OBSERVED_NULL_HZ))[0];

    let verdict;
    if (!bestNonProdVariant) {
      verdict = "4. REFLECTION FIELD RETIRED";
    } else if (bestNonProdVariant.variant === "H") {
      verdict = "2. REFLECTION PHASE ERROR CONFIRMED";
    } else if (bestNonProdVariant.variant === "I") {
      verdict = "3. REFLECTION MAGNITUDE ERROR CONFIRMED";
    } else {
      verdict = "1. REFLECTION PATH ERROR CONFIRMED";
    }

    return { perFrequencyReport, variantReport, verdict, bestNonProdVariant };
  }, [appState?.roomDims, appState?.seatingPositions, appState?.frontSubsCfg]);

  return (
    <div style={{ border: "2px solid #0c4a6e", borderRadius: 10, background: "#f0f9ff", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#0c4a6e", fontSize: 13, marginBottom: 6 }}>
        Case 056 — Direct / Reflection Path Validation (read-only)
      </div>
      <div style={{ color: "#075985", marginBottom: 10 }}>
        Live room/seat/sub · production Q/modal maths untouched · first-order reflections only (matches production parity setting).
      </div>

      {result.perFrequencyReport.map((row) => (
        <div key={row.targetHz} style={{ marginBottom: 14, padding: 8, border: "1px solid #bae6fd", borderRadius: 6, background: "#fff" }}>
          <div style={{ fontWeight: 700, color: "#0c4a6e", marginBottom: 4 }}>{row.targetHz} Hz (actual bin {fmt(row.actualHz, 1)})</div>
          {row.error ? <div style={{ color: "#b91c1c" }}>{row.error}</div> : (
            <>
              <div style={{ marginBottom: 6, fontSize: 9 }}>
                <strong>Direct:</strong> dist={fmt(row.direct.pathDistanceM)}m delay={fmt(row.direct.delayMs, 2)}ms atten={fmt(row.direct.attenuationDb, 1)}dB ∠{fmt(row.direct.phaseDeg, 1)}° Re={fmt(row.direct.re)} Im={fmt(row.direct.im)} mag={fmt(row.direct.magnitude)}
              </div>
              <div style={{ overflowX: "auto", marginBottom: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
                  <thead>
                    <tr style={{ background: "#e0f2fe" }}>
                      {["Wall/image", "Path dist", "Extra path", "Delay ms", "Refl coeff", "Atten dB", "Phase°", "Re", "Im", "Mag", "vs Direct", "vs Modal"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "2px 4px", borderBottom: "1px solid #7dd3fc" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {row.reflectionRows.map((r, i) => (
                      <tr key={i}>
                        <td style={{ padding: "2px 4px" }}>{r.label}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(r.pathDistanceM)}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(r.extraPathM)}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(r.delayMs, 2)}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(r.reflectionCoefficient)}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(r.attenuationDb, 1)}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(r.phaseDeg, 1)}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(r.re)}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(r.im)}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(r.magnitude)}</td>
                        <td style={{ padding: "2px 4px", color: r.vsDirect === "constructive" ? "#166534" : "#b91c1c" }}>{r.vsDirect}</td>
                        <td style={{ padding: "2px 4px", color: r.vsModal === "constructive" ? "#166534" : "#b91c1c" }}>{r.vsModal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 9 }}>
                Direct: mag={fmt(row.directVec.mag)} ∠{fmt(row.directVec.phaseDeg, 1)}° · Reflection: mag={fmt(row.reflectionVec.mag)} ∠{fmt(row.reflectionVec.phaseDeg, 1)}° · Direct+Reflection: mag={fmt(row.directPlusReflection.mag)} ∠{fmt(row.directPlusReflection.phaseDeg, 1)}°<br/>
                Modal: mag={fmt(row.modalVec.mag)} ∠{fmt(row.modalVec.phaseDeg, 1)}° · Final: mag={fmt(row.finalVec.mag)} ∠{fmt(row.finalVec.phaseDeg, 1)}° · SPL={fmt(row.finalSpl, 2)} dB
              </div>
            </>
          )}
        </div>
      ))}

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "#0c4a6e", marginBottom: 4 }}>VARIANTS A–J</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
            <thead>
              <tr style={{ background: "#e0f2fe" }}>
                {["Variant", "SPL@30.8Hz", "SPL@45.6Hz", "SPL@58.9Hz", "1st null Hz (20–80)", "Null depth", "Closer to REW"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "3px 5px", borderBottom: "1px solid #7dd3fc" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.variantReport.map((r) => (
                <tr key={r.variant}>
                  <td style={{ padding: "2px 5px", fontWeight: 700 }}>{r.variant}</td>
                  <td style={{ padding: "2px 5px" }}>{fmt(r.spl30_8, 1)}</td>
                  <td style={{ padding: "2px 5px" }}>{fmt(r.spl45_6, 1)}</td>
                  <td style={{ padding: "2px 5px" }}>{fmt(r.spl58_9, 1)}</td>
                  <td style={{ padding: "2px 5px" }}>{fmt(r.nullFreq, 1)}</td>
                  <td style={{ padding: "2px 5px" }}>{fmt(r.nullDepth, 1)}</td>
                  <td style={{ padding: "2px 5px", fontWeight: 700, color: r.closerToRew === "YES" ? "#166534" : "#b91c1c" }}>{r.closerToRew}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 9, color: "#075985", marginTop: 4 }}>
          A=production · B=direct only · C=reflections only · D=direct+reflections only · E=modal only · F=modal+direct · G=modal+reflections · H=production with reflection phase inverted 180° · I=production with reflection magnitude removed · J=production with reflection path delay removed (phase from direct distance, magnitude unchanged). "Closer to REW" compares each variant's first destructive null (20–80 Hz) to the REW-observed reference ({REW_OBSERVED_NULL_HZ} Hz) against production.
        </div>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#0c4a6e", color: "#f0f9ff", border: "1px solid #075985" }}>
        <div style={{ fontWeight: 700 }}>TEST: Does the remaining REW mismatch come from B44's direct/reflection field rather than the modal engine?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED: if the direct/reflection path is the cause, one of variants B/C/D/H/I/J should move the null closer to the REW-observed reference than production (variant A); if not, the modal engine (already cleared in Cases 052-055) or an untested factor remains the cause.<br/>
          ACTUAL: {result.bestNonProdVariant ? `variant ${result.bestNonProdVariant.variant} moved the null to ${fmt(result.bestNonProdVariant.nullFreq, 1)} Hz (depth ${fmt(result.bestNonProdVariant.nullDepth, 1)} dB), closer to REW than production's ${fmt(result.variantReport.find(r=>r.variant==='A')?.nullFreq, 1)} Hz.` : "no direct/reflection-path variant moved the null closer to the REW-observed reference than production."}<br/>
          DELTA: {result.bestNonProdVariant ? `${fmt(Math.abs(result.bestNonProdVariant.nullFreq - REW_OBSERVED_NULL_HZ), 1)} Hz residual vs REW reference under variant ${result.bestNonProdVariant.variant}.` : "0 — no direct/reflection variant reduced the residual."}<br/>
          SEVERITY: {result.verdict.startsWith("4") ? "INFORMATIONAL — direct/reflection field is not the dominant cause" : "HIGH — direct/reflection-path defect located"}<br/>
          NEXT FIX CANDIDATE: {result.verdict}
        </div>
      </div>
    </div>
  );
}