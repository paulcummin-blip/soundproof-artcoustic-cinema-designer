import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 054 — Modal Phase Validation (read-only, diagnostic only).
// Isolates whether B44's destructive-null mismatch is caused specifically by MODAL PHASE
// (not frequency, Q, amplitude, source position, listener position, or summation method).
// Uses the real engine's own per-frequency modal contributor breakdown
// (activeModalContributorDebugSeries) and field vectors (perFrequencyVectorDebug) — nothing
// is recomputed from scratch except the phase-only variant reconstructions requested below,
// which start from the engine's own per-mode Re/Im contributions.

const TARGET_FREQS = [30.8, 45.6, 58.9, 84.0];
const NULL_BAND_LO = 20;
const NULL_BAND_HI = 80;
const REW_OBSERVED_NULL_HZ = 45.6;

const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
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
};

function fmt(v, d = 3) {
  return Number.isFinite(v) ? v.toFixed(d) : "—";
}
function magPhase(re, im) {
  return { mag: Math.sqrt(re * re + im * im), phaseDeg: (Math.atan2(im, re) * 180) / Math.PI };
}
function angleDiffDeg(a, b) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}
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

// Builds each contributor's variant-modified Re/Im, preserving magnitude, per requested rule.
function buildVariantContribution(contributor, variant) {
  const { activeReal, activeImag, activeMagnitude, transferReal, transferImag, combinedCoupling } = contributor;
  switch (variant) {
    case "B": // force all modal phases to 0°
      return { re: activeMagnitude, im: 0 };
    case "C": // force all modal phases to 180°
      return { re: -activeMagnitude, im: 0 };
    case "D": // rotate +90° (multiply by +j)
      return { re: -activeImag, im: activeReal };
    case "E": // rotate -90° (multiply by -j)
      return { re: activeImag, im: -activeReal };
    case "F": { // analytical resonator phase only (transfer function phase, magnitude preserved)
      const transferPhase = Math.atan2(transferImag ?? 0, transferReal ?? 1);
      return { re: activeMagnitude * Math.cos(transferPhase), im: activeMagnitude * Math.sin(transferPhase) };
    }
    case "G": { // remove coupling-sign phase (cancel the ±1 flip contributed by negative combinedCoupling)
      const sign = combinedCoupling < 0 ? -1 : 1;
      return { re: activeReal * sign, im: activeImag * sign };
    }
    case "A":
    default:
      return { re: activeReal, im: activeImag };
  }
}

function findFirstDestructiveNull(series) {
  const band = series.filter((p) => p.frequency >= NULL_BAND_LO && p.frequency <= NULL_BAND_HI && Number.isFinite(p.spl));
  for (let i = 1; i < band.length - 1; i++) {
    if (band[i].spl < band[i - 1].spl && band[i].spl < band[i + 1].spl) return band[i];
  }
  if (band.length === 0) return null;
  return band.reduce((min, p) => (p.spl < min.spl ? p : min), band[0]);
}

