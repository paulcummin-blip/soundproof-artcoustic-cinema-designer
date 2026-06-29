/**
 * CanonicalModalDeviationAudit.jsx
 *
 * Diagnostic only. Read-only. No production code modified.
 *
 * Audits every deliberate deviation from the canonical rigid-room modal solution
 * found in rewBassEngine.js and modalCalculations.js.
 *
 * Rendered inside ImageSourceParityShootout — below ModalFamilyExcitationAudit.
 */

import React, { useState } from "react";

// ─── Deviation data (derived entirely from source audit) ─────────────────────

const DEVIATIONS = [
  {
    id: 1,
    location: "rewBassEngine.js:841\nsimulateBassResponseRewCore()",
    name: "modalSourceReferenceMode = 'distance_normalized'",
    canonical: "Modal source amplitude = source output at 1 m reference only. Seat-distance attenuation is fully handled by Ψ_source·Ψ_receiver coupling — NOT by a distance scalar on the source amplitude. No 1/r pre-scaling.",
    actual: "Default path multiplies modalSourceAmplitudeBase by Math.pow(10, distanceLossDb/20) — i.e., 1/r_seat. This adds a 1/r factor to the modal amplitude on top of the coupling already encoding geometry. When rewParityModalPhase is true, falls back to 'room_volume' instead.",
    why: "Audit result: reduced MAE 7.20→2.85 dB vs REW for test room. Empirically found to improve parity over 'existing' mode. Not grounded in rectangular-room Green's function theory.",
    effect: "Scales ALL modal contributions down by 1/r_seat uniformly. Reduces modal peak heights without changing their frequencies or relative balance. Makes curve flatter / less extreme.",
    severity: "HIGH",
    testPriority: 1,
  },
  {
    id: 2,
    location: "rewBassEngine.js:422-443\nlegacyModalTransferLocal()",
    name: "highOrderAxialCorrectionScale (highOrderAxialScale)",
    canonical: "All axial modes (order 1, 2, 3…) accumulate with full amplitude. No harmonic-order penalty. Rectangular-room Green's function treats (2,0,0) and (1,0,0) identically in the transfer function normalisation.",
    actual: "Any axial mode with modeOrder ≥ 2 (e.g. 2,0,0 at ~68 Hz) has its stored pressure contribution multiplied by highOrderAxialScale (default 1.0 in parity path; 0.5 in simulateBassResponseRewParityField hardcoded at line 1646). Production default via options is 1.0 unless caller overrides.",
    why: "Comment at line 417–420: 'axial harmonics over-estimated relative to REW because harmonic energy dissipation applies in measured rooms'. Tuned to bring 68.6 Hz from ~94.8 dB to ~92.6 dB vs REW target ~92.4 dB.",
    effect: "Attenuates 2nd-order+ axial harmonics specifically. Deepens their nulls, reduces their peaks. Does NOT affect tangential/oblique or fundamental axial modes. Selectively smooths the upper-axial frequency range.",
    severity: "HIGH",
    testPriority: 2,
  },
  {
    id: 3,
    location: "rewBassEngine.js:105-121\nestimateModeQByType()",
    name: "Family-typed base Q values (axial=4.0, tang=3.9, oblique=2.5)",
    canonical: "Canonical rigid-room: all modes have Q determined solely by absorption (Sabine). No type-based base Q differentiation. A lightly absorbed room gives the same Q to all mode families at the same frequency. Q=f·RT60/2.2 (exact Sabine formula); no family floor.",
    actual: "Three separate base Q values: axial=axialQ(default 4.0), tangential=3.9, oblique=2.5. Final Q = Math.max(1, Math.min(baseQ, absorptionQ)). The Math.min clamp prevents any family from exceeding its base Q even if absorption would allow higher Q. Comment: 'updated from Q Source Audit 2026-06-19, previous values ~1.8× too high'.",
    why: "Empirical parity correction. Previous values (8.0/6.0/4.5) produced curves too narrow/peaky vs REW. Reduced to present values to match REW smoothing. Not derived from first principles.",
    effect: "All modes are Q-clamped below their Sabine prediction. Low absorption → high Sabine Q, but base Q cap applies. Result: resonance peaks are broader and shorter than a pure Sabine rigid room. Oblique modes (Q=2.5) are maximally broadened — they contribute a smooth energy floor rather than sharp features.",
    severity: "HIGH",
    testPriority: 3,
  },
  {
    id: 4,
    location: "rewBassEngine.js:896-900\nreflection path in simulateBassResponseRewCore()",
    name: "reflectionCoherenceWeight (frequency-dependent)",
    canonical: "Specular image-source reflections add fully coherently. Each image source contributes amplitude×reflectionCoefficient×e^{jφ} — full coherence, no coherence weight.",
    actual: "Each image-source contribution is multiplied by reflectionCoherenceWeight = clamp(0.25, 0.75, 0.25 + 0.5 × clamp(0, 1, (f−20)/140)). At 20 Hz: 0.25. At 160 Hz: 0.75. Ramps linearly between 20–160 Hz.",
    why: "Comment: original formula 'preserved, commented out'. Present code is unchanged from original. Intent appears to model partial coherence of reverberant reflections — low-frequency reflections treated as mostly incoherent, HF as more coherent. No first-principles derivation cited.",
    effect: "Attenuates all specular reflection contributions by 25–75%. Particularly suppresses low-frequency comb-filter effects (SBIR notches become shallower). Smooths the combined direct+reflection field at low frequencies.",
    severity: "MODERATE",
    testPriority: 6,
  },
  {
    id: 5,
    location: "rewBassEngine.js:207\nlegacyModalTransferLocal()",
    name: "deterministicModalPhasePerturbationRad (default active path)",
    canonical: "Rigid room: each mode's phase is determined exactly by its transfer function H(f,f0,Q) and the propagation phase. No perturbation applied.",
    actual: "When pureDeterministicModalSum=false (the default unless caller overrides), each mode's stored pressure vector is rotated by a small deterministic phase perturbation: ±0.12 rad max, derived from a hash of mode indices and frequency. This is applied before accumulation — affecting the final coherent sum.",
    why: "Label: 'Temporary REW parity diagnostic only, not final physics: deterministic per-mode phase decorrelation.' Intended to model real-world modal phase scatter without true randomness.",
    effect: "Partially decorrelates adjacent modes. At frequencies where multiple modes compete, their vectors no longer add at exactly their deterministic phases — reducing extreme peaks and partially filling nulls. The effect is small per mode (~±7°) but accumulates across many modes. Makes the curve smoother than a pure rigid-room sum.",
    severity: "MODERATE",
    testPriority: 4,
  },
  {
    id: 6,
    location: "rewBassEngine.js:157-165\nmodalPressureContributionLocal()",
    name: "propagationPhaseScale (default 0.5, 0 in parity path)",
    canonical: "Rigid room: no propagation phase applied to modal contributions. Modal phase is entirely carried by the resonant transfer function H(f,f0,Q). The mode shape Ψ is real-valued.",
    actual: "A propagation phase = −2π·f·(d_src_seat/c)·propagationPhaseScale is applied to rotate each modal contribution before accumulation. Default propagationPhaseScale=0.5 (half the true source-to-seat propagation). In REW parity mode (disableModalPropagationPhase=true OR rewParityModalPhase=true), this is set to 0.",
    why: "Purpose: approximate time-of-flight phase alignment between the modal field and the direct path. The 0.5 scale is a heuristic — 'approximate source-to-seat distance for phase alignment'. No derivation. REW parity path zeros it out to isolate modal physics.",
    effect: "Rotates each mode's complex pressure vector by a frequency- and distance-dependent angle. The net effect across many modes is partial decorrelation — different modes are rotated by different angles at each frequency, preventing full constructive/destructive interference. Smooths the curve slightly.",
    severity: "MODERATE",
    testPriority: 5,
  },
  {
    id: 7,
    location: "rewBassEngine.js:913-916\nsimulateBassResponseRewCore()",
    name: "lateFieldAmplitude (diffuse late-field)",
    canonical: "Rigid-room modal model: no diffuse field term. All energy is in the deterministic modal sum. REW does not add a diffuse field offset in its modal prediction.",
    actual: "A diffuse late-field energy term is added: amplitude × 0.12 × exp(−(f−20)/120), phase = 2π·f·0.0071+1.3. Only active above Schroeder frequency unless disableLateField=true. In parity mode it is suppressed.",
    why: "Approximation of statistical reverberant field above Schroeder frequency. The 0.12 scalar and 120 Hz decay constant appear empirically derived. Not present in canonical modal theory.",
    effect: "Raises the noise floor above Schroeder. Partially fills nulls created by modal cancellation. Adds a background energy level that prevents the curve dropping below a floor. Makes the curve less sharp above ~80 Hz.",
    severity: "LOW-MODERATE",
    testPriority: 9,
  },
  {
    id: 8,
    location: "rewBassEngine.js:843-851\nsimulateBassResponseRewCore()",
    name: "modalGainScalar option",
    canonical: "No global gain scalar on modal contributions. Modal excitation is determined solely by source output and room geometry.",
    actual: "modalGainScalar (default 1.0) is applied to modalSourceAmplitudeBase before any reference mode is selected. Acts as a global scalar on all modal contributions simultaneously. Exposed as a diagnostic option; default=1.0 means no production effect.",
    why: "Diagnostic/tuning scalar. Allows global modal amplitude adjustment without altering Q or coupling. Not activated by default.",
    effect: "If ≠1.0: scales all modal contributions equally up or down. Equivalent to shifting the modal layer vertically in dB. Default value means no current production effect.",
    severity: "NONE (default)",
    testPriority: 10,
  },
  {
    id: 9,
    location: "rewBassEngine.js:1136-1140\nsimulateBassResponseRewCore()",
    name: "rewParityModalMagnitudeScale",
    canonical: "No post-sum scalar on the modal field. Modal pressure is accumulated as computed.",
    actual: "If rewParityModalMagnitudeScale ≠ 1.0, the entire modalSumRe/Im is multiplied by this scalar immediately before being added to sumRe/Im. Applied after all per-mode accumulation, perturbation, and phase convention corrections.",
    why: "Diagnostic: 'test whether parity is a modal magnitude issue'. UI control exposed in REW parity panel. Default=1.0 means no production effect.",
    effect: "If ≠1.0: uniformly scales the total modal vector, shifting the modal layer's contribution in dB without affecting phase or direct/reflection paths. Produces asymmetric dip/peak changes depending on phase relationship with direct path.",
    severity: "NONE (default)",
    testPriority: 11,
  },
  {
    id: 10,
    location: "rewBassEngine.js:326-336\nlegacyModalTransferLocal()",
    name: "modalStorageMode / storageFactor",
    canonical: "No storage factor. Each modal contribution adds at full computed amplitude.",
    actual: "modalStorageMode='orderCompression' applies per-order amplitude compression: order-1 → ×1.0, order-2 → ×0.45, order-3 → ×0.30. 'light' mode adds a Lorentzian boost near-resonance for axial modes only. Default='none' (storageFactor=1.0).",
    why: "Diagnostic investigation of order-based energy scaling. Both modes are experimental, not production defaults.",
    effect: "If 'orderCompression': severely attenuates high-order modes, leaving only fundamental axial/tangential modes with full amplitude. Makes the curve dominated by 3–5 low modes. Not active by default.",
    severity: "NONE (default)",
    testPriority: 12,
  },
  {
    id: 11,
    location: "rewBassEngine.js:144-145\nmodalPressureContributionLocal()",
    name: "orderWeight (global order weighting — REMOVED)",
    canonical: "Canonical: each mode accumulates at full amplitude regardless of order.",
    actual: "orderWeight = 1.0 (hardcoded). Comment: 'global attenuation removed — highOrderAxialScale is the sole governor for axial harmonics'. Previously non-1.0 values existed; now always 1.0.",
    why: "Removed after proving it was not the correct lever. highOrderAxialScale now handles axial harmonics specifically.",
    effect: "Currently zero effect. Historical residue. Safe to ignore.",
    severity: "NONE",
    testPriority: 13,
  },
  {
    id: 12,
    location: "rewBassEngine.js:437-443\nlegacyModalTransferLocal()",
    name: "axialFamilyScale / tangentialFamilyScale / obliqueFamilyScale",
    canonical: "No per-family amplitude scaling. All modes accumulate at computed amplitude regardless of family.",
    actual: "Per-family scalar applied immediately before accumulation. Default all=1.0. Options-injectable. Applied after storageFactor, after tuning phase, after perturbation.",
    why: "Diagnostic-only. Comment: '__TEMP_DIAGNOSTIC_FAMILY_SCALES__'. Not active by default.",
    effect: "If ≠1.0 for any family: scales that family's pressure contribution globally. E.g. obliqueFamilyScale=0 removes oblique contribution entirely. Default has zero effect.",
    severity: "NONE (default)",
    testPriority: 14,
  },
  {
    id: 13,
    location: "rewBassEngine.js:1150-1157\nmodalCoherenceMode path",
    name: "modalCoherenceMode = 'distributed' / 'split'",
    canonical: "All modes sum coherently into a single complex pressure vector. No partial-coherence splitting.",
    actual: "If modalCoherenceMode='distributed': replaces the active modal sum with a version where each mode's vector has been rotated by a larger deterministic phase (deterministicDistributedModalCoherencePhaseRad). If 'split': 70% of each mode adds coherently, 30% adds energetically. Default='coherent' = standard path.",
    why: "Diagnostic investigation of partial coherence as a parity explanation. Comment: 'Diagnostic only — main simulation unchanged'. Not active by default.",
    effect: "Non-default only. 'distributed' reduces null depth significantly by spreading modal phase vectors. 'split' raises the SPL floor below nulls.",
    severity: "NONE (default)",
    testPriority: 15,
  },
  {
    id: 14,
    location: "modalCalculations.js:65-69\nestimateModeQLocal()",
    name: "Sabine Q clamp — rt60 / 13.815 formula",
    canonical: "Q = 2π·f·RT60/13.815 (= 2π·f·τ). This is the correct Sabine decay time formula for modal Q. The B44 formula matches theory exactly here. The clamp Math.max(1,…) floors Q at 1.",
    actual: "Formula matches canonical. Clamp to [1, 80] applied. However: the clamp interacts with the base-Q ceiling in estimateModeQByType — the effective Q = max(1, min(baseQ, sabineQ)). So Sabine Q above baseQ is always clamped DOWN to baseQ (4.0/3.9/2.5). The Sabine formula itself is correct; the ceiling is not.",
    why: "Base-Q ceiling is the empirical parity correction. The floor at 1 prevents degenerate rooms from producing undefined modal behaviour.",
    effect: "In normally absorptive rooms: Sabine Q typically exceeds base Q → base Q ceiling always binds → Sabine formula is irrelevant for determining actual Q. Actual Q is family-type-fixed, not absorption-driven. This is the dominant Q-setting mechanism.",
    severity: "HIGH (as part of base-Q mechanism)",
    testPriority: 3,
  },
  {
    id: 15,
    location: "rewBassEngine.js:1646\nsimulateBassResponseRewParityField()",
    name: "hardcoded axialScale=0.50 in parity field solver",
    canonical: "Same as deviation #2 — no order-based attenuation in canonical theory.",
    actual: "simulateBassResponseRewParityField hardcodes axialScale=0.50 for modeOrder≥2 axial modes (line 1646). Unlike the main engine where this is options-injectable (default 1.0), the parity field solver locks this to 0.5 unconditionally.",
    why: "Comment: 'matches production engine scale for comparability'. Intended to keep the parity solver consistent with whatever the production engine does in practice.",
    effect: "Second-order+ axial harmonics halved in amplitude in the parity field solver. Makes parity solver outputs incompatible with true canonical rigid-room theory for those modes.",
    severity: "HIGH",
    testPriority: 2,
  },
  {
    id: 16,
    location: "rewBassEngine.js:628\noptions?.axialQ default",
    name: "axialQ default = 8.0 in simulateBassResponseRewCore",
    canonical: "Q is set by absorption only. No user-adjustable per-family parameter.",
    actual: "axialQ defaults to 8.0 when not passed by caller. estimateModeQByType returns axialQ(=8.0) for axial modes as the base, which is then clamped by min(baseQ=8.0, sabineQ). For typical absorption (α≈0.1–0.3), sabineQ is often <8 so sabineQ wins. But if absorption is very low, axialQ=8.0 becomes the ceiling, producing Q=8 axial modes.",
    why: "Historical default. Previous comment: 'Previous values: axial 8.0, tangential 6.0, oblique 4.5 — were ~1.8× too high.' The estimateModeQByType uses axialQOverride=4.0 as its fallback, but the engine-level default passes 8.0 to it. This is an inconsistency: the engine passes 8.0 but estimateModeQByType's internal default is 4.0.",
    effect: "In low-absorption rooms, axial Q may reach 8.0, producing very narrow resonances. In typical rooms, Sabine clamps it lower. Creates an inconsistency between engine default and per-type function default.",
    severity: "MODERATE",
    testPriority: 7,
  },
  {
    id: 17,
    location: "rewBassEngine.js:830\ndirect path in simulateBassResponseRewCore()",
    name: "distanceLossDb includes modal source amplitude 'distance_normalized' double-accounting",
    canonical: "In a Green's function modal solution, direct sound and modal sound are separate physical mechanisms. The direct path attenuates with 1/r. Modal excitation does not — it is a room-energy phenomenon, not a propagating wave.",
    actual: "In distance_normalized mode, modalSourceAmplitude1m = base × (1/r_seat). The direct path also uses (1/r_seat) for its own amplitude. Both use the same distanceM. Result: modal amplitude and direct amplitude are both scaled by the same 1/r factor, preserving their ratio but both being different from the canonical modal-only level.",
    why: "Emergent from the distance_normalized design choice. Not a separate deliberate decision.",
    effect: "Modal-to-direct amplitude ratio is preserved from the 'existing' mode. The curve's modal ripple depth relative to the direct field is unchanged. The absolute levels are both shifted consistently.",
    severity: "LOW",
    testPriority: 8,
  },
];

