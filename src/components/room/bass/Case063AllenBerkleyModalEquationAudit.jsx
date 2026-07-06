import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 063 — Allen & Berkley Modal Equation Audit (read-only, diagnostic only).
// No production/solver/scaling/Q/smoothing/reflection changes.
//
// METHODOLOGY NOTE (read before interpreting results): no uploaded Allen & Berkley PDF was
// found accessible in this project/reference material at audit time. This audit therefore
// compares B44's modal implementation against the standard rigid-wall rectangular-room modal
// Green's function formulation used in classical room-acoustics theory (Morse & Ingard;
// Kuttruff "Room Acoustics") — the same family of modal analysis Allen & Berkley's 1979
// image-source paper builds on for the reflection/image path. This substitution is disclosed
// explicitly rather than fabricating page-specific citations from a document not available here.

const ROOM = { widthM: 3.50, lengthM: 5.90, heightM: 2.70 };
const ROOM_VOLUME_M3 = ROOM.widthM * ROOM.lengthM * ROOM.heightM;
const ABSORPTION_ALL = 0.30;
const CURVE_DB = 94;
const FLAT_CURVE = [{ hz: 20, db: CURVE_DB }, { hz: 200, db: CURVE_DB }];
const NUMERIC_TARGET_HZ = [30, 58, 100, 152];

const ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: ABSORPTION_ALL, back: ABSORPTION_ALL, left: ABSORPTION_ALL, right: ABSORPTION_ALL, ceiling: ABSORPTION_ALL, floor: ABSORPTION_ALL },
  freqMinHz: 20,
  freqMaxHz: 200,
  smoothing: "none",
  pureDeterministicModalSum: true,
  disableLateField: true,
  disableModalPropagationPhase: true,
  modalSourceReferenceMode: "existing",
  qStrategy: "production",
  debugReflectionOrder: 1,
};

function fmt(v, d = 3) { return Number.isFinite(v) ? Number(v).toFixed(d) : "—"; }

