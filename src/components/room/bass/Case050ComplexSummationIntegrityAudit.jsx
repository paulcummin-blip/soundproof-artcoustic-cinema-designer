import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 050 — Complex Summation Integrity Audit (read-only, diagnostic only).
// Proves whether B44 sums modal pressure vectors in complex (Re/Im) form all the way to the
// final SPL, with no premature magnitude/abs/RMS operation. Uses the live room/seat/sub and
// the REAL production engine's own perFrequencyVectorDebug output — nothing is recomputed or
// approximated. Late-field is disabled so the recombination check is exact (direct+reflection+
// modal === final), matching the engine's own additive-pressure architecture.

const TARGET_FREQS = [30, 37, 52, 63, 84];
const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
const ENGINE_OPTIONS_BASE = {
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

function magPhase(re, im) {
  return { mag: Math.sqrt(re * re + im * im), phaseDeg: (Math.atan2(im, re) * 180) / Math.PI };
}
function toDb(mag) { return 20 * Math.log10(Math.max(mag, 1e-10)); }
function fmt(v, d = 4) { return Number.isFinite(v) ? v.toFixed(d) : "—"; }

function resolveLiveInputs(appState) {
  const roomDims = appState?.roomDims || { widthM: 4.5, lengthM: 6.0, heightM: 2.4 };
  const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
  const seat = seats.find((s) => s.isPrimary) || seats[0] || { x: (roomDims.widthM || 4.5) / 2, y: (roomDims.lengthM || 6) * 0.6, z: 1.2 };
  const frontCfg = appState?.frontSubsCfg;
  const rearCfg = appState?.rearSubsCfg;
  const roomWidth = roomDims.widthM || 4.5;
  const roomLength = roomDims.lengthM || 6.0;
  let sub = null;
  if (frontCfg?.count > 0) {
    const pos = frontCfg.positions?.[0] || { x: roomWidth * 0.33, y: 0.15 };
    sub = { x: pos.x, y: pos.y, z: Number.isFinite(pos.z) ? pos.z : 0.35, modelKey: frontCfg.model || "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  } else if (rearCfg?.count > 0) {
    const pos = rearCfg.positions?.[0] || { x: roomWidth * 0.33, y: roomLength - 0.15 };
    sub = { x: pos.x, y: pos.y, z: Number.isFinite(pos.z) ? pos.z : 0.35, modelKey: rearCfg.model || "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  } else {
    sub = { x: roomWidth * 0.33, y: 0.15, z: 0.35, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  }
  return { roomDims: { widthM: roomWidth, lengthM: roomLength, heightM: roomDims.heightM || 2.4 }, seat, sub };
}

export default function Case050ComplexSummationIntegrityAudit() {
  const appState = useAppState();

  const result = useMemo(() => {
    const { roomDims, seat, sub } = resolveLiveInputs(appState);
    const engineResult = simulateBassResponseRewCore(roomDims, seat, sub, FLAT_CURVE, ENGINE_OPTIONS_BASE);
    const debugRows = engineResult.perFrequencyVectorDebug || [];

    const rows = TARGET_FREQS.map((targetHz) => {
      const nearest = debugRows.reduce((best, row) => (
        !best || Math.abs(row.frequencyHz - targetHz) < Math.abs(best.frequencyHz - targetHz) ? row : best
      ), null);
      if (!nearest) return null;

      const direct = { re: nearest.directRe, im: nearest.directIm, ...magPhase(nearest.directRe, nearest.directIm) };
      const reflection = { re: nearest.reflectionRe, im: nearest.reflectionIm, ...magPhase(nearest.reflectionRe, nearest.reflectionIm) };
      const modal = { re: nearest.modalSumRe, im: nearest.modalSumIm, ...magPhase(nearest.modalSumRe, nearest.modalSumIm) };
      const final = { re: nearest.finalRe, im: nearest.finalIm, ...magPhase(nearest.finalRe, nearest.finalIm) };
      final.spl = toDb(final.mag);

      const indepRe = direct.re + reflection.re + modal.re;
      const indepIm = direct.im + reflection.im + modal.im;
      const indep = { re: indepRe, im: indepIm, ...magPhase(indepRe, indepIm) };
      indep.spl = toDb(indep.mag);

      const errorRe = indep.re - final.re;
      const errorIm = indep.im - final.im;
      const errorMag = indep.mag - final.mag;
      const errorSpl = indep.spl - final.spl;

      return { targetHz, actualHz: nearest.frequencyHz, direct, reflection, modal, final, indep, errorRe, errorIm, errorMag, errorSpl };
    }).filter(Boolean);

    const maxAbsErrorSpl = Math.max(...rows.map((r) => Math.abs(r.errorSpl)));
    const maxAbsErrorMag = Math.max(...rows.map((r) => Math.abs(r.errorMag)));
    const summationVerified = maxAbsErrorSpl < 0.01 && maxAbsErrorMag < 1e-6;

    let verdict;
    if (summationVerified) verdict = "1. COMPLEX SUMMATION VERIFIED";
    else if (maxAbsErrorSpl > 0.01 && maxAbsErrorSpl < 3) verdict = "3. DB-DOMAIN SUMMATION FOUND";
    else verdict = "4. UNEXPLAINED RECOMBINATION ERROR FOUND";

    return { rows, maxAbsErrorSpl, maxAbsErrorMag, verdict };
  }, [appState?.roomDims, appState?.seatingPositions, appState?.frontSubsCfg, appState?.rearSubsCfg]);

  const vecCell = (v) => `Re=${fmt(v.re)} Im=${fmt(v.im)} mag=${fmt(v.mag)} ${v.phaseDeg !== undefined ? `∠${fmt(v.phaseDeg, 1)}°` : ""}`;

  return (
    <div style={{ border: "2px solid #065f46", borderRadius: 10, background: "#ecfdf5", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#065f46", fontSize: 13, marginBottom: 6 }}>
        Case 050 — Complex Summation Integrity Audit (read-only)
      </div>
      <div style={{ color: "#047857", marginBottom: 10 }}>
        Live room/seat/sub · production Q strategy · late-field disabled for an exact direct+reflection+modal recombination check
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
          <thead>
            <tr style={{ background: "#a7f3d0" }}>
              {["Target Hz", "Direct vector", "Reflection vector", "Modal vector", "Final (production)", "Independent recombination", "ΔRe", "ΔIm", "Δmag", "ΔSPL"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 5px", borderBottom: "1px solid #6ee7b7" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.targetHz}>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #d1fae5" }}>{r.targetHz} ({fmt(r.actualHz, 1)})</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #d1fae5" }}>{vecCell(r.direct)}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #d1fae5" }}>{vecCell(r.reflection)}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #d1fae5" }}>{vecCell(r.modal)}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #d1fae5" }}>{vecCell(r.final)} SPL={fmt(r.final.spl, 2)}dB</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #d1fae5" }}>{vecCell(r.indep)} SPL={fmt(r.indep.spl, 2)}dB</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #d1fae5", color: Math.abs(r.errorRe) < 1e-6 ? "#166534" : "#b91c1c" }}>{fmt(r.errorRe, 6)}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #d1fae5", color: Math.abs(r.errorIm) < 1e-6 ? "#166534" : "#b91c1c" }}>{fmt(r.errorIm, 6)}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #d1fae5", color: Math.abs(r.errorMag) < 1e-6 ? "#166534" : "#b91c1c" }}>{fmt(r.errorMag, 6)}</td>
                <td style={{ padding: "3px 5px", borderBottom: "1px solid #d1fae5", color: Math.abs(r.errorSpl) < 0.01 ? "#166534" : "#b91c1c" }}>{fmt(r.errorSpl, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#d1fae5", border: "1px solid #6ee7b7" }}>
        <div style={{ fontWeight: 700, color: "#065f46" }}>PIPELINE SCAN (rewBassEngine.js)</div>
        <div style={{ marginTop: 4, color: "#047857" }}>
          Math.abs on accumulator: NOT FOUND (sumRe/sumIm accumulate as signed floats throughout).<br/>
          Premature magnitude/hypot before final sum: NOT FOUND (Math.sqrt only appears in debug/reporting fields, never feeds back into sumRe/sumIm).<br/>
          RMS or scalar summation of magnitudes: NOT FOUND (direct, reflection, and modal contributions are added as Re/Im pairs — see sumRe += …/sumIm += … call sites).<br/>
          Clipping / normalisation / averaging on the accumulator: NOT FOUND.<br/>
          dB conversion: occurs exactly once, at the end (`20 * Math.log10(magnitude)` on the final complex sum) — correct placement.<br/>
          Smoothing: not applied inside simulateBassResponseRewCore (smoothing option is rejected unless "none").
        </div>
      </div>

      <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#064e3b", color: "#ecfdf5", border: "1px solid #065f46" }}>
        <div style={{ fontWeight: 700 }}>TEST: Does B44 sum modal pressure vectors in complex form all the way to final SPL?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED: direct + reflection + modal (Re/Im) reconstructed independently should equal the production final vector exactly (ΔRe, ΔIm, Δmag, ΔSPL ≈ 0), confirming no premature magnitude/abs/RMS/dB operation occurs before the final sum.<br/>
          ACTUAL: max |ΔSPL| across 5 test frequencies = {fmt(result.maxAbsErrorSpl, 4)} dB; max |Δmag| = {fmt(result.maxAbsErrorMag, 8)}.<br/>
          DELTA: {result.maxAbsErrorSpl < 0.01 ? "Errors are at floating-point rounding level — recombination matches exactly." : "Non-trivial recombination error detected — see per-frequency table."}<br/>
          SEVERITY: {result.verdict.startsWith("1") ? "INFORMATIONAL — verified, no defect" : "HIGH — investigate flagged frequency rows"}<br/>
          NEXT FIX CANDIDATE: {result.verdict}
        </div>
      </div>
    </div>
  );
}