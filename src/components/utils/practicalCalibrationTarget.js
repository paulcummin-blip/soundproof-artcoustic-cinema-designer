// practicalCalibrationTarget.js
// ----------------------------
// Practical Calibration Target T(f) for canonical P19 assessment.
//
// Sound Proof separates two explicit target identities:
//   H(f) — Ideal Design House Target (the canonical Artcoustic house curve at
//          the selected P14 operating level). Authority for P14 selection and
//          P18 achieved extension. NEVER weakened for P18.
//   T(f) — Practical Calibration Target. A smooth capability-aware target used
//          for predicted calibration/EQ and P19 comparison. Follows H(f) where
//          the ideal is physically achievable, then rolls smoothly with the
//          broad physical LF capability of the selected subwoofer system where
//          the ideal target is not achievable.
//
// Critical principle: T(f) is derived from SMOOTH system capability only,
// determined BEFORE assessing response errors. It must NOT follow:
//   - narrow modal peaks / nulls
//   - seat-specific response structure
//   - post-EQ irregularities that P19 is supposed to grade
// T(f) is never min(H, actualResponse) — that would be self-fulfilling.

import { applyBassSmoothing } from "@/components/room/bass/bassGraphSmoothing";

const finite = (v) => v !== null && v !== "" && Number.isFinite(Number(v));

function normalizeCurve(curve) {
  return (Array.isArray(curve) ? curve : [])
    .filter((p) => finite(p?.frequency) && finite(p?.spl))
    .map((p) => ({ frequency: Number(p.frequency), spl: Number(p.spl) }))
    .sort((a, b) => a.frequency - b.frequency);
}

function interpolateCurveValue(curve, frequency) {
  if (!Array.isArray(curve) || !curve.length || !Number.isFinite(frequency)) return null;
  if (frequency <= curve[0].frequency) return curve[0].spl;
  if (frequency >= curve.at(-1).frequency) return curve.at(-1).spl;
  for (let i = 0; i < curve.length - 1; i++) {
    if (frequency >= curve[i].frequency && frequency <= curve[i + 1].frequency) {
      const span = curve[i + 1].frequency - curve[i].frequency;
      if (span === 0) return curve[i].spl;
      const ratio = (frequency - curve[i].frequency) / span;
      return curve[i].spl + (curve[i + 1].spl - curve[i].spl) * ratio;
    }
  }
  return null;
}

// Softplus blend scale (dB). Controls the width of the smooth crossfade between
// the ideal region (T = H) and the capability-limited region (T → C). At the
// crossing point the target is naturally ~scale*ln(2) dB below the ideal,
// providing a small credible-calibration headroom without an arbitrary margin.
const DEFAULT_BLEND_SCALE_DB = 2;

function softplus(x, scale) {
  if (x > 20 * scale) return x;
  if (x < -20 * scale) return 0;
  return scale * Math.log1p(Math.exp(x / scale));
}

// Build a smooth capability envelope C(f) from the raw maximum SPL curve.
// Uses 1-octave power-domain smoothing to remove modal structure and extract
// the broad physical LF capability trend. The raw max SPL curve already carries
// the existing safety margin (applyMaximumSplSafetyMargin); no new margin is
// introduced here.
export function buildSmoothCapabilityEnvelope(maximumSplCurve) {
  const normalized = normalizeCurve(maximumSplCurve);
  if (normalized.length < 3) return normalized;
  return applyBassSmoothing(normalized, "octave").filter((p) => finite(p.spl));
}

// Build the Practical Calibration Target T(f).
//
//   T(f) = H(f) - softplus(H(f) - C(f) - requiredHeadroomDb, blendScaleDb)
//
// Where H(f) <= C(f) - headroom (ideal achievable): softplus ≈ 0, T = H.
// Where H(f) > C(f) (capability limited): softplus ≈ excess, T → C.
// The softplus provides a smooth crossfade with no hard kink, and the 1-octave
// smoothing of C(f) ensures narrow modal structure cannot enter the target.
//
// requiredHeadroomDb defaults to 0 because the existing safety margin is already
// applied to the capability curve upstream (applyMaximumSplSafetyMargin).
export function buildPracticalCalibrationTarget({
  idealTargetCurve,
  capabilityEnvelope,
  requiredHeadroomDb = 0,
  blendScaleDb = DEFAULT_BLEND_SCALE_DB,
}) {
  const ideal = normalizeCurve(idealTargetCurve);
  const capability = normalizeCurve(capabilityEnvelope);
  if (!ideal.length) return [];
  if (!capability.length) return ideal.map((p) => ({ ...p }));

  return ideal.map((point) => {
    const capSpl = interpolateCurveValue(capability, point.frequency);
    if (!finite(capSpl)) return { ...point };
    const excess = point.spl - capSpl - requiredHeadroomDb;
    const reduction = softplus(excess, blendScaleDb);
    return { frequency: point.frequency, spl: point.spl - reduction };
  });
}

