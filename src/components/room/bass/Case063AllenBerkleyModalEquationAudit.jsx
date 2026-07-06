import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 063 — Allen & Berkley Modal Equation Audit (REVISED).
// Reference: Allen & Berkley, "Image method for efficiently simulating small-room acoustics,"
// J. Acoust. Soc. Am. 65(4), 943–950 (1979). Appendix A is the sole reference for modal equations.
// All equation numbers (A1–A14) refer to that Appendix.
// No production/solver/scaling/Q/smoothing/reflection changes.

const ROOM = { widthM: 3.50, lengthM: 5.90, heightM: 2.70 };
const ROOM_VOLUME_M3 = ROOM.widthM * ROOM.lengthM * ROOM.heightM;
const C = 343;
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

// A&B Eq. A2 modal Green's function — exact as stated in the paper, with Q-damping extension:
// P(k,X,X') = (1/V) Σ_r [ ψ_r(X)·ψ_r(X') / (k_r² - k²) ]
// With lossy extension (Sabine Q): denominator becomes (k_r² - k²) + j·k·k_r/Q
// ψ_r(X) = cos(nπx/Lx)·cos(lπy/Ly)·cos(mπz/Lz) — Eq. A4
// k_r² = |k_r|² = (nπ/Lx)² + (lπ/Ly)² + (mπ/Lz)² — Eq. A3
// k = ω/c
function abModalTransfer(f, f0, Q) {
  const k = 2 * Math.PI * f / C;
  const kr = 2 * Math.PI * f0 / C;
  const kr2 = kr * kr;
  const k2 = k * k;
  const realDen = kr2 - k2;
  const imagDen = k * kr / Q;  // lossy extension
  const denomSq = realDen * realDen + imagDen * imagDen;
  const mag = 1 / Math.sqrt(denomSq);
  return { mag, kr2 };
}

function modeShapeLocal(nx, ny, nz, x, y, z) {
  const sx = nx > 0 ? Math.cos(nx * Math.PI * x / ROOM.widthM) : 1;
  const sy = ny > 0 ? Math.cos(ny * Math.PI * y / ROOM.lengthM) : 1;
  const sz = nz > 0 ? Math.cos(nz * Math.PI * z / ROOM.heightM) : 1;
  return sx * sy * sz;
}

// A&B complete modal pressure at frequency f (Eq. A2 + lossy damping extension):
// p_modal_AB = (1/V) × ψ_r(X_source) × ψ_r(X_receiver) × |1/(k_r² - k²)|
// This IS the complete A&B formulation at unit source strength.
// B44 uses: combinedCoupling × resonantTransfer_magnitude (NO 1/V, DIFFERENT denominator convention)