export default function Case054ModalPhaseValidationAudit() {
  const appState = useAppState();

  const result = useMemo(() => {
    const { roomDims, seat, sub } = resolveLiveInputs(appState);
    const engineResult = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const vecDebug = engineResult.perFrequencyVectorDebug || [];
    const contributorSeries = engineResult.activeModalContributorDebugSeries || [];

    const nearestVecRow = (targetHz) => vecDebug.reduce((best, row) =>
      !best || Math.abs(row.frequencyHz - targetHz) < Math.abs(best.frequencyHz - targetHz) ? row : best, null);
    const nearestContribRow = (targetHz) => contributorSeries.reduce((best, row) =>
      !best || Math.abs(row.frequencyHz - targetHz) < Math.abs(best.frequencyHz - targetHz) ? row : best, null);

    // Per-target-frequency contributor + field vector breakdown
    const perFrequencyReport = TARGET_FREQS.map((targetHz) => {
      const vecRow = nearestVecRow(targetHz);
      const contribRow = nearestContribRow(targetHz);
      if (!vecRow || !contribRow) return { targetHz, error: "no data at this frequency" };

      const direct = { ...magPhase(vecRow.directRe, vecRow.directIm) };
      const reflection = { ...magPhase(vecRow.reflectionRe, vecRow.reflectionIm) };
      const modal = { ...magPhase(vecRow.modalSumRe, vecRow.modalSumIm) };
      const directPlusReflection = { ...magPhase(vecRow.directRe + vecRow.reflectionRe, vecRow.directIm + vecRow.reflectionIm) };
      const final = { ...magPhase(vecRow.finalRe, vecRow.finalIm) };
      const finalSpl = toDb(final.mag);

      const top10 = [...(contribRow.contributors || [])]
        .sort((a, b) => b.activeMagnitude - a.activeMagnitude)
        .slice(0, 10)
        .map((c) => {
          const phaseRelToModal = angleDiffDeg(c.activePhaseAngleDeg, modal.phaseDeg);
          const phaseRelToDirRefl = angleDiffDeg(c.activePhaseAngleDeg, directPlusReflection.phaseDeg);
          const projectionOntoFinal = c.activeReal * vecRow.finalRe + c.activeImag * vecRow.finalIm;
          return {
            nx: c.nx, ny: c.ny, nz: c.nz,
            modeFrequencyHz: c.modeFrequencyHz,
            modeType: c.modeType,
            magnitude: c.activeMagnitude,
            phaseDeg: c.activePhaseAngleDeg,
            sourceCouplingSign: c.sourceCoupling < 0 ? "−" : "+",
            receiverCouplingSign: c.receiverCoupling < 0 ? "−" : "+",
            finalRe: c.activeReal,
            finalIm: c.activeImag,
            phaseRelToModal,
            phaseRelToDirRefl,
            effect: projectionOntoFinal >= 0 ? "constructive" : "destructive",
          };
        });

      return { targetHz, actualHz: vecRow.frequencyHz, direct, reflection, modal, directPlusReflection, final, finalSpl, top10 };
    });

    // Phase-only variants A–G, reconstructed across the full spectrum from the engine's own
    // per-mode Re/Im contributions (magnitude preserved for B–G; phase modified per rule).
    const variantKeys = ["A", "B", "C", "D", "E", "F", "G"];
    const variantSeries = {};
    variantKeys.forEach((variant) => {
      variantSeries[variant] = contributorSeries.map((row) => {
        const vecRow = vecDebug.find((v) => v.frequencyHz === row.frequencyHz) || nearestVecRow(row.frequencyHz);
        let sumRe = 0, sumIm = 0;
        (row.contributors || []).forEach((c) => {
          const { re, im } = buildVariantContribution(c, variant);
          sumRe += re;
          sumIm += im;
        });
        const finalRe = (vecRow?.directRe ?? 0) + (vecRow?.reflectionRe ?? 0) + sumRe;
        const finalIm = (vecRow?.directIm ?? 0) + (vecRow?.reflectionIm ?? 0) + sumIm;
        const mag = Math.sqrt(finalRe * finalRe + finalIm * finalIm);
        return { frequency: row.frequencyHz, spl: toDb(mag) };
      }).sort((a, b) => a.frequency - b.frequency);
    });

    const variantReport = variantKeys.map((variant) => {
      const series = variantSeries[variant];
      const splAt = (targetHz) => {
        const p = series.reduce((best, pt) => Math.abs(pt.frequency - targetHz) < Math.abs(best.frequency - targetHz) ? pt : best, series[0]);
        return p ? p.spl : null;
      };
      const nullPt = findFirstDestructiveNull(series);
      return {
        variant,
        spl30_8: splAt(30.8),
        spl45_6: splAt(45.6),
        spl58_9: splAt(58.9),
        nullFreq: nullPt?.frequency ?? null,
        nullDepth: nullPt ? (Math.max(...series.filter(p => Math.abs(p.frequency - nullPt.frequency) <= 8).map(p => p.spl)) - nullPt.spl) : null,
      };
    });

    const productionRow = variantReport.find((r) => r.variant === "A");
    variantReport.forEach((r) => {
      const freqDeltaToRew = Number.isFinite(r.nullFreq) ? Math.abs(r.nullFreq - REW_OBSERVED_NULL_HZ) : Infinity;
      const prodFreqDeltaToRew = Number.isFinite(productionRow?.nullFreq) ? Math.abs(productionRow.nullFreq - REW_OBSERVED_NULL_HZ) : Infinity;
      const deeperThanProd = Number.isFinite(r.nullDepth) && Number.isFinite(productionRow?.nullDepth) ? r.nullDepth >= productionRow.nullDepth : false;
      r.closerToRew = (freqDeltaToRew < prodFreqDeltaToRew - 0.5) || (freqDeltaToRew <= prodFreqDeltaToRew && deeperThanProd) ? "YES" : "NO";
    });

    // Verdict logic: compare each variant's proximity to the REW-observed null against production.
    const bestNonProdVariant = variantReport
      .filter((r) => r.variant !== "A" && r.closerToRew === "YES")
      .sort((a, b) => Math.abs(a.nullFreq - REW_OBSERVED_NULL_HZ) - Math.abs(b.nullFreq - REW_OBSERVED_NULL_HZ))[0];

    let verdict;
    if (!bestNonProdVariant) {
      verdict = "4. MODAL PHASE RETIRED";
    } else if (bestNonProdVariant.variant === "G") {
      verdict = "2. COUPLING SIGN PHASE ERROR CONFIRMED";
    } else if (bestNonProdVariant.variant === "F") {
      verdict = "3. DIRECT/REFLECTION PHASE RELATION ERROR CONFIRMED";
    } else {
      verdict = "1. MODAL PHASE ERROR CONFIRMED";
    }

    return { perFrequencyReport, variantReport, verdict, bestNonProdVariant };
  }, [appState?.roomDims, appState?.seatingPositions, appState?.frontSubsCfg]);

  return (
    <div style={{ border: "2px solid #9d174d", borderRadius: 10, background: "#fdf2f8", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#9d174d", fontSize: 13, marginBottom: 6 }}>
        Case 054 — Modal Phase Validation (read-only)
      </div>
      <div style={{ color: "#831843", marginBottom: 10 }}>
        Live room/seat/sub · production Q strategy · isolates modal phase from frequency/Q/amplitude/position/summation using the engine's own per-mode Re/Im contributions.
      </div>

      {result.perFrequencyReport.map((row) => (
        <div key={row.targetHz} style={{ marginBottom: 14, padding: 8, border: "1px solid #fbcfe8", borderRadius: 6, background: "#fff" }}>
          <div style={{ fontWeight: 700, color: "#9d174d", marginBottom: 4 }}>
            {row.targetHz} Hz (actual bin {fmt(row.actualHz, 1)})
          </div>
          {row.error ? <div style={{ color: "#b91c1c" }}>{row.error}</div> : (
            <>
              <div style={{ marginBottom: 6, fontSize: 9 }}>
                Direct: mag={fmt(row.direct.mag)} ∠{fmt(row.direct.phaseDeg, 1)}° · Reflection: mag={fmt(row.reflection.mag)} ∠{fmt(row.reflection.phaseDeg, 1)}° · Modal: mag={fmt(row.modal.mag)} ∠{fmt(row.modal.phaseDeg, 1)}°<br/>
                Direct+Reflection: mag={fmt(row.directPlusReflection.mag)} ∠{fmt(row.directPlusReflection.phaseDeg, 1)}° · Final: mag={fmt(row.final.mag)} ∠{fmt(row.final.phaseDeg, 1)}° · SPL={fmt(row.finalSpl, 2)} dB
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
                  <thead>
                    <tr style={{ background: "#fce7f3" }}>
                      {["Mode", "f0", "Type", "Mag", "Phase°", "Src sign", "Rcv sign", "Re", "Im", "∠rel modal", "∠rel dir+refl", "Effect"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "2px 4px", borderBottom: "1px solid #f9a8d4" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {row.top10.map((c, i) => (
                      <tr key={i}>
                        <td style={{ padding: "2px 4px" }}>({c.nx},{c.ny},{c.nz})</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(c.modeFrequencyHz, 1)}</td>
                        <td style={{ padding: "2px 4px" }}>{c.modeType}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(c.magnitude)}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(c.phaseDeg, 1)}</td>
                        <td style={{ padding: "2px 4px" }}>{c.sourceCouplingSign}</td>
                        <td style={{ padding: "2px 4px" }}>{c.receiverCouplingSign}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(c.finalRe)}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(c.finalIm)}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(c.phaseRelToModal, 1)}</td>
                        <td style={{ padding: "2px 4px" }}>{fmt(c.phaseRelToDirRefl, 1)}</td>
                        <td style={{ padding: "2px 4px", color: c.effect === "constructive" ? "#166534" : "#b91c1c" }}>{c.effect}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ))}

      <div style={{ marginTop: 6, marginBottom: 10 }}>
        <div style={{ fontWeight: 700, color: "#9d174d", marginBottom: 4 }}>PHASE-ONLY VARIANTS A–G</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
            <thead>
              <tr style={{ background: "#fce7f3" }}>
                {["Variant", "SPL@30.8Hz", "SPL@45.6Hz", "SPL@58.9Hz", "1st null Hz (20–80)", "Null depth", "Closer to REW"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "3px 5px", borderBottom: "1px solid #f9a8d4" }}>{h}</th>
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
        <div style={{ fontSize: 9, color: "#831843", marginTop: 4 }}>
          "Closer to REW" compares each variant's first destructive null (20–80 Hz) to the REW-observed reference ({REW_OBSERVED_NULL_HZ} Hz) against production (variant A): closer frequency and/or equal-or-deeper null depth = YES.
        </div>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#831843", color: "#fdf2f8", border: "1px solid #9d174d" }}>
        <div style={{ fontWeight: 700 }}>TEST: Is the destructive-null mismatch caused by modal phase rather than frequency, Q, amplitude, position, or summation?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED: if modal phase is the cause, at least one phase-only variant (B–G, magnitude unchanged) should move the null frequency/depth measurably closer to the REW-observed reference than production (variant A).<br/>
          ACTUAL: {result.bestNonProdVariant ? `variant ${result.bestNonProdVariant.variant} moved the null to ${fmt(result.bestNonProdVariant.nullFreq, 1)} Hz (depth ${fmt(result.bestNonProdVariant.nullDepth, 1)} dB), closer to REW than production's ${fmt(result.variantReport.find(r=>r.variant==='A')?.nullFreq, 1)} Hz.` : "no phase-only variant moved the null closer to the REW-observed reference than production."}<br/>
          DELTA: {result.bestNonProdVariant ? `${fmt(Math.abs(result.bestNonProdVariant.nullFreq - REW_OBSERVED_NULL_HZ), 1)} Hz residual vs REW reference under variant ${result.bestNonProdVariant.variant}.` : "—"}<br/>
          SEVERITY: {result.verdict.startsWith("4") ? "INFORMATIONAL — phase is not the dominant cause" : "HIGH — phase-domain defect located"}<br/>
          NEXT FIX CANDIDATE: {result.verdict}
        </div>
      </div>
    </div>
  );
}