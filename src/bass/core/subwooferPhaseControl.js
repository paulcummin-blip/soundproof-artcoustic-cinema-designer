// Physical subwoofer phase-control model.
//
// A constant non-0/180 degree rotation across frequency is non-causal and is
// not a credible processor control. Sound Proof therefore models the proposed
// phase setting as a unity-magnitude first-order all-pass section. The stored
// value is the requested lag at the 80 Hz reference frequency.
//
// H(s) = (a - s) / (a + s)
// phase(f) = -2 atan(2*pi*f / a)
// a is selected so phase(80 Hz) equals -phaseControlDeg.
//
// Polarity remains a separate 0/180-degree control. Searching either source
// group over 0..175 degrees therefore covers both relative phase directions
// without duplicating the 180-degree polarity state.

export const PHASE_CONTROL_REFERENCE_HZ = 80;
export const PHASE_CONTROL_MIN_DEG = 0;
export const PHASE_CONTROL_MAX_DEG = 175;
export const PHASE_CONTROL_STEP_DEG = 5;

export function normalisePhaseControlDeg(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(PHASE_CONTROL_MIN_DEG, Math.min(PHASE_CONTROL_MAX_DEG, numeric));
}

export function allPassPhaseRadians(
  frequencyHz,
  phaseControlDeg,
  referenceHz = PHASE_CONTROL_REFERENCE_HZ,
) {
  const frequency = Number(frequencyHz);
  const reference = Number(referenceHz);
  const phaseDeg = normalisePhaseControlDeg(phaseControlDeg);
  if (!(frequency > 0) || !(reference > 0) || phaseDeg <= 0) return 0;

  const phaseAtReferenceRad = phaseDeg * Math.PI / 180;
  const poleRadPerSecond = (2 * Math.PI * reference) / Math.tan(phaseAtReferenceRad / 2);
  if (!(poleRadPerSecond > 0) || !Number.isFinite(poleRadPerSecond)) return -Math.PI;

  return -2 * Math.atan((2 * Math.PI * frequency) / poleRadPerSecond);
}

export function tuningPhaseRadians(frequencyHz, tuning = {}) {
  const delayMs = Number(tuning?.delayMs);
  const delayPhase = Number.isFinite(delayMs)
    ? -2 * Math.PI * Number(frequencyHz) * (delayMs / 1000)
    : 0;
  const polarityPhase = tuning?.polarity < 0 || Number(tuning?.polarity) === 180
    ? Math.PI
    : 0;
  const phaseControl = allPassPhaseRadians(
    frequencyHz,
    tuning?.phaseControlDeg ?? tuning?.phaseAdjust,
  );
  return delayPhase + polarityPhase + phaseControl;
}

export function allPassMagnitude(frequencyHz, phaseControlDeg) {
  const phase = allPassPhaseRadians(frequencyHz, phaseControlDeg);
  return Math.hypot(Math.cos(phase), Math.sin(phase));
}
