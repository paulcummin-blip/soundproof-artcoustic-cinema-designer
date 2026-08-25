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

// Convenience: build both the smooth envelope and the practical target from the
// raw max SPL curve and the ideal target. Returns { capabilityEnvelope,
// practicalCalibrationTarget } so callers can persist both identities.
export function buildPracticalCalibrationTargetFromCapability({
  idealTargetCurve,
  maximumSplCurve,
  requiredHeadroomDb = 0,
  blendScaleDb = DEFAULT_BLEND_SCALE_DB,
}) {
  const capabilityEnvelope = buildSmoothCapabilityEnvelope(maximumSplCurve);
  const practicalCalibrationTarget = buildPracticalCalibrationTarget({
    idealTargetCurve,
    capabilityEnvelope,
    requiredHeadroomDb,
    blendScaleDb,
  });
  return { capabilityEnvelope, practicalCalibrationTarget };
}