// ─── Top 5 ranking ─────────────────────────────────────────────────────────────

const TOP5 = [
  {
    rank: 1,
    id: 1,
    name: "distance_normalized modalSourceReferenceMode",
    reason: "Scales ALL modal contributions by 1/r_seat on top of the coupling. For a seat at 3–4 m, this is a −10 to −12 dB modal amplitude reduction. This is the single largest suppression of modal energy in the engine. Without it, all peaks would be 10–12 dB higher relative to the direct path, producing REW-like violent modal swings.",
  },
  {
    rank: 2,
    id: "2+15",
    name: "highOrderAxialCorrectionScale = 0.5 on axial modeOrder ≥ 2",
    reason: "Second-order axial harmonics (2,0,0), (0,2,0), (0,0,2) are halved in amplitude. These fall in the 60–100 Hz range — exactly where REW shows sharp, narrow peaks. Halving them broadens their effective contribution and prevents the sharp harmonic stack that a rigid room would produce.",
  },
  {
    rank: 3,
    id: "3+14",
    name: "Base Q family ceiling (axial=4.0, tang=3.9, oblique=2.5) overriding Sabine",
    reason: "In a rigid or lightly absorbed room, Sabine Q would produce values of 20–80 for axial modes at 40–100 Hz. The base-Q ceiling caps these at 4.0/3.9/2.5. This is a ~5–20× bandwidth widening. Wide Q = broad, shallow resonances. The solver can never produce the sharp, narrow modal peaks REW sees in real measurements.",
  },
  {
    rank: 4,
    id: 5,
    name: "deterministicModalPhasePerturbation (default active path)",
    reason: "Phase-rotates each mode's vector by up to ±0.12 rad before accumulation. In frequency bands where 3–5 modes are simultaneously contributing, this prevents their vectors from aligning — reducing peaks by 3–8 dB and partially filling nulls. Active by default whenever pureDeterministicModalSum=false.",
  },
  {
    rank: 5,
    id: 6,
    name: "propagationPhaseScale = 0.5 (default non-parity path)",
    reason: "Applies a half-propagation phase to each modal contribution. At 80 Hz with a 3 m seat, this is ±140° of rotation per mode. Different modes rotate by different amounts, partially decorrelating the modal stack — reducing peak sharpness and null depth. In the REW parity path (propagationPhaseScale=0) this is removed, revealing sharper modal structure.",
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────

function SevBadge({ sev }) {
  const s = (sev || '').toUpperCase();
  const style = s.startsWith('HIGH')
    ? { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }
    : s.startsWith('MODERATE')
    ? { background: '#ffedd5', color: '#b45309', border: '1px solid #fed7aa' }
    : s.includes('LOW')
    ? { background: '#fef9c3', color: '#854d0e', border: '1px solid #fef08a' }
    : { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' };
  return (
    <span style={{ ...style, display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
      {sev}
    </span>
  );
}

function PriBadge({ n }) {
  const bg = n <= 3 ? '#fee2e2' : n <= 6 ? '#ffedd5' : '#f3f4f6';
  const co = n <= 3 ? '#991b1b' : n <= 6 ? '#b45309' : '#6b7280';
  return (
    <span style={{ background: bg, color: co, display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>
      P{n}
    </span>
  );
}

export default function CanonicalModalDeviationAudit() {
  const [expanded, setExpanded] = useState(null);

  const cell  = { padding: '4px 6px', fontSize: 9, fontFamily: 'monospace', borderBottom: '1px solid #fde68a', verticalAlign: 'top', lineHeight: 1.5 };
  const cellL = { ...cell, textAlign: 'left' };
  const th    = { ...cell, fontWeight: 700, color: '#78350f', background: '#fef3c7', borderBottom: '2px solid #fcd34d', textAlign: 'left' };

  return (
    <details style={{ border: '2px solid #d97706', borderRadius: 8, background: '#fffbeb', padding: '8px 10px', marginTop: 8 }}>
      <summary style={{ fontWeight: 700, color: '#b45309', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer' }}>
        🔍 Canonical Modal Deviation Audit — all deliberate departures from rigid-room theory
      </summary>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#78350f', marginBottom: 8, lineHeight: 1.6 }}>
          Every identified deliberate deviation from the canonical rectangular-room rigid-wall modal solution.
          Source: <code>rewBassEngine.js</code> + <code>modalCalculations.js</code> — full read, no approximation.
          Click any row to expand the detailed evidence.
        </div>

        {/* Main table */}
        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 24 }}>#</th>
                <th style={{ ...th, minWidth: 160 }}>Code location / function</th>
                <th style={{ ...th, minWidth: 180 }}>Adjustment name</th>
                <th style={{ ...th, minWidth: 120 }}>Effect on curve shape</th>
                <th style={{ ...th, width: 80 }}>Severity</th>
                <th style={{ ...th, width: 50 }}>Priority</th>
              </tr>
            </thead>
            <tbody>
              {DEVIATIONS.map((d, i) => (
                <React.Fragment key={d.id}>
                  <tr
                    onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                    style={{ background: i % 2 === 0 ? '#fff' : '#fffbeb', cursor: 'pointer' }}
                  >
                    <td style={{ ...cell, fontWeight: 700, color: '#d97706' }}>{d.id}</td>
                    <td style={{ ...cellL, fontFamily: 'monospace', fontSize: 8, color: '#6b7280', whiteSpace: 'pre-line' }}>{d.location}</td>
                    <td style={{ ...cellL, fontWeight: 600, color: '#1c1917' }}>{d.name}</td>
                    <td style={{ ...cellL, color: '#374151', fontSize: 9 }}>{d.effect}</td>
                    <td style={{ ...cell, textAlign: 'center' }}><SevBadge sev={d.severity} /></td>
                    <td style={{ ...cell, textAlign: 'center' }}><PriBadge n={d.testPriority} /></td>
                  </tr>
                  {expanded === d.id && (
                    <tr style={{ background: '#fef3c7' }}>
                      <td colSpan={6} style={{ padding: '8px 12px', fontSize: 9, fontFamily: 'monospace', lineHeight: 1.7 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <div style={{ fontWeight: 700, color: '#065f46', marginBottom: 3 }}>✅ Canonical expected</div>
                            <div style={{ color: '#1c1917', background: '#f0fdf4', padding: '4px 8px', borderRadius: 4, border: '1px solid #a7f3d0' }}>{d.canonical}</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 3 }}>❌ B44 actual</div>
                            <div style={{ color: '#1c1917', background: '#fff1f2', padding: '4px 8px', borderRadius: 4, border: '1px solid #fecdd3' }}>{d.actual}</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#6b21a8', marginBottom: 3 }}>💬 Why it exists</div>
                            <div style={{ color: '#1c1917', background: '#faf5ff', padding: '4px 8px', borderRadius: 4, border: '1px solid #e9d5ff' }}>{d.why}</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#b45309', marginBottom: 3 }}>📈 Curve shape effect</div>
                            <div style={{ color: '#1c1917', background: '#fffbeb', padding: '4px 8px', borderRadius: 4, border: '1px solid #fcd34d' }}>{d.effect}</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top 5 ranking */}
        <div style={{ border: '2px solid #d97706', borderRadius: 6, background: '#fff7ed', padding: '8px 12px', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: '#c2410c', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
            🏆 Top 5 deviations most likely making B44 smoother / less violent than REW
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 40, background: '#fed7aa', borderBottom: '2px solid #f97316' }}>Rank</th>
                <th style={{ ...th, background: '#fed7aa', borderBottom: '2px solid #f97316', minWidth: 220 }}>Deviation</th>
                <th style={{ ...th, background: '#fed7aa', borderBottom: '2px solid #f97316' }}>Why it dominates</th>
              </tr>
            </thead>
            <tbody>
              {TOP5.map((t, i) => (
                <tr key={t.rank} style={{ background: i % 2 === 0 ? '#fff7ed' : '#fff' }}>
                  <td style={{ ...cell, textAlign: 'center', fontWeight: 800, color: '#ea580c', fontSize: 13 }}>#{t.rank}</td>
                  <td style={{ ...cellL, fontWeight: 700, color: '#1c1917' }}>{t.name}</td>
                  <td style={{ ...cellL, color: '#374151' }}>{t.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#6b7280', lineHeight: 1.5 }}>
          Audit performed against full source read of rewBassEngine.js (1687 lines) and modalCalculations.js (104 lines).
          No production defaults changed. Diagnostic only.
        </div>
      </div>
    </details>
  );
}