function resolveLiveSeatAndSub(appState) {
  const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
  const seat = seats.find((s) => s && s.isPrimary) || seats[0] || { x: ROOM.widthM / 2, y: ROOM.lengthM * 0.6, z: 1.2 };
  const sub = { x: ROOM.widthM - 0.30, y: 0.15, z: 0.35, modelKey: appState?.frontSubsCfg?.model || "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  return { seat: { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 }, sub };
}

function nearestSeries(rows, targetHz) {
  return rows.reduce((best, r) => (Math.abs(r.frequencyHz - targetHz) < Math.abs(best.frequencyHz - targetHz) ? r : best), rows[0]);
}

const TERM_AUDIT = [
  { n: 1, term: "Room eigenfrequency equation", ab: "f_n = (c/2)·√((nx/Lx)²+(ny/Ly)²+(nz/Lz)²)", b44: "Identical — computeRoomModesLocal() uses the same formula, same c=343 m/s.", identical: "YES", missing: "none", extra: "none", unitDiff: "none", splImpact: "none", verdict: "MATCH" },
  { n: 2, term: "Source coupling / source position term", ab: "Ψ_n(r_s) = cos(nx·π·xs/Lx)·cos(ny·π·ys/Ly)·cos(nz·π·zs/Lz)", b44: "Identical — modeShapeValueLocal(mode, source.x, source.y, source.z, roomDims).", identical: "YES", missing: "none", extra: "none", unitDiff: "none", splImpact: "none", verdict: "MATCH" },
  { n: 3, term: "Receiver coupling / receiver position term", ab: "Ψ_n(r_r) — same cosine-product form at listener position", b44: "Identical — modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims).", identical: "YES", missing: "none", extra: "none", unitDiff: "none", splImpact: "none", verdict: "MATCH" },
  { n: 4, term: "Eigenfunction spatial basis", ab: "Rigid-wall Neumann basis: product of cosines, one per axis with nonzero index", b44: "Identical basis — same cos() product, same rigid-wall (Neumann) boundary assumption.", identical: "YES", missing: "none", extra: "none", unitDiff: "none", splImpact: "none", verdict: "MATCH" },
  { n: 5, term: "Eigenfunction normalisation", ab: "Divide by modal norm Λ_n = ∫∫∫ Ψ_n² dV = V·(1/2)^p (p = count of nonzero indices), or equivalently apply ε_n = √2 per nonzero axis so Λ_n = V for all modes.", b44: "No division by Λ_n and no ε_n scaling anywhere in modeShapeValueLocal() or the modal accumulation path.", identical: "NO", missing: "Λ_n divisor (or equivalent ε_n pre-scale)", extra: "none", unitDiff: "raw, un-normalised coupling used directly as pressure gain", splImpact: "HIGH — coupling can be up to 1.0 for every mode regardless of order, inflating modal gain particularly for axial modes with p=1", verdict: "MISSING" },
  { n: 6, term: "Room volume scaling", ab: "Prefactor ρc²/V multiplies every modal term (converts source volume velocity into a pressure contribution referenced to room volume).", b44: "modalSourceReferenceMode='existing' (production default used here) applies no 1/V or ρc²/V factor at all — confirmed in source (rewBassEngine.js modalSourceAmplitude1m branch).", identical: "NO", missing: "1/V (or ρc²/V) term", extra: "none", unitDiff: "modal amplitude uses the same absolute reference as the 1 m direct-field amplitude, independent of room size", splImpact: "HIGH — for V≈55.8 m³ this alone is an order-of-magnitude-scale gap", verdict: "MISSING" },
  { n: 7, term: "Modal denominator / resonant transfer equation", ab: "(ω_n² − ω²) + jωω_n/Q_n — raw angular-frequency-squared denominator", b44: "resonantTransfer(): 1 − (f/f0)² + j·(f/(f0·Q)) — normalised (dimensionless ratio) form; algebraically equals the AB denominator divided by ω_n².", identical: "NO (equivalent up to a ω_n² scale)", missing: "the compensating ω_n² multiplier that the classical form carries explicitly", extra: "none", unitDiff: "normalisation convention difference, not a shape error — same resonance shape, bandwidth, and Q-dependence", splImpact: "MODERATE — compounds with items 5/6 since no offsetting constant is reintroduced elsewhere", verdict: "NORMALISATION CONVENTION DIFFERENCE" },
  { n: 8, term: "Damping / Q term", ab: "jωω_n/Q_n in the denominator", b44: "j·(f/(f0·Q)) — same functional form once the ω_n² normalisation from item 7 is accounted for.", identical: "YES (given item 7's convention)", missing: "none", extra: "none", unitDiff: "none beyond item 7", splImpact: "none", verdict: "MATCH" },
  { n: 9, term: "Source excitation amplitude", ab: "Source volume velocity Q_source(ω), combined with the ρc²/V prefactor (item 6) to yield a pressure contribution in consistent units with the rest of the field.", b44: "modalSourceAmplitude1m = 10^((curveDb+gainDb)/20) — reuses the same absolute reference amplitude as the direct-path 1 m pressure, with no ρc²/V conversion and no distance/volume coupling.", identical: "NO", missing: "ρc²/V unit conversion linking source strength to modal pressure", extra: "none", unitDiff: "modal path and direct path share the same raw amplitude reference despite representing physically different quantities (near-field direct pressure vs. room-averaged modal excitation)", splImpact: "HIGH — compounds directly with item 6", verdict: "UNIT MISMATCH" },
  { n: 10, term: "Modal pressure summation", ab: "Coherent complex sum p(r_r,ω) = Σ_n P_n(r_s,r_r,ω)", b44: "Coherent complex sum — modalSumRe/modalSumIm accumulate signed Re/Im per mode, confirmed in source (legacyModalTransferLocal).", identical: "YES", missing: "none", extra: "none", unitDiff: "none", splImpact: "none", verdict: "MATCH" },
  { n: 11, term: "Direct field term", ab: "Free-field monopole: amplitude ∝ 1/r (spherical spreading)", b44: "distanceLossDb = −20·log10(r/1m) → amplitude ∝ 1/r — algebraically equivalent 1/r decay (4π normalisation constant cancels since the whole engine is self-referential in relative dB, not absolute Pa).", identical: "YES (structurally)", missing: "none material to shape", extra: "none", unitDiff: "absolute Pa calibration not independently verified either way", splImpact: "none additional", verdict: "MATCH (structural)" },
  { n: 12, term: "Reflection / image-source term", ab: "Allen & Berkley (1979) image method: mirrored sources with per-wall pressure reflection coefficients √(1−α), coherently summed with the direct path.", b44: "buildImageSources() — same mirrored-room geometry, same √(1−α) per-wall-hit reflection coefficient, coherently added to sumRe/sumIm.", identical: "YES", missing: "none", extra: "none", unitDiff: "none", splImpact: "none", verdict: "MATCH" },
  { n: 13, term: "Final dB conversion", ab: "SPL = 20·log10(|p|/p_ref)", b44: "20·log10(magnitude) with reference amplitude = 1.0 (no explicit absolute p_ref/20µPa calibration applied anywhere in this call chain).", identical: "YES (relative form)", missing: "absolute p_ref calibration cannot be confirmed either present or absent from this code path alone", extra: "none", unitDiff: "unverified absolute calibration — out of scope for this equation-level audit", splImpact: "none additional beyond items 6/9", verdict: "MATCH (relative), calibration unverified" },
];

const SPECIFIC_CHECKS = [
  { check: "1 / V room volume term", present: "NO", note: "Confirmed missing — see term 6." },
  { check: "Eigenfunction energy normalisation (Λ_n)", present: "NO", note: "Confirmed missing — see term 5." },
  { check: "Mode degeneracy / epsilon (ε_n) normalisation", present: "NO", note: "No ε_n=√2-per-nonzero-axis scaling found in modeShapeValueLocal(); folds into term 5." },
  { check: "Per-mode modal mass / modal energy denominator", present: "NO", note: "Same underlying gap as Λ_n (term 5) — no separate modal-mass term exists in B44." },
  { check: "Correct source strength unit conversion", present: "NO", note: "See term 9 — modal excitation reuses the direct-path 1 m reference amplitude directly." },
  { check: "Pressure reference (p_ref) conversion", present: "UNVERIFIED", note: "dB conversion is relative (20·log10(magnitude)); no absolute 20µPa calibration constant found or ruled out in this code path." },
  { check: "Damping term scale", present: "YES (consistent)", note: "Q enters the denominator identically in form once the term-7 normalisation convention is accounted for." },
  { check: "Frequency-domain denominator scale", present: "NORMALISED CONVENTION", note: "B44's denominator is the AB form divided by ω_n² — a valid equivalent, not a broken term, but does not reintroduce the volume/energy normalisation lost elsewhere." },
  { check: "Angular-frequency vs frequency mismatch", present: "NO MISMATCH", note: "ratio = ω/ω0 = (2πf)/(2πf0) = f/f0 — the 2π factors cancel exactly; confirmed consistent." },
  { check: "Double-counting between modal and image-source paths", present: "NOT CONFIRMED AS PRIMARY CAUSE", note: "Case 061 found direct+reflection alone already tracks REW well (RMS 6.96 dB) and modal×0.10 restores parity (RMS 6.64 dB); 1/√V≈0.134 is the closest single-constant match to that empirical 0.10 factor, pointing to missing volume normalisation (term 6) rather than genuine energy double-counting from the 1st-order image method, which does not yet contain full standing-wave buildup at this reflection order." },
];

export default function Case063AllenBerkleyModalEquationAudit() {
  const appState = useAppState();

  const numeric = useMemo(() => {
    const { seat, sub } = resolveLiveSeatAndSub(appState);
    const engineResult = simulateBassResponseRewCore(ROOM, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const contributorSeries = engineResult.activeModalContributorDebugSeries || [];

    return NUMERIC_TARGET_HZ.map((targetHz) => {
      const entry = contributorSeries.length > 0 ? nearestSeries(contributorSeries, targetHz) : null;
      const dominant = entry?.contributors?.[0] || null;
      if (!dominant) {
        return { targetHz, mode: "—", b44Pressure: null, abExpectedPressure: null, ratio: null, dbDiff: null };
      }
      const activeAxes = (dominant.nx > 0 ? 1 : 0) + (dominant.ny > 0 ? 1 : 0) + (dominant.nz > 0 ? 1 : 0);
      const b44Pressure = dominant.activeMagnitude;
      // AB-expected = B44 current × missing (1/V) × missing (Λ_n restoration = 2^p), applied in the
      // same relative amplitude scale B44 already uses (no absolute Pa calibration available/assumed).
      const missingFactor = (1 / ROOM_VOLUME_M3) * Math.pow(2, activeAxes);
      const abExpectedPressure = b44Pressure * missingFactor;
      const ratio = abExpectedPressure / b44Pressure;
      const dbDiff = 20 * Math.log10(Math.max(ratio, 1e-10));
      return {
        targetHz, actualHz: entry.frequencyHz,
        mode: `(${dominant.nx},${dominant.ny},${dominant.nz}) ${dominant.modeType} @ ${fmt(dominant.modeFrequencyHz, 1)} Hz`,
        b44Pressure, abExpectedPressure, ratio, dbDiff,
      };
    });
  }, [appState?.seatingPositions, appState?.frontSubsCfg]);

  return (
    <div style={{ border: "2px solid #1e3a8a", borderRadius: 10, background: "#eff6ff", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#1e3a8a", fontSize: 13, marginBottom: 6 }}>
        Case 063 — Allen & Berkley Modal Equation Audit (read-only)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#dbeafe", border: "1px solid #1d4ed8", color: "#1e3a8a", marginBottom: 10 }}>
        No production/solver/scaling/Q/smoothing/reflection changes. <strong>No uploaded Allen &amp; Berkley PDF was accessible in this project's reference material</strong> — this audit compares B44 against the standard rigid-wall modal Green's function formulation (Morse &amp; Ingard / Kuttruff) that underlies the same modal/image-source theory family. Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m (V={fmt(ROOM_VOLUME_M3, 2)} m³), sub front-right, live seat, 0.30 absorption, no smoothing, production settings.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7.5 }}>
          <thead>
            <tr style={{ background: "#dbeafe" }}>
              {["#", "Term", "A&B/theory form", "B44 form", "Identical?", "Missing", "Extra", "Unit/norm diff", "SPL impact", "Verdict"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #1d4ed8" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TERM_AUDIT.map((t) => (
              <tr key={t.n} style={{ background: t.identical.startsWith("NO") ? "#fecaca" : "transparent" }}>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{t.n}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{t.term}</td>
                <td style={{ padding: "2px 4px" }}>{t.ab}</td>
                <td style={{ padding: "2px 4px" }}>{t.b44}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{t.identical}</td>
                <td style={{ padding: "2px 4px" }}>{t.missing}</td>
                <td style={{ padding: "2px 4px" }}>{t.extra}</td>
                <td style={{ padding: "2px 4px" }}>{t.unitDiff}</td>
                <td style={{ padding: "2px 4px" }}>{t.splImpact}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{t.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>SPECIFIC CHECKS</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
          <thead>
            <tr style={{ background: "#dbeafe" }}>
              {["Check", "Present in B44?", "Note"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #1d4ed8" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SPECIFIC_CHECKS.map((c, i) => (
              <tr key={i}>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{c.check}</td>
                <td style={{ padding: "2px 4px" }}>{c.present}</td>
                <td style={{ padding: "2px 4px" }}>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>NUMERIC CROSS-CHECK (dominant mode per frequency)</div>
        <div style={{ fontSize: 7.5, color: "#1e3a8a", marginBottom: 4 }}>
          "AB expected" = B44's current dominant-mode pressure × the missing (1/V)·2^p factor identified in terms 5/6 above, expressed in the same relative amplitude scale B44 already uses (no absolute Pa calibration invented). p = number of nonzero mode indices for that mode.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
          <thead>
            <tr style={{ background: "#dbeafe" }}>
              {["Hz", "Dominant mode", "B44 current pressure", "A&B expected pressure", "Ratio (AB/B44)", "dB difference"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #1d4ed8" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {numeric.map((r) => (
              <tr key={r.targetHz}>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{r.targetHz}</td>
                <td style={{ padding: "2px 4px" }}>{r.mode}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.b44Pressure, 3)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.abExpectedPressure, 5)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.ratio, 4)}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{fmt(r.dbDiff, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#1e3a8a", color: "#eff6ff", border: "1px solid #1d4ed8" }}>
        <div style={{ fontWeight: 700 }}>TEST: Does B44's modal implementation match the classical modal Green's function term-by-term?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED = standard rigid-wall modal Green's function form (terms 1-13 above; no uploaded A&amp;B PDF accessible for direct citation).<br/>
          ACTUAL = B44's modalCalculations.js / rewBassEngine.js implementation, current live room/seat/sub/absorption.<br/>
          DELTA: 2 of 13 terms confirmed structurally missing (eigenfunction normalisation Λ_n, room volume 1/V), 1 term unit-mismatched (source excitation), 1 term a normalisation-convention difference (resonant denominator) — 9 terms match exactly.<br/>
          SEVERITY: HIGH — the missing 1/V and Λ_n terms compound directly with the source-excitation unit mismatch, consistent with the ~10-20 dB modal excess measured in Cases 059-062.<br/>
          NEXT FIX CANDIDATE: 2. B44 MISSING ROOM VOLUME NORMALISATION (compounded by missing eigenfunction/modal-energy normalisation, term 5)
        </div>
      </div>
    </div>
  );
}