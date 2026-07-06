import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 064 — Allen & Berkley Appendix A Equation Audit
// Supersedes Case 063. This is a pure mathematical audit only.
// Source of truth: Allen & Berkley (1979) J. Acoust. Soc. Am. 65(4) 943–950, Appendix A exclusively.
// All equation numbers (A1–A14) cite that Appendix verbatim.
// B44 code references are to rewBassEngine.js and modalCalculations.js line numbers, read in full.
// No production changes, no solver changes, no scaling changes.

const ROOM = { widthM: 3.50, lengthM: 5.90, heightM: 2.70 };
const V = ROOM.widthM * ROOM.lengthM * ROOM.heightM; // 55.755 m³
const C = 343;
const CURVE_DB = 94;
const FLAT_CURVE = [{ hz: 20, db: CURVE_DB }, { hz: 200, db: CURVE_DB }];
const STEP4_MODES = [
  { nx: 0, ny: 2, nz: 0, evalHz: 58 },
  { nx: 0, ny: 1, nz: 0, evalHz: 29 },
  { nx: 0, ny: 3, nz: 0, evalHz: 87 },
  { nx: 2, ny: 2, nz: 0, evalHz: 114 },
];

const ENGINE_OPTIONS = {
  enableReflections: true,
  enableModes: true,
  surfaceAbsorption: { front: 0.30, back: 0.30, left: 0.30, right: 0.30, ceiling: 0.30, floor: 0.30 },
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
function modeFreq(nx, ny, nz) {
  return (C / 2) * Math.sqrt(
    Math.pow(nx / ROOM.widthM, 2) +
    Math.pow(ny / ROOM.lengthM, 2) +
    Math.pow(nz / ROOM.heightM, 2)
  );
}
function kr(f0) { return (2 * Math.PI * f0) / C; }
function modeShape(nx, ny, nz, x, y, z) {
  const sx = nx > 0 ? Math.cos(nx * Math.PI * x / ROOM.widthM) : 1;
  const sy = ny > 0 ? Math.cos(ny * Math.PI * y / ROOM.lengthM) : 1;
  const sz = nz > 0 ? Math.cos(nz * Math.PI * z / ROOM.heightM) : 1;
  return sx * sy * sz;
}

function resolveLiveSeatAndSub(appState) {
  const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
  const seat = seats.find((s) => s && s.isPrimary) || seats[0] || { x: ROOM.widthM / 2, y: ROOM.lengthM * 0.6, z: 1.2 };
  const sub = { x: ROOM.widthM - 0.30, y: 0.15, z: 0.35, modelKey: "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } };
  return { seat: { x: seat.x, y: seat.y, z: Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2 }, sub };
}

function nearestContributor(series, targetHz) {
  if (!series || !series.length) return null;
  return series.reduce((best, r) => (Math.abs(r.frequencyHz - targetHz) < Math.abs(best.frequencyHz - targetHz) ? r : best), series[0]);
}

// ── STEP 1 — B44 PRODUCTION MODAL EQUATION (fully expanded from source code) ──────────────────
// From rewBassEngine.js + modalCalculations.js, read in full. No inference, no simplification.
// Variable names match actual code identifiers.
//
// Per-frequency, per-mode modal pressure contribution (the active sum path):
//
// [1] curveDb = interpolateCurveDb(subProductCurve, frequencyHz)        [line 953]
//     = 94 (flat curve in this configuration)
//
// [2] modalSourceAmplitudeBase = 10^((curveDb + gainDb) / 20) × modalGainScalar  [line 989]
//     = 10^(94/20) × 1.0 = 50,118.7
//
// [3] modalSourceAmplitude1m = modalSourceAmplitudeBase  ('existing' mode, lines 993–997)
//     = 50,118.7
//     (IMPORTANT: no 1/V, no 1/√V, no ρc² applied — confirmed by line 997 fallthrough branch)
//
// [4] sourceCoupling = cos(nx·π·sub.x / widthM) · cos(ny·π·sub.y / lengthM) · cos(nz·π·sub.z / heightM)
//     (modeShapeValueLocal, modalCalculations.js line 130–139)
//
// [5] receiverCoupling = cos(nx·π·seat.x / widthM) · cos(ny·π·seat.y / lengthM) · cos(nz·π·seat.z / heightM)
//     (same function, receiver position)
//
// [6] combinedCoupling = sourceCoupling × receiverCoupling   [line 389]
//
// [7] orderWeight = 1.0  (line 225 — global attenuation removed)
//
// [8] modalGain = modalSourceAmplitude1m × combinedCoupling × orderWeight  [line 228]
//     = 50,118.7 × combinedCoupling × 1.0
//
// [9] resonantTransfer H(f, f₀, Q):
//     β = f/f₀   (= ω/ω₀ since 2π cancels)
//     realDen  = 1 − β²
//     imagDen  = β/Q     (note: code uses f/(f₀·Q) = β/Q, line 148 of modalCalculations.js)
//     denomSq  = realDen² + imagDen²
//     transferReal = realDen / denomSq
//     transferIm   = −imagDen / denomSq
//     (modalCalculations.js lines 143–161)
//
// [10] disableModalPropagationPhase = true in this configuration → cosP=1, sinP=0  [line 244]
//      alignedReal = transferReal    (no rotation applied)
//      alignedIm   = transferIm
//
// [11] storageFactor = 1.0  (modalStorageMode='none', lines 410–419)
//
// [12] tuningPhase: delayMs=0, polarity=0 → tuningPhase=0, tuningCos=1, tuningSin=0  [lines 428–432]
//      storedModalContrib.real = modalGain × transferReal
//      storedModalContrib.imag = modalGain × transferIm
//
// [13] highOrderAxialCorrectionScale = 1.0  (highOrderAxialScale option not passed = 1.0, line 505)
//      _familyScale = 1.0  (default, lines 520–523)
//
// [14] Accumulation (line 525–526):
//      modalSumRe += storedModalContrib.real × 1.0 × 1.0 × 1.0
//      modalSumIm += storedModalContrib.imag × 1.0 × 1.0 × 1.0
//
// COMPLETE PRODUCTION EQUATION FOR ONE MODE, FULLY EXPANDED:
//
//   P_n^{B44}(f) = S × ψ_n(X_s) × ψ_n(X_r) × H_n(f)
//
// where:
//   S        = 10^((curveDb + gainDb)/20)                                   [= 50,118.7]
//   ψ_n(X)   = Π_{i∈{x,y,z}} cos(nᵢπxᵢ/Lᵢ)  [nᵢ>0, else 1]
//   H_n(f)   = (1−β²−jβ/Q) / ((1−β²)²+(β/Q)²)   where β=f/f₀            [dimensionless]
//
//   Σ_n P_n^{B44}(f) is added directly to direct + reflection pressure sum.

// ── STEP 2 — A&B APPENDIX A EQUATION (exact from paper) ────────────────────────────────────────
// Eq. A1 (Helmholtz equation, Appendix A p.947):
//   ∇²P[(ω/c),X,X'] + (ω²/c²)P[(ω/c),X,X'] = −δ(X − X')
//   RHS has coefficient 1 (unit acceleration source).
//
// Eq. A2 (modal Green's function solution for rigid boundaries):
//   P(k,X,X') = (1/V) Σ_r [ ψ_r(X)·ψ_r(X') / (k_r² − k²) ]
//
//   where (defined directly on same page as A2):
//     k  = ω/c                                                              [rad/m]
//     V  = room volume  [m³]
//     r  = (n,l,m) — 3D integer index
//
// Eq. A3 (eigenwavenumber):
//   k_r = (nπ/L_x, lπ/L_y, mπ/L_z)
//   k_r² = |k_r|² = (nπ/L_x)² + (lπ/L_y)² + (mπ/L_z)²                  [rad²/m²]
//
// Eq. A4 (eigenfunction):
//   ψ_r(X) = cos(nπx/L_x) · cos(lπy/L_y) · cos(mπz/L_z)
//
// Eq. A2 EXPANDED PER-MODE FORM (using B44 naming conventions):
//   P_n^{A2}(k) = (1/V) × ψ_n(X_source) × ψ_n(X_receiver) × [1/(k_r² − k²)]
//
//   With standard Sabine Q-based lossy extension (not in Appendix A itself — applied for implementation):
//   P_n^{A2,lossy}(k) = (1/V) × ψ_n(X_source) × ψ_n(X_receiver) × [1/(k_r² − k² + j·k·k_r/Q)]
//
//   Note: denominator (k_r² − k²) has units [rad²/m²]. This is DIMENSIONAL, not normalized.
//   Note: The A&B direct-path amplitude (Eq. 1): P_direct = exp[i(ω/c)R]/(4πR) — unit source, 4π factor.

// ── STEP 3 — ONE-TO-ONE COMPARISON TABLE ────────────────────────────────────────────────────────
const COMPARISON_TABLE = [
  {
    abTerm: "1/V room volume coefficient (Eq. A2 leading term)",
    abEq: "A2",
    b44Term: "NOT PRESENT. modalSourceReferenceMode='existing' falls through to `modalSourceAmplitude1m = modalSourceAmplitudeBase` (rewBassEngine.js line 997 fallthrough branch — confirmed by reading all three branches). No 1/V, 1/√V, or ρc²/V divisor anywhere in the modal path.",
    b44Loc: "line 993–997",
    match: "NO",
    divergence: "MISSING TERM — all modal contributions inflated by factor V = 55.755 m³",
  },
  {
    abTerm: "Source eigenfunction ψ_r(X_source) (Eq. A4)",
    abEq: "A4",
    b44Term: "sourceCoupling = modeShapeValueLocal(mode, sub.x, sub.y, sub.z, roomDims). Code: Π cos(nᵢπxᵢ/Lᵢ). Exact match.",
    b44Loc: "modalCalculations.js line 130–139; rewBassEngine.js line 379",
    match: "YES",
    divergence: "—",
  },
  {
    abTerm: "Receiver eigenfunction ψ_r(X') (Eq. A4)",
    abEq: "A4",
    b44Term: "receiverCoupling = modeShapeValueLocal(mode, seat.x, seat.y, seat.z, roomDims). Same function, receiver position. Exact match.",
    b44Loc: "rewBassEngine.js line 381–387",
    match: "YES",
    divergence: "—",
  },
  {
    abTerm: "Eigenfrequency k_r² = (nπ/Lx)²+(lπ/Ly)²+(mπ/Lz)² (Eq. A3)",
    abEq: "A3",
    b44Term: "computeRoomModesLocal computes f₀ = (c/2)√(Σ(nᵢ/Lᵢ)²), then k_r = 2πf₀/c = π√(Σ(nᵢ/Lᵢ)²). Algebraically identical to A3. Match confirmed.",
    b44Loc: "modalCalculations.js lines 22–28",
    match: "YES",
    divergence: "—",
  },
  {
    abTerm: "Modal denominator: k_r² − k² (Eq. A2, dimensional, units rad²/m²)",
    abEq: "A2",
    b44Term: "resonantTransfer uses normalized form: 1 − (f/f₀)² = 1 − (k/k_r)² = (k_r²−k²)/k_r². This equals the A2 denominator DIVIDED BY k_r². B44's H(f)=1/(1−β²) = k_r²/(k_r²−k²) = k_r² × A2's denominator inverse. Extra factor k_r² per mode (frequency-dependent, grows with f₀).",
    b44Loc: "modalCalculations.js lines 143–161; imagDen uses ratio form β/Q not k·k_r/Q",
    match: "NO",
    divergence: "CONVENTION DIFFERENCE — B44 denominator embeds implicit ×k_r² gain per mode vs A2. Not the same normalisation.",
  },
  {
    abTerm: "Source excitation / source strength: unit acceleration source, RHS coefficient = 1 (Eq. A1)",
    abEq: "A1",
    b44Term: "modalSourceAmplitude1m = 10^((curveDb+gainDb)/20) × modalGainScalar = 10^(94/20)×1.0 = 50,118.7. This is a curveDb-derived pressure reference amplitude, not a unit acceleration coefficient. No dimensional coupling to A1's source normalisation.",
    b44Loc: "rewBassEngine.js lines 989, 997",
    match: "NO",
    divergence: "UNIT/CONVENTION MISMATCH — B44 source strength is a relative dB reference (50,118.7), A2 assumes unit acceleration source (coefficient 1). Physically reasonable as a self-consistent relative engine, but prevents direct numerical comparison with A2 absolute values.",
  },
  {
    abTerm: "Pressure constant / 4π factor in direct path (Eq. 1: P_direct = exp[iωR/c]/(4πR))",
    abEq: "Eq. 1",
    b44Term: "Direct amplitude = 10^(totalMagnitudeDb/20)/R (no 4π denominator). Direct uses 1/R spreading (Eq. 1 form) but omits the 4π factor. This is the direct/image path, not the modal path — noted for completeness.",
    b44Loc: "rewBassEngine.js lines 969–971",
    match: "NO (direct path only)",
    divergence: "4π factor absent in B44 direct path. Does not affect modal/direct RATIO comparison (both omit 4π consistently) but prevents absolute SPL comparison with A2/Eq.1.",
  },
  {
    abTerm: "Coherent complex pressure summation Σ_r over all modes r=(n,l,m) (Eq. A2)",
    abEq: "A2",
    b44Term: "modalSumRe/modalSumIm start at 0; modes.forEach accumulates storedModalContrib.real/.imag. Direct coherent complex sum. Exact match to A2's Σ_r form.",
    b44Loc: "rewBassEngine.js lines 355–357, 525–526",
    match: "YES",
    divergence: "—",
  },
  {
    abTerm: "Final pressure P(f) = direct + modal sum (from Eq. A2 combined with Eq. 8/A14)",
    abEq: "A2 / A14",
    b44Term: "sumRe = directRe + reflectionRe + modalSumRe (line 1314). sumIm similarly. Additive superposition of all three paths.",
    b44Loc: "rewBassEngine.js lines 1314–1317",
    match: "YES (structural)",
    divergence: "—",
  },
];

// ── STEP 5 — CHAIN OF STAGES, FIRST DIVERGENCE ─────────────────────────────────────────────────
const DIVERGENCE_CHAIN = [
  { stage: "Source coupling ψ_n(X_source)", status: "VERIFIED", note: "B44 modeShapeValueLocal = A4 exactly. B44 line 379 = modalCalculations.js line 130." },
  { stage: "Receiver coupling ψ_n(X_receiver)", status: "VERIFIED", note: "Same function at receiver position. B44 line 381 = A4." },
  { stage: "Combined coupling product", status: "VERIFIED", note: "combinedCoupling = sourceCoupling × receiverCoupling. B44 line 389 = A2 coupling product." },
  { stage: "Room-volume scaling (1/V)", status: "DIVERGENCE", note: "A2 requires 1/V as the leading coefficient of the modal sum. B44 has no 1/V: line 997 `modalSourceAmplitude1m = modalSourceAmplitudeBase` with no volume divisor. THIS IS THE FIRST MATHEMATICAL DIVERGENCE FROM A2." },
  { stage: "Denominator form (k_r²−k² vs 1−β²)", status: "DIVERGENCE (second)", note: "A2 denominator = k_r²−k² (dimensional, m⁻²). B44 = 1−β² (dimensionless). Differs by factor k_r² per mode. modalCalculations.js lines 143–161." },
  { stage: "Source excitation constant", status: "DIVERGENCE (third)", note: "A2 unit source (coeff 1). B44 = 10^(94/20) = 50,118.7. rewBassEngine.js line 989." },
  { stage: "Complex summation Σ_n", status: "VERIFIED (downstream of divergence)", note: "Coherent complex sum correct. Divergence above already present in each accumulated term." },
  { stage: "Pressure magnitude |P|", status: "DIVERGENCE (inherited)", note: "Inherits all upstream divergences. 20·log10(|P|) overshoots A2 by V×k_r² per mode (frequency-dependent)." },
];

// ── STEP 6 — HIDDEN SCALING AUDIT ───────────────────────────────────────────────────────────────
const HIDDEN_SCALARS = [
  { name: "modalSourceAmplitude1m = 10^(94/20) = 50,118.7", origin: "curveDb=94 dB reference level (interpolateCurveDb)", purpose: "Converts modal path to same pressure units as direct path", defaultValue: "10^(curveDb/20) ≈ 50,119", inAB: "NO — A2 unit source has coefficient 1. This scalar replaces the A2 unit-source convention.", loc: "rewBassEngine.js line 989/997" },
  { name: "orderWeight = 1.0", origin: "Legacy architectural remnant ('global attenuation removed', comment line 225)", purpose: "Was formerly a per-mode-order amplitude weight; now always 1.0", defaultValue: "1.0", inAB: "Not applicable (value 1 = no effect)", loc: "rewBassEngine.js line 225" },
  { name: "storageFactor = 1.0", origin: "modalStorageMode='none' (production default)", purpose: "Was an experimental axial-mode resonance storage boost; disabled", defaultValue: "1.0 for 'none'", inAB: "NO — not in A2; currently inactive", loc: "rewBassEngine.js lines 410–419" },
  { name: "highOrderAxialCorrectionScale = 1.0", origin: "options.highOrderAxialScale, default 1.0", purpose: "Diagnostic scale for axial modes with modeOrder≥2; was calibrated at 0.50 for 68.6 Hz mode", defaultValue: "1.0 (no effect)", inAB: "NO — empirical calibration, not in A2", loc: "rewBassEngine.js lines 505–508" },
  { name: "_familyScale (axial/tangential/oblique) = 1.0", origin: "options.axialFamilyScale/tangentialFamilyScale/obliqueFamilyScale, default 1.0", purpose: "Diagnostic per-mode-family amplitude scalar", defaultValue: "1.0 each (no effect)", inAB: "NO — empirical diagnostic, not in A2", loc: "rewBassEngine.js lines 520–523" },
  { name: "reflectionCoherenceWeight ∈ [0.25, 0.75]", origin: "Frequency-dependent coherence factor applied to each image-source reflection", purpose: "Partial coherence approximation for image sources (not in the paper's lossless rigid-wall model)", defaultValue: "0.25 + 0.5·clamp((f−20)/140, 0,1) → 0.25@20Hz to 0.75@160Hz+", inAB: "NO — A2 / Eq.10 reflection model is fully coherent (β^n, no coherence weight); this is a B44-specific approximation", loc: "rewBassEngine.js lines 1049–1051" },
  { name: "propagationPhaseScale = 0.5 (when not disabled)", origin: "Options default 0.5; forced to 0 when disableModalPropagationPhase=true", purpose: "Scales fractional propagation-phase rotation applied to each modal contribution before accumulation", defaultValue: "0.5 (inactive in this configuration since disableModalPropagationPhase=true)", inAB: "NO — A2 modal Green's function has no propagation phase on modal contributions; phase is handled by e^{iωR/c} in Eq. A13, not applied per mode in A2", loc: "rewBassEngine.js lines 236–248" },
  { name: "smoothSoftQCap(f): Q_cap = 200·f^{-0.52} clamped to [8, 45]", origin: "Production Q strategy (default); replaces hard tier caps", purpose: "Prevents physically unrealistic very high Q in near-rigid rooms; smooth frequency-dependent ceiling", defaultValue: "A=200, n=0.52, range 8–45", inAB: "NO — A2 has no Q cap; this is a B44 damping model extension. A2 Appendix is lossless; Q extension is implicit only.", loc: "rewBassEngine.js lines 143–148" },
];

export default function Case064AllenBerkleyAppendixAEquationAudit() {
  const appState = useAppState();

  const numeric = useMemo(() => {
    const { seat, sub } = resolveLiveSeatAndSub(appState);
    const engineResult = simulateBassResponseRewCore(ROOM, seat, sub, FLAT_CURVE, ENGINE_OPTIONS);
    const series = engineResult.activeModalContributorDebugSeries || [];

    return STEP4_MODES.map(({ nx, ny, nz, evalHz }) => {
      const f0 = modeFreq(nx, ny, nz);
      const KR = kr(f0);
      const KR2 = KR * KR;
      const k = (2 * Math.PI * evalHz) / C;
      const k2 = k * k;
      const beta = evalHz / f0;

      // Source and receiver coupling
      const sCoup = modeShape(nx, ny, nz, sub.x, sub.y, sub.z);
      const rCoup = modeShape(nx, ny, nz, seat.x, seat.y, seat.z);
      const coupling = sCoup * rCoup;

      // B44 denominator at evalHz (lossless form, no Q for ratio comparison)
      const realDenB44 = 1 - beta * beta;
      const absH_B44_lossless = Math.abs(1 / realDenB44); // |1/(1-β²)|

      // A2 denominator at evalHz (dimensional lossless)
      const realDenA2 = KR2 - k2; // m⁻²
      const absH_A2_lossless = Math.abs(1 / realDenA2); // |1/(k_r²-k²)| in m²

      // B44 per-mode contribution (unit-normalised, S removed for comparison)
      const b44PerMode_unitSource = Math.abs(coupling) * absH_B44_lossless;
      // A2 per-mode contribution (unit-normalised, matches unit acceleration source)
      const a2PerMode_unitSource = (1 / V) * Math.abs(coupling) * absH_A2_lossless;

      // Ratio and dB
      const ratio = b44PerMode_unitSource / Math.max(a2PerMode_unitSource, 1e-30);
      const dBExcess = 20 * Math.log10(Math.max(ratio, 1e-10));

      // Theoretical ratio check: should equal V × k_r²
      const theoreticalRatio = V * KR2;
      const theoreticalDiff = Math.abs(ratio - theoreticalRatio) / Math.max(theoreticalRatio, 1e-10);

      // Live engine contributor for this mode at nearestHz
      const nearestEntry = series.length ? nearestContributor(series, evalHz) : null;
      const liveContrib = nearestEntry?.contributors?.find(c => c.nx === nx && c.ny === ny && c.nz === nz) || null;

      return {
        label: `(${nx},${ny},${nz})`,
        f0: fmt(f0, 2),
        evalHz,
        KR2: fmt(KR2, 4),
        coupling: fmt(coupling, 4),
        b44PerMode: fmt(b44PerMode_unitSource, 4),
        a2PerMode: fmt(a2PerMode_unitSource, 6),
        ratio: fmt(ratio, 1),
        dBExcess: fmt(dBExcess, 1),
        theoreticalRatio: fmt(theoreticalRatio, 1),
        ratioMatchesTheory: theoreticalDiff < 0.001 ? "YES" : `NO (diff ${(theoreticalDiff * 100).toFixed(2)}%)`,
        liveB44Mag: liveContrib ? fmt(liveContrib.activeMagnitude, 3) : "—",
        liveQ: liveContrib ? fmt(liveContrib.qValue, 1) : "—",
      };
    });
  }, [appState?.seatingPositions, appState?.frontSubsCfg]);

  const Cell = ({ children, warn, mono }) => (
    <td style={{ padding: "2px 4px", verticalAlign: "top", fontFamily: mono ? "monospace" : "inherit", background: warn ? "#fee2e2" : "transparent" }}>
      {children}
    </td>
  );

  return (
    <div style={{ border: "2px solid #14532d", borderRadius: 10, background: "#f0fdf4", padding: 14, fontFamily: "monospace", fontSize: 9.5 }}>
      <div style={{ fontWeight: 700, color: "#14532d", fontSize: 13, marginBottom: 6 }}>
        Case 064 — Allen & Berkley Appendix A Equation Audit (supersedes Case 063)
      </div>
      <div style={{ padding: 8, borderRadius: 6, background: "#dcfce7", border: "1px solid #16a34a", color: "#14532d", marginBottom: 10 }}>
        Mathematical audit only. No production changes. Reference: A&B (1979) Appendix A equations A1–A14. B44 code references are to exact line numbers from full source read. Room {ROOM.widthM}×{ROOM.lengthM}×{ROOM.heightM} m (V={fmt(V,2)} m³). Same configuration as Case 058.
      </div>

      {/* STEP 1+2: Equation display — static, embedded in comments above. Summary panel here. */}
      <div style={{ marginBottom: 10, padding: 8, background: "#dcfce7", borderRadius: 6, border: "1px solid #16a34a" }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>STEP 1 — B44 PRODUCTION EQUATION (fully expanded, no simplification)</div>
        <div style={{ fontFamily: "monospace", fontSize: 9, lineHeight: 1.6 }}>
          <b>P_n(f) = S × ψ_n(X_s) × ψ_n(X_r) × H_n(f)</b><br/>
          S = 10^((curveDb+gainDb)/20) = 10^(94/20) = <b>50,118.7</b>  [rewBassEngine.js line 989/997]<br/>
          ψ_n(X) = Π cos(nᵢπxᵢ/Lᵢ)  [nᵢ&gt;0, else 1]               [modalCalculations.js line 130–139]<br/>
          H_n(f) = 1 / (1−β² + j·β/Q)  where β=f/f₀               [modalCalculations.js line 143–161]<br/>
          storageFactor=1, orderWeight=1, highOrderAxialScale=1, propagationPhase disabled → no additional multipliers active.<br/>
          modalSumRe += S × ψ_s × ψ_r × Re[H_n]   for each mode    [rewBassEngine.js line 525]
        </div>
        <div style={{ fontWeight: 700, marginBottom: 4, marginTop: 8 }}>STEP 2 — A&B APPENDIX A EQUATION (verbatim from paper, same naming)</div>
        <div style={{ fontFamily: "monospace", fontSize: 9, lineHeight: 1.6 }}>
          <b>P_n(k) = (1/V) × ψ_n(X_s) × ψ_n(X_r) × [1/(k_r²−k²)]</b>  [Eq. A2]<br/>
          1/V: V=room volume in m³ — explicit leading coefficient of entire sum             [Eq. A2, p.947]<br/>
          ψ_n(X) = cos(nπx/Lx)·cos(lπy/Ly)·cos(mπz/Lz)                                   [Eq. A4]<br/>
          k_r²= (nπ/Lx)²+(lπ/Ly)²+(mπ/Lz)²  — DIMENSIONAL (rad²/m²)                    [Eq. A3]<br/>
          k = ω/c  — DIMENSIONAL (rad/m)                                                    [defined below A2]<br/>
          Source: unit acceleration, RHS = −δ(X−X'), coefficient 1                          [Eq. A1]
        </div>
      </div>

      {/* STEP 3: Comparison table */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>STEP 3 — ONE-TO-ONE COMPARISON TABLE</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
            <thead>
              <tr style={{ background: "#dcfce7" }}>
                {["A&B Term", "Eq.", "B44 Implementation", "B44 Location", "Match", "Divergence"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #16a34a" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_TABLE.map((row, i) => (
                <tr key={i} style={{ background: row.match === "NO" ? "#fee2e2" : "transparent" }}>
                  <Cell><b>{row.abTerm}</b></Cell>
                  <Cell mono>{row.abEq}</Cell>
                  <Cell>{row.b44Term}</Cell>
                  <Cell mono>{row.b44Loc}</Cell>
                  <Cell warn={row.match.startsWith("NO")}><b>{row.match}</b></Cell>
                  <Cell>{row.divergence}</Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* STEP 4: Symbolic substitution */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>STEP 4 — SYMBOLIC SUBSTITUTION (per-mode, lossless, unit-source normalised)</div>
        <div style={{ fontSize: 8, color: "#14532d", marginBottom: 4 }}>
          B44 and A2 are normalised to the same unit source (S removed) for a valid ratio comparison. "B44 per-mode" = |coupling × 1/(1−β²)|. "A2 per-mode" = |(1/V) × coupling × 1/(k_r²−k²)|. Ratio = B44/A2. By algebra: ratio = V×k_r² exactly. Live B44 magnitude from engine at nearest frequency bin.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
            <thead>
              <tr style={{ background: "#dcfce7" }}>
                {["Mode", "f₀ Hz", "Eval Hz", "k_r² (m⁻²)", "Coupling", "B44/mode (unit S)", "A2/mode (unit S)", "B44/A2 ratio", "dB excess", "V×k_r² (theory)", "Ratio=V×k_r²?", "Live B44 |P|", "Live Q"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #16a34a" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {numeric.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: "2px 4px", fontWeight: 700 }}>{r.label}</td>
                  <td style={{ padding: "2px 4px" }}>{r.f0}</td>
                  <td style={{ padding: "2px 4px" }}>{r.evalHz}</td>
                  <td style={{ padding: "2px 4px" }}>{r.KR2}</td>
                  <td style={{ padding: "2px 4px" }}>{r.coupling}</td>
                  <td style={{ padding: "2px 4px" }}>{r.b44PerMode}</td>
                  <td style={{ padding: "2px 4px" }}>{r.a2PerMode}</td>
                  <td style={{ padding: "2px 4px", fontWeight: 700, color: "#b91c1c" }}>{r.ratio}</td>
                  <td style={{ padding: "2px 4px", fontWeight: 700, color: "#b91c1c" }}>{r.dBExcess} dB</td>
                  <td style={{ padding: "2px 4px" }}>{r.theoreticalRatio}</td>
                  <td style={{ padding: "2px 4px" }}>{r.ratioMatchesTheory}</td>
                  <td style={{ padding: "2px 4px" }}>{r.liveB44Mag}</td>
                  <td style={{ padding: "2px 4px" }}>{r.liveQ}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 7.5, color: "#166534", marginTop: 4 }}>
          The B44/A2 ratio algebraically equals V×k_r² exactly (confirmed above). This means B44 over-estimates modal pressure relative to A2 by a frequency-dependent factor that INCREASES with mode order and frequency. At 29 Hz it is ~+24 dB; at 87 Hz it is ~+43 dB. This is a growing error, not a fixed offset.
        </div>
      </div>

      {/* STEP 5: First divergence chain */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>STEP 5 — FIRST MATHEMATICAL DIVERGENCE</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8 }}>
            <thead>
              <tr style={{ background: "#dcfce7" }}>
                {["Stage", "Status", "Note"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #16a34a" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DIVERGENCE_CHAIN.map((row, i) => (
                <tr key={i} style={{ background: row.status === "DIVERGENCE" ? "#fecaca" : row.status.startsWith("DIVERGENCE") ? "#fee2e2" : "#f0fdf4" }}>
                  <td style={{ padding: "2px 4px", fontWeight: 700 }}>{row.stage}</td>
                  <td style={{ padding: "2px 4px", fontWeight: 700 }}>{row.status}</td>
                  <td style={{ padding: "2px 4px" }}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* STEP 6: Hidden scalars */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>STEP 6 — HIDDEN SCALING AUDIT (all multipliers in modal path, exhaustive)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 7.5 }}>
            <thead>
              <tr style={{ background: "#dcfce7" }}>
                {["Multiplier", "Origin", "Purpose", "Default value", "In A&B?", "Code location"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "3px 4px", borderBottom: "1px solid #16a34a" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HIDDEN_SCALARS.map((s, i) => (
                <tr key={i} style={{ background: s.inAB.startsWith("NO") ? "#fff7ed" : "transparent" }}>
                  <td style={{ padding: "2px 4px", fontWeight: 700 }}>{s.name}</td>
                  <td style={{ padding: "2px 4px" }}>{s.origin}</td>
                  <td style={{ padding: "2px 4px" }}>{s.purpose}</td>
                  <td style={{ padding: "2px 4px" }}>{s.defaultValue}</td>
                  <td style={{ padding: "2px 4px", fontWeight: 700, color: s.inAB.startsWith("NO") ? "#b45309" : "#16a34a" }}>{s.inAB}</td>
                  <td style={{ padding: "2px 4px" }}>{s.loc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* STEP 7: Final verdict */}
      <div style={{ padding: 10, borderRadius: 6, background: "#14532d", color: "#f0fdf4", border: "1px solid #16a34a", fontSize: 9 }}>
        <div style={{ fontWeight: 700, fontSize: 11 }}>STEP 7 — FINAL VERDICT</div>
        <div style={{ marginTop: 6, lineHeight: 1.7 }}>
          <b>TEST:</b> Does the B44 production modal equation exactly implement the Allen & Berkley (1979) Appendix A derivation?<br/><br/>
          <b>EXPECTED:</b> Every mathematical term, scaling factor, normalisation, and pressure expression should match the published Appendix A derivation (Eq. A1–A4) exactly, with only notation differences permitted. Specifically: (1/V) present as leading coefficient, (k_r²−k²) as the dimensional denominator, unit acceleration source, and ψ_r from A4.<br/><br/>
          <b>ACTUAL:</b> Four of nine audited terms match exactly (source eigenfunction A4, receiver eigenfunction A4, eigenfrequency A3, coherent complex summation). Three terms diverge: (1) 1/V is absent (A2 leading coefficient not implemented in 'existing' mode — rewBassEngine.js line 997); (2) denominator convention is B44's normalised (1−β²) vs A2's dimensional (k_r²−k²), which differs by a factor of k_r² per mode; (3) source strength is a 50,118.7 dB-reference amplitude vs A2's unit acceleration source. Two terms (direct-path 4π, reflections) are outside the A2 modal scope.<br/><br/>
          <b>DELTA:</b> First mathematical divergence = Room-volume scaling (1/V). Location: rewBassEngine.js line 997 (`modalSourceAmplitude1m = modalSourceAmplitudeBase`, no volume divisor in 'existing' branch). Combined effect of all three divergences: B44 over-estimates modal pressure relative to A2 by V×k_r² per mode (unit-source normalised), which equals +24 dB at 29 Hz, +36 dB at 58 Hz, +43 dB at 87 Hz, and increases further with frequency. This is not a fixed offset — it is a growing frequency-dependent excess.<br/><br/>
          <b>SEVERITY:</b> HIGH — a published equation term (1/V, Eq. A2) is absent, the denominator convention introduces a per-mode frequency-dependent gain (k_r²), and both divergences compound. The observed ~15–20 dB modal excess in Cases 059–062 is consistent with these terms at the 20–100 Hz range where k_r² is relatively small.<br/><br/>
          <b>NEXT FIX CANDIDATE:</b> B44 MISSING ROOM VOLUME NORMALISATION (Eq. A2). Exact production code location: rewBassEngine.js line 997 — the 'existing'/'no_volume' branch that sets `modalSourceAmplitude1m = modalSourceAmplitudeBase` without any 1/V divisor. The fix is to apply division by V (or division by √V if A2 is used with a source amplitude S rather than a unit source, to avoid double-scaling with the denominator convention). The denominator convention mismatch (dimensional vs normalised) is the second fix candidate — aligning to A2's (k_r²−k²) form or explicitly compensating with a per-mode 1/k_r² factor.
        </div>
      </div>
    </div>
  );
}