// ── P18-intent-aware LF target overlay ──
//
// The standard Practical Calibration Target A(f) continues the raised house
// curve unchanged through the P18 extension region, creating an internal
// contradiction: an otherwise legitimate extension boundary becomes an
// automatic P19 FAIL because the target at Fd is ~8 dB above the valid -3 dB
// boundary.
//
// The LF overlay resolves this by constructing a tolerance-centred target at
// the selected P18 design frequency (Fd):
//
//   A(f) = existing capability-aware Practical Calibration Target
//   Fd   = selected P18 design frequency for the current target combination
//   R    = predetermined P18 reference (median of ideal target over 60–200 Hz)
//   C    = R - 3 dB (the valid -3 dB boundary level)
//   M    = (C + A(Fd)) / 2 (midpoint: tolerance between boundary and target)
//
// Target shape:
//   At Fd:       Target = M
//   Fd → Fd×√2:  smoothstep transition from M back to A(f) (half-octave)
//   Above Fd×√2: Target = A(f) unchanged (house curve preserved)
//   Below Fd:    roll down from M at 6 dB/octave
//   Never:       new target > A(f) (never exceed existing target)
//
// This target is PREDETERMINED — it is constructed from the target identity
// (selected level + basis) before seeing the achieved response. It does NOT
// move Fd because a smaller subwoofer rolls off early. P18 honestly reports
// the shortfall; P19 honestly reports the deviation against this fixed target.
//
// Both EQ fitting and P19 assessment use the SAME target, preventing authority
// mismatch.

const P18_REFERENCE_BAND_HZ = [60, 200];

export function computeP18ReferenceDb(idealTargetCurve) {
  const ideal = normalizeCurve(idealTargetCurve);
  if (!ideal.length) return null;
  const bandPoints = ideal.filter((p) => p.frequency >= P18_REFERENCE_BAND_HZ[0] && p.frequency <= P18_REFERENCE_BAND_HZ[1]);
  if (!bandPoints.length) return null;
  const sorted = bandPoints.map((p) => p.spl).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// smoothstep: 0 at t=0, 1 at t=1, smooth S-curve between.
function smoothstep(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Apply the P18-intent-aware LF overlay to an existing Practical Calibration
 * Target A(f). Returns a new target curve that is bit-identical to A(f) above
 * Fd × √2 and modified below.
 *
 * @param {Array} practicalTargetA - The existing capability-aware target A(f)
 * @param {number} p18DesignHz - Fd, the P18 design frequency for the current target combination
 * @param {number|null} p18ReferenceDb - R, the predetermined P18 reference level (median of ideal target over 60–200 Hz). If null, derived from practicalTargetA.
 * @returns {Array} New target curve with the LF overlay applied
 */
export function applyP18IntentAwareLfOverlay({ practicalTargetA, p18DesignHz, p18ReferenceDb = null }) {
  const target = normalizeCurve(practicalTargetA);
  if (!target.length || !Number.isFinite(p18DesignHz) || p18DesignHz <= 0) return target;

  const fd = Number(p18DesignHz);
  const kneeHz = fd * Math.SQRT2; // half-octave transition end

  // R = predetermined P18 reference. Derive from the target curve itself
  // (which is the ideal house target shaped by capability) over 60–200 Hz.
  // This is predetermined — it does NOT use the achieved response.
  const rDb = Number.isFinite(p18ReferenceDb) ? Number(p18ReferenceDb) : computeP18ReferenceDb(target);
  if (!Number.isFinite(rDb)) return target;

  // C = R - 3 dB (the valid -3 dB boundary level)
  const cDb = rDb - 3;

  // A(Fd) = existing practical target at Fd
  const aFd = interpolateCurveValue(target, fd);
  if (!Number.isFinite(aFd)) return target;

  // M = (C + A(Fd)) / 2 — tolerance-centred midpoint
  const mDb = (cDb + aFd) / 2;

  // 6 dB/octave rolloff below Fd: dB per octave = -6 * log2(f / Fd)
  // At f = Fd/2, reduction = 6 dB; at f = Fd/4, reduction = 12 dB, etc.
  return target.map((point) => {
    const f = point.frequency;
    const aSpl = point.spl;

    if (f >= kneeHz) {
      // Above the knee: target = A(f) unchanged
      return { frequency: f, spl: aSpl };
    }

    if (f >= fd) {
      // Fd → Fd×√2: smoothstep transition from M (at Fd) to A(f) (at knee)
      const t = (f - fd) / (kneeHz - fd);
      const blend = smoothstep(t);
      const overlaySpl = mDb + (aSpl - mDb) * blend;
      // Never exceed A(f)
      return { frequency: f, spl: Math.min(overlaySpl, aSpl) };
    }

    // Below Fd: roll down from M at 6 dB/octave
    const octavesBelow = Math.log2(fd / f);
    const rolloffDb = 6 * octavesBelow;
    const overlaySpl = mDb - rolloffDb;
    // Never exceed A(f)
    return { frequency: f, spl: Math.min(overlaySpl, aSpl) };
  });
}

// Convenience: build both the smooth envelope and the practical target from the
// raw max SPL curve and the ideal target. Returns { capabilityEnvelope,
// practicalCalibrationTarget } so callers can persist both identities.
//
// When p18DesignHz (Fd) is provided, the P18-intent-aware LF overlay is applied
// to the practical calibration target. This makes the target shape deterministic
// for the selected target combination (Minimum/Recommended × L1–L4).
export function buildPracticalCalibrationTargetFromCapability({
  idealTargetCurve,
  maximumSplCurve,
  requiredHeadroomDb = 0,
  blendScaleDb = DEFAULT_BLEND_SCALE_DB,
  p18DesignHz = null,
  p18ReferenceDb = null,
}) {
  const capabilityEnvelope = buildSmoothCapabilityEnvelope(maximumSplCurve);
  const baseTarget = buildPracticalCalibrationTarget({
    idealTargetCurve,
    capabilityEnvelope,
    requiredHeadroomDb,
    blendScaleDb,
  });
  const practicalCalibrationTarget = (Number.isFinite(p18DesignHz) && p18DesignHz > 0)
    ? applyP18IntentAwareLfOverlay({ practicalTargetA: baseTarget, p18DesignHz, p18ReferenceDb })
    : baseTarget;
  return { capabilityEnvelope, practicalCalibrationTarget };
}