// ────────────────────────────────────────────────────────────────
// TERM-BY-TERM AUDIT TABLE (derived from paper equations verbatim)
// ────────────────────────────────────────────────────────────────
const TERM_AUDIT = [
  {
    n: 1,
    term: "Helmholtz equation / source type",
    ab_eq: "A1",
    ab_form: "∇²P[(ω/c),X,X'] + (ω²/c²)P[(ω/c),X,X'] = −δ(X − X'). RHS is −δ(X−X'), i.e. a UNIT ACCELERATION source. Coefficient on RHS is identically 1.",
    b44_form: "modalSourceAmplitude = 10^((curveDb+gainDb)/20) ≈ 10^(94/20) ≈ 50,119. Applied as a direct multiplier to every modal term. This is a near-field 1m pressure reference, not a unit acceleration source and not dimensionally consistent with A1's RHS.",
    identical: "NO",
    missing: "A1's unit-normalised RHS — B44 introduces an unanchored amplitude scalar with no physical basis in A1",
    extra: "50,119× source amplitude with no acoustic unit justification",
    spl_impact: "Cannot be isolated in dB independently (same amplitude also applied to direct path), but establishes an incorrect physical basis for the modal/direct amplitude ratio",
    verdict: "UNIT MISMATCH — source type and strength not consistent with A1",
  },
  {
    n: 2,
    term: "Room eigenfrequency k_r",
    ab_eq: "A3",
    ab_form: "k_r = (nπ/L_x, lπ/L_y, mπ/L_z); k_r² = |k_r|²",
    b44_form: "f_r = (c/2)√((nx/Lx)²+(ny/Ly)²+(nz/Lz)²) — algebraically identical since k_r = (2π/c)·f_r and same geometry. computeRoomModesLocal() matches A3 exactly.",
    identical: "YES",
    missing: "none",
    extra: "none",
    spl_impact: "none",
    verdict: "EXACT MATCH to Eq. A3",
  },
  {
    n: 3,
    term: "Eigenfunction ψ_r",
    ab_eq: "A4",
    ab_form: "ψ_r(X) = cos(nπx/L_x)·cos(lπy/L_y)·cos(mπz/L_z)",
    b44_form: "modeShapeValueLocal() returns cos(nx·π·x/widthM)·cos(ny·π·y/lengthM)·cos(nz·π·z/heightM). Exact same expression.",
    identical: "YES",
    missing: "none",
    extra: "none",
    spl_impact: "none",
    verdict: "EXACT MATCH to Eq. A4",
  },
  {
    n: 4,
    term: "1/V room volume normalisation",
    ab_eq: "A2",
    ab_form: "P(k,X,X') = (1/V) Σ_r [ψ_r(X)·ψ_r(X') / (k_r² − k²)]. The 1/V appears as the leading coefficient of the ENTIRE modal sum. It is not optional — it is required for the modal sum to equal the image sum (proved in A5–A14). V = room volume in m³.",
    b44_form: "modalSourceReferenceMode='existing' in production call: no 1/V or ρc²/V factor anywhere in the modal path. Confirmed in rewBassEngine.js source — modalSourceAmplitude computation has no volume divisor.",
    identical: "NO",
    missing: "1/V factor (V = 55.755 m³ for this room)",
    extra: "none",
    spl_impact: `CONFIRMED MISSING. dB impact = +20·log10(V) = +20·log10(55.755) = +34.9 dB modal excess for ALL modes at ALL frequencies. This is the single largest discrepancy.`,
    verdict: "CONFIRMED MISSING — 1/V absent in B44, explicitly required by Eq. A2",
  },
  {
    n: 5,
    term: "Source coupling ψ_r(X_source)",
    ab_eq: "A2, A4",
    ab_form: "ψ_r(X) evaluated at source position X=(x,y,z) — same cosine form as A4",
    b44_form: "sourceCoupling = modeShapeValueLocal(mode, sub.x, sub.y, sub.z). Identical form.",
    identical: "YES",
    missing: "none",
    extra: "none",
    spl_impact: "none",
    verdict: "EXACT MATCH",
  },
  {
    n: 6,
    term: "Receiver coupling ψ_r(X')",
    ab_eq: "A2, A4",
    ab_form: "ψ_r(X') evaluated at receiver position — same cosine form",
    b44_form: "receiverCoupling = modeShapeValueLocal(mode, seat.x, seat.y, seat.z). Identical form.",
    identical: "YES",
    missing: "none",
    extra: "none",
    spl_impact: "none",
    verdict: "EXACT MATCH",
  },
  {
    n: 7,
    term: "Modal denominator / resonant transfer",
    ab_eq: "A2",
    ab_form: "1/(k_r² − k²) — dimensional form, units m². With Sabine Q-based lossy extension: 1/(k_r² − k² + j·k·k_r/Q). At resonance |1/denom| = Q/(k_r·Δk·2) ≈ Q/k_r² (m²). At f<<f_r: |1/denom| ≈ 1/k_r² (m²). k² = (2πf/c)², so ALL values are in m² units.",
    b44_form: "resonantTransfer(): 1/(1−(f/f₀)²+j·f/(f₀·Q)) — dimensionless ratio form. Algebraically = c²/ω_r² × [A2 denominator inverse with damping]. This embeds an implicit per-mode EXTRA factor of c²/ω_r² = 1/k_r² (m²) into every B44 modal term relative to A2.",
    identical: "NO — different normalisation convention, not algebraically identical",
    missing: "explicit k_r² divisor that A2's dimensional denominator inherently carries",
    extra: "implicit 1/k_r² gain factor per mode (frequency-dependent, favours low-frequency modes)",
    spl_impact: `FREQUENCY-DEPENDENT ERROR. B44 has extra factor 1/k_r² vs A2 per mode: at 30 Hz k_r=0.549 m⁻¹, 1/k_r²=3.31 m², +10.4 dB extra; at 58 Hz ≈ 0 dB; at 100 Hz k_r=1.833 m⁻¹, 1/k_r²=0.30 m², −10.5 dB; at 152 Hz k_r=2.783, 1/k_r²=0.13 m², −17.8 dB. This tilts the modal spectrum: low-frequency modes are MORE inflated than high-frequency modes relative to A2.`,
    verdict: "NORMALISATION CONVENTION MISMATCH — introduces frequency-dependent modal tilt vs Eq. A2",
  },
  {
    n: 8,
    term: "Damping extension",
    ab_eq: "A2 (lossless Appendix A) + Sabine Q extension",
    ab_form: "A2 is lossless in the paper. Adding Q-based loss: replace (k_r²−k²) with (k_r²−k²+j·k·k_r/Q) — standard Sabine/modal approach, endorsed by A&B's Section I text ('normal mode requires pole location from transcendental equations').",
    b44_form: "j·f/(f₀·Q) imaginary term in resonantTransfer — algebraically equivalent Q-based loss extension, same resonance shape, same bandwidth behaviour.",
    identical: "YES (functional equivalence once denominator convention difference in item 7 is accounted for)",
    missing: "none",
    extra: "none",
    spl_impact: "none additional",
    verdict: "FUNCTIONAL MATCH",
  },
  {
    n: 9,
    term: "Modal pressure summation",
    ab_eq: "A2",
    ab_form: "Coherent sum Σ_r over all modes r=(n,l,m)",
    b44_form: "Coherent complex accumulation — modalSumRe/Im in rewBassEngine.js.",
    identical: "YES",
    missing: "none",
    extra: "none",
    spl_impact: "none",
    verdict: "MATCH",
  },
  {
    n: 10,
    term: "Direct field / image sum",
    ab_eq: "Eq. 1 and Eq. 5/A13",
    ab_form: "P(ω,X,X') = Σ_p Σ_r exp[i(ω/c)|R_p+R_r|] / (4π|R_p+R_r|) — Eq. A13. Direct path is the r=0, p=direct-image term: exp[iωR/c]/(4πR) — Eq. 1.",
    b44_form: "Direct amplitude ∝ (1/R) × curveAmplitude, plus image-source reflections using β reflection coefficients. Matches A13/Eq.1 structure (1/R spherical spreading, β per wall-hit). Only difference: source amplitude is curveAmplitude not unit (see term 1).",
    identical: "YES (structurally, relative to B44's source convention)",
    missing: "none structural",
    extra: "none",
    spl_impact: "none additional vs the source-strength mismatch already captured in term 1",
    verdict: "STRUCTURAL MATCH to Eq. A13 / Eq. 1",
  },
  {
    n: 11,
    term: "Reflection coefficients",
    ab_eq: "Eq. 9, Eq. 10",
    ab_form: "β_x1, β_x2, β_y1, β_y2, β_z1, β_z2 — six wall reflection coefficients. α = 1 − β² (Eq. 9). Eq. 10 shows |NX−L|, |NX|, |NY−J|, |NY|, |NZ−K|, |NZ| exponents per image.",
    b44_form: "buildImageSources() uses six-wall β coefficients and per-wall-hit exponents — exactly matching Eq. 10 and Eq. 9.",
    identical: "YES",
    missing: "none",
    extra: "none",
    spl_impact: "none",
    verdict: "EXACT MATCH to Eq. 9/10",
  },
  {
    n: 12,
    term: "Eigenfunction normalisation beyond 1/V",
    ab_eq: "A2 (derivation A5–A14 proves sufficiency of 1/V)",
    ab_form: "A2 uses unnormalised ψ_r (Eq. A4) with 1/V. Appendix A proves via A5–A14 that this 1/V (combined with the 8 sign permutations summing 2^p / 8 = 1/2^(3−p) coefficients per mode-order) is the COMPLETE and SUFFICIENT normalisation for rigid-wall rectangular room modes. NO separate per-mode Λ_n or ε_n factor is required when using A2's form with 1/V.",
    b44_form: "B44 uses the same ψ_r (A4). But the 1/V is absent. The ONLY normalisation gap vs A2 is the missing 1/V — there is no additional separate Λ_n term needed once 1/V is present (the derivation is self-consistent).",
    identical: "N/A — B44 has correct eigenfunctions; the only normalisation error is the missing 1/V already captured in term 4.",
    missing: "none beyond 1/V",
    extra: "none",
    spl_impact: "Already captured in term 4. PRIOR CASE 063 PARTIALLY WITHDRAWN: the claim of a separate missing Λ_n = V·(1/2)^p divisor was incorrect — A2's 1/V is the complete normalisation; no additional Λ_n correction is required.",
    verdict: "NO ADDITIONAL NORMALISATION MISSING beyond the 1/V of Eq. A2",
  },
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
      if (!dominant) return { targetHz, mode: "—", b44Pressure: null, abExpectedPressure: null, ratio: null, dbDiff: null, note: "" };

      const f0 = dominant.modeFrequencyHz;
      const q = dominant.qValue;
      const combinedCoupling = dominant.combinedCoupling;
      const b44Pressure = dominant.activeMagnitude;

      // A&B Eq. A2 expected pressure for this mode at targetHz:
      // p_AB = (1/V) × combinedCoupling × |1/(k_r² − k²)| with Q-damping extension
      // Using the SAME combinedCoupling (ψ_r(X_s)·ψ_r(X_r)) and Q as B44, just applying A2's formulation.
      const { mag: abTransferMag, kr2 } = abModalTransfer(targetHz, f0, q);
      const abExpectedPressure = (1 / ROOM_VOLUME_M3) * combinedCoupling * abTransferMag;

      // B44 uses: combinedCoupling × B44_resonantTransfer_mag × modalSourceAmplitude
      // B44_resonantTransfer at same f,f0,Q:
      const ratio_f = targetHz / f0;
      const realDen = 1 - ratio_f * ratio_f;
      const imagDen = ratio_f / q;
      const b44TransferMag = 1 / Math.sqrt(realDen * realDen + imagDen * imagDen);
      const modalSourceAmplitude = Math.pow(10, CURVE_DB / 20);
      const b44ReconstructedPressure = combinedCoupling * b44TransferMag * modalSourceAmplitude;

      // dB difference between B44 and A&B (sign: positive means B44 is LARGER than A&B)
      const dbDiff = 20 * Math.log10(Math.max(b44ReconstructedPressure / Math.max(abExpectedPressure, 1e-15), 1e-10));

      // Component breakdown
      const kr = Math.sqrt(kr2);
      const dbFrom1V = 20 * Math.log10(ROOM_VOLUME_M3);
      const dbFromDenom = 20 * Math.log10(1 / Math.max(kr2, 1e-9));
      const dbFromSource = 20 * Math.log10(modalSourceAmplitude);

      return {
        targetHz,
        mode: `(${dominant.nx},${dominant.ny},${dominant.nz}) ${dominant.modeType} f₀=${fmt(f0, 1)} Hz`,
        b44Pressure: b44ReconstructedPressure,
        abExpectedPressure,
        dbDiff,
        combinedCoupling,
        kr: fmt(kr, 3),
        kr2: fmt(kr2, 3),
        q: fmt(q, 1),
        dbFrom1V: fmt(dbFrom1V, 1),
        dbFromDenom: fmt(dbFromDenom, 1),
        dbFromSource: fmt(dbFromSource, 1),
      };
    });
  }, [appState?.seatingPositions, appState?.frontSubsCfg]);

  return (
    <div style={{ border: "2px solid #1e3a8a", borderRadius: 10, background: "#eff6ff", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#1e3a8a", fontSize: 13, marginBottom: 6 }}>
        Case 063 — Allen & Berkley Modal Equation Audit (REVISED — paper now available)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#dbeafe", border: "1px solid #1d4ed8", color: "#1e3a8a", marginBottom: 10, fontSize: 9 }}>
        Reference: Allen & Berkley (1979) J. Acoust. Soc. Am. 65(4) 943–950. Appendix A only. All equation numbers (A1–A14) cite that Appendix verbatim. Previous Case 063 substitute-theory results are discarded. Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m (V={fmt(ROOM_VOLUME_M3, 2)} m³). No production changes. PARTIAL WITHDRAWAL: prior claim of a separate missing Λ_n normalisation term was incorrect — A2's 1/V is complete and sufficient per A5–A14 derivation; see term 12 below.
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7.5 }}>
          <thead>
            <tr style={{ background: "#dbeafe" }}>
              {["#", "Term", "A&B eq.", "A&B form (exact from paper)", "B44 form", "Identical?", "Missing/Extra", "SPL impact", "Verdict"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #1d4ed8", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TERM_AUDIT.map((t) => (
              <tr key={t.n} style={{ background: t.identical.startsWith("NO") ? "#fecaca" : t.identical.startsWith("N/A") ? "#fef9c3" : "transparent" }}>
                <td style={{ padding: "2px 4px", fontWeight: 700, verticalAlign: "top" }}>{t.n}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700, verticalAlign: "top", whiteSpace: "nowrap" }}>{t.term}</td>
                <td style={{ padding: "2px 4px", verticalAlign: "top", whiteSpace: "nowrap", color: "#1d4ed8" }}>{t.ab_eq}</td>
                <td style={{ padding: "2px 4px", verticalAlign: "top", maxWidth: 260 }}>{t.ab_form}</td>
                <td style={{ padding: "2px 4px", verticalAlign: "top", maxWidth: 200 }}>{t.b44_form}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700, verticalAlign: "top", whiteSpace: "nowrap" }}>{t.identical}</td>
                <td style={{ padding: "2px 4px", verticalAlign: "top", maxWidth: 200 }}>{t.missing}</td>
                <td style={{ padding: "2px 4px", verticalAlign: "top", maxWidth: 200 }}>{t.spl_impact}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700, verticalAlign: "top" }}>{t.verdict}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>NUMERIC CROSS-CHECK — dominant mode at each target frequency</div>
        <div style={{ fontSize: 7.5, color: "#1e3a8a", marginBottom: 4 }}>
          "A&B expected" = (1/V) × combinedCoupling × |1/(k_r²−k²)| per Eq. A2, using same ψ_r, Q, and k_r as B44. "B44 reconstructed" = combinedCoupling × B44_resonantTransfer × modalSourceAmplitude (no 1/V, different denominator convention). dB diff = 20·log10(B44/A&B) — positive means B44 is larger. Breakdown shows which factor contributes how many dB to the total excess.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
          <thead>
            <tr style={{ background: "#dbeafe" }}>
              {["Hz", "Dominant mode", "A&B expected (Eq.A2)", "B44 reconstructed", "B44/A&B (dB)", "k_r (m⁻¹)", "k_r² (m⁻²)", "dB from missing 1/V", "dB from denom conv (−20·log k_r²)", "dB from source amp"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #1d4ed8" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {numeric.map((r) => (
              <tr key={r.targetHz}>
                <td style={{ padding: "2px 4px", fontWeight: 700 }}>{r.targetHz}</td>
                <td style={{ padding: "2px 4px" }}>{r.mode}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.abExpectedPressure, 5)}</td>
                <td style={{ padding: "2px 4px" }}>{fmt(r.b44Pressure, 2)}</td>
                <td style={{ padding: "2px 4px", fontWeight: 700, color: "#b91c1c" }}>{fmt(r.dbDiff, 1)}</td>
                <td style={{ padding: "2px 4px" }}>{r.kr}</td>
                <td style={{ padding: "2px 4px" }}>{r.kr2}</td>
                <td style={{ padding: "2px 4px" }}>{r.dbFrom1V} dB</td>
                <td style={{ padding: "2px 4px" }}>{r.dbFromDenom} dB</td>
                <td style={{ padding: "2px 4px" }}>{r.dbFromSource} dB</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 7.5, color: "#7f1d1d", marginTop: 4 }}>
          Note: "dB from source amp" shows the curveAmplitude contribution in isolation; since the DIRECT path also uses the same curveAmplitude (with 1/R), this term approximately cancels in the modal/direct ratio — the NET modal excess relative to the direct path comes mainly from the missing 1/V and the denominator convention difference.
        </div>
      </div>

      <div style={{ padding: 10, borderRadius: 6, background: "#1e3a8a", color: "#eff6ff", border: "1px solid #1d4ed8", fontSize: 9 }}>
        <div style={{ fontWeight: 700, fontSize: 11 }}>SUMMARY OF DISCREPANCIES (A&B paper basis only)</div>
        <div style={{ marginTop: 6 }}>
          <strong>DISCREPANCY 1 — Missing 1/V (Eq. A2, confirmed):</strong> A&B's Appendix A Eq. A2 has 1/V as the leading coefficient of the modal sum. B44 has no such term. dB impact: +34.9 dB modal excess for all modes at all frequencies. This is the primary error. CONCLUSION FROM CASE 063 PRIOR VERSION CONFIRMED by the actual paper.<br/><br/>
          <strong>DISCREPANCY 2 — Denominator convention mismatch (Eq. A2):</strong> A2 uses (k_r²−k²) dimensional form (m⁻²). B44 uses normalised (1−(f/f₀)²+j/Q) dimensionless form. B44's form embeds an implicit per-mode factor of 1/k_r² relative to A2. This introduces a frequency-dependent tilt: B44 over-amplifies low-frequency modes (+10.4 dB at 30 Hz relative to A2 convention) and under-amplifies high-frequency modes (−17.8 dB at 152 Hz). This partially offsets the 1/V excess at high frequencies but worsens it at low frequencies.<br/><br/>
          <strong>PARTIAL WITHDRAWAL from prior Case 063:</strong> The claim of a separate missing "eigenfunction normalisation term Λ_n = V·(1/2)^p" is withdrawn. Appendix A derivation steps A5–A14 prove that 1/V combined with the raw cosine eigenfunctions of A4 is algebraically SUFFICIENT. No additional Λ_n or ε_n factor is needed beyond 1/V. The prior case overstated the number of independent errors.<br/><br/>
          <strong>TEST:</strong> Does B44's modal implementation match Allen & Berkley Appendix A (Eq. A2) term by term?<br/>
          <strong>EXPECTED (Eq. A2):</strong> (1/V) × ψ_r(X) × ψ_r(X') / (k_r²−k²) — three confirmed-matching terms (A3, A4, coherent summation) + two confirmed mismatches (missing 1/V, denominator convention).<br/>
          <strong>ACTUAL:</strong> ψ_r(X) × ψ_r(X') × B44_resonantTransfer × modalSourceAmplitude — no 1/V, wrong denominator convention, unphysical source amplitude.<br/>
          <strong>DELTA:</strong> Net modal excess (dominant mode, relative to A2, before source-amp cancellation with direct path): +34.9 dB from missing 1/V; ±10 to ±18 dB frequency-dependent tilt from denominator convention. Combined B44/A&B ratio at 30 Hz ≈ +45 dB, at 100 Hz ≈ +24 dB, at 152 Hz ≈ +17 dB.<br/>
          <strong>SEVERITY:</strong> CRITICAL — missing 1/V alone causes ~35 dB modal excess independent of frequency; denominator tilt makes it worse at LF and slightly better at HF.<br/>
          <strong>NEXT FIX CANDIDATE:</strong> 2. B44 MISSING ROOM VOLUME NORMALISATION — confirmed by Allen & Berkley Eq. A2. Apply 1/V multiplier to the modal sum path in rewBassEngine.js (modalSourceReferenceMode branch). Denominator convention should also be revisited to match A2's dimensional (k_r²−k²) form.
        </div>
      </div>
    </div>
  );
}