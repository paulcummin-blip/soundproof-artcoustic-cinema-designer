// cancellationNullAuthority.js
// ---------------------------------------------------------------------------
// Physics-based cancellation null verification.
//
// The 6 Hz / 10 dB candidate detector (houseCurveFitProtection.js) identifies
// regions worth investigating. This module verifies whether a candidate is a
// genuine destructive cancellation (using complex acoustic evidence from the
// authoritative engine) or an ordinary correctable deficit.
//
// Only verified cancellation regions receive the protected-null behaviour
// (positive EQ correction = 0 dB). Unverified candidates remain fully
// correctable within headroom/capability limits.
//
// This module is PURE: no React, no side effects, no engine modification.
// It consumes the already-captured perSourceRspComplexTransfers from the
// authoritative bass response engine.
//
// MULTI-SUB (2+ sources):
//   coherentEfficiency(f) = |Σ p_k(f)| / Σ |p_k(f)|  ∈ [0, 1]
//   0 = total destructive cancellation, 1 = fully constructive
//
//   A candidate is confirmed as cancellation when:
//     1. Constituent energy at centre is significant (sources produce meaningful
//        output — not just a level deficit)
//     2. Coherent efficiency at centre is poor (fields oppose)
//     3. Coherent efficiency at centre is substantially worse than shoulders
//
// SINGLE-SUB (1 source):
//   The per-source complex transfer phase rotates through a modal cancellation
//   node. A simple level deficit does not exhibit this phase signature.
//
//   A candidate is confirmed when the phase rotation from left shoulder through
//   centre to right shoulder exceeds a conservative threshold AND the flat-source
//   transfer magnitude collapses (confirming a room null, not product rolloff).
//
// SAFE FALLBACK:
//   If complex evidence is unavailable, incomplete, or ambiguous, the candidate
//   is NOT confirmed — it remains correctable within headroom. A false-positive
//   "uncorrectable null" is more damaging than allowing correction.
// ---------------------------------------------------------------------------

import { identifyProtectedNullRegions } from './houseCurveFitProtection';

// Re-export the candidate detector for callers that conceptually distinguish
// candidate detection from verified protection.
export { identifyProtectedNullRegions as identifyCandidateNullRegions };
export { isProtectedFrequency, isProtectedSmoothedFrequency, MAX_PROTECTED_NULL_WIDTH_HZ } from './houseCurveFitProtection';

// ── Cancellation verification thresholds ───────────────────────────────────
// Calibrated against synthetic validation cases (runCancellationNullValidation).
// These are conservative physical criteria for destructive interference.

// MULTI-SUB: coherent efficiency = |Σ p_k| / Σ |p_k|
const MULTI_SUB_COHERENT_EFFICIENCY_THRESHOLD = 0.4;  // centre < 0.4 (~8 dB cancellation loss)
const MULTI_SUB_RELATIVE_SHOULDER_RATIO = 0.5;        // centre must be < 50% of shoulder efficiency
const MULTI_SUB_CONSTITUENT_ENERGY_RATIO = 0.3;       // centre incoherent energy > 30% of shoulders

// SINGLE-SUB: phase rotation through the null
const SINGLE_SUB_PHASE_ROTATION_THRESHOLD_RAD = 2.0;  // ~115° (true null ≈ π ≈ 3.14 rad)
const SINGLE_SUB_MAGNITUDE_RATIO_THRESHOLD = 0.5;     // centre magnitude < 50% of shoulder average

const FREQUENCY_MATCH_TOLERANCE_HZ = 5.0;

// ── Helpers ────────────────────────────────────────────────────────────────

function findClosestComplexPoint(points, frequency) {
  if (!Array.isArray(points) || !points.length) return null;
  let closest = null;
  let minDelta = Infinity;
  for (const point of points) {
    if (!point || !Number.isFinite(point.frequency) || !Number.isFinite(point.re) || !Number.isFinite(point.im)) continue;
    const delta = Math.abs(point.frequency - frequency);
    if (delta < minDelta) {
      minDelta = delta;
      closest = point;
    }
  }
  return closest && minDelta <= FREQUENCY_MATCH_TOLERANCE_HZ ? closest : null;
}

function unwrapPhaseDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
}

// Collect per-source complex values at a given frequency.
// Returns { sources: [{re, im}], coherentSum: {re, im}, incoherentSum: number }
function collectComplexAtFrequency(transfers, frequency) {
  const sources = [];
  for (const transfer of transfers) {
    const point = findClosestComplexPoint(transfer?.points, frequency);
    if (!point) return null;
    sources.push({ re: point.re, im: point.im });
  }
  let sumRe = 0, sumIm = 0, incoherentSum = 0;
  for (const s of sources) {
    sumRe += s.re;
    sumIm += s.im;
    incoherentSum += Math.hypot(s.re, s.im);
  }
  return { sources, coherentSum: { re: sumRe, im: sumIm }, incoherentSum };
}

function computeCoherentEfficiency(data) {
  if (!data || data.incoherentSum <= 1e-10) return null;
  return Math.hypot(data.coherentSum.re, data.coherentSum.im) / data.incoherentSum;
}

// ── Multi-sub verification ──────────────────────────────────────────────────

function verifyMultiSubCancellation(transfers, centreFreq, leftFreq, rightFreq) {
  const centreData = collectComplexAtFrequency(transfers, centreFreq);
  const leftData = collectComplexAtFrequency(transfers, leftFreq);
  const rightData = collectComplexAtFrequency(transfers, rightFreq);

  if (!centreData || !leftData || !rightData) {
    return { isCancellation: false, reason: 'insufficient-complex-data' };
  }

  const centreEfficiency = computeCoherentEfficiency(centreData);
  const leftEfficiency = computeCoherentEfficiency(leftData);
  const rightEfficiency = computeCoherentEfficiency(rightData);

  if (centreEfficiency === null || leftEfficiency === null || rightEfficiency === null) {
    return { isCancellation: false, reason: 'efficiency-undefined' };
  }

  const shoulderEfficiencyAvg = (leftEfficiency + rightEfficiency) / 2;
  const centreConstituentEnergy = centreData.incoherentSum;
  const shoulderConstituentEnergy = (leftData.incoherentSum + rightData.incoherentSum) / 2;
  const constituentEnergyRatio = shoulderConstituentEnergy > 0
    ? centreConstituentEnergy / shoulderConstituentEnergy
    : 0;

  const hasSignificantConstituentEnergy = constituentEnergyRatio >= MULTI_SUB_CONSTITUENT_ENERGY_RATIO;
  const centreHasPoorCoherence = centreEfficiency < MULTI_SUB_COHERENT_EFFICIENCY_THRESHOLD;
  const centreWorseThanShoulders = shoulderEfficiencyAvg > 0
    && centreEfficiency < MULTI_SUB_RELATIVE_SHOULDER_RATIO * shoulderEfficiencyAvg;

  const isCancellation = hasSignificantConstituentEnergy && centreHasPoorCoherence && centreWorseThanShoulders;

  return {
    isCancellation,
    reason: isCancellation ? 'multi-sub-destructive-cancellation' : 'no-cancellation-evidence',
    centreEfficiency,
    leftEfficiency,
    rightEfficiency,
    shoulderEfficiencyAvg,
    constituentEnergyRatio,
    centreConstituentEnergy,
    shoulderConstituentEnergy,
    thresholds: {
      coherentEfficiencyThreshold: MULTI_SUB_COHERENT_EFFICIENCY_THRESHOLD,
      relativeShoulderRatio: MULTI_SUB_RELATIVE_SHOULDER_RATIO,
      constituentEnergyRatio: MULTI_SUB_CONSTITUENT_ENERGY_RATIO,
    },
  };
}

// ── Single-sub verification ─────────────────────────────────────────────────

function verifySingleSubCancellation(transfer, centreFreq, leftFreq, rightFreq) {
  const points = transfer?.points || [];
  const centrePoint = findClosestComplexPoint(points, centreFreq);
  const leftPoint = findClosestComplexPoint(points, leftFreq);
  const rightPoint = findClosestComplexPoint(points, rightFreq);

  if (!centrePoint || !leftPoint || !rightPoint) {
    return { isCancellation: false, reason: 'insufficient-complex-data' };
  }

  const centrePhase = Math.atan2(centrePoint.im, centrePoint.re);
  const leftPhase = Math.atan2(leftPoint.im, leftPoint.re);
  const rightPhase = Math.atan2(rightPoint.im, rightPoint.re);

  const rotationLeftToCentre = Math.abs(unwrapPhaseDelta(leftPhase, centrePhase));
  const rotationCentreToRight = Math.abs(unwrapPhaseDelta(centrePhase, rightPhase));
  const totalRotation = rotationLeftToCentre + rotationCentreToRight;

  const centreMag = Math.hypot(centrePoint.re, centrePoint.im);
  const leftMag = Math.hypot(leftPoint.re, leftPoint.im);
  const rightMag = Math.hypot(rightPoint.re, rightPoint.im);
  const shoulderMagAvg = (leftMag + rightMag) / 2;
  const magnitudeRatio = shoulderMagAvg > 0 ? centreMag / shoulderMagAvg : 0;

  const isCancellation = totalRotation > SINGLE_SUB_PHASE_ROTATION_THRESHOLD_RAD
    && magnitudeRatio < SINGLE_SUB_MAGNITUDE_RATIO_THRESHOLD;

  return {
    isCancellation,
    reason: isCancellation ? 'single-sub-modal-cancellation' : 'no-cancellation-evidence',
    totalPhaseRotationRad: totalRotation,
    centrePhase,
    leftPhase,
    rightPhase,
    magnitudeRatio,
    centreMag,
    shoulderMagAvg,
    thresholds: {
      phaseRotationThresholdRad: SINGLE_SUB_PHASE_ROTATION_THRESHOLD_RAD,
      magnitudeRatioThreshold: SINGLE_SUB_MAGNITUDE_RATIO_THRESHOLD,
    },
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Verify candidate null regions against complex acoustic evidence.
 *
 * Only candidates with confirmed destructive-cancellation evidence are returned.
 * Unverified candidates are deliberately excluded — they remain correctable
 * within headroom/capability limits (safe fallback).
 *
 * @param {Array}  candidateRegions          - output of identifyProtectedNullRegions
 * @param {Array}  perSourceComplexTransfers - perSourceRspComplexTransfers from the authoritative engine
 * @returns {Array} verified cancellation regions (subset of candidates)
 */
export function verifyCancellationNullRegions(candidateRegions, perSourceComplexTransfers) {
  if (!Array.isArray(candidateRegions) || !candidateRegions.length) return [];
  const transfers = Array.isArray(perSourceComplexTransfers) ? perSourceComplexTransfers : [];
  if (!transfers.length) return []; // Safe fallback: no complex data → no protection

  const sourceCount = transfers.length;
  const verified = [];

  for (const candidate of candidateRegions) {
    const centreFreq = candidate.centreFrequencyHz;
    const leftFreq = candidate.leftShoulderFrequencyHz;
    const rightFreq = candidate.rightShoulderFrequencyHz;
    if (!Number.isFinite(centreFreq) || !Number.isFinite(leftFreq) || !Number.isFinite(rightFreq)) continue;

    let verification = null;

    if (sourceCount >= 2) {
      verification = verifyMultiSubCancellation(transfers, centreFreq, leftFreq, rightFreq);
    } else if (sourceCount === 1) {
      verification = verifySingleSubCancellation(transfers[0], centreFreq, leftFreq, rightFreq);
    }

    if (verification && verification.isCancellation) {
      verified.push({
        ...candidate,
        protected: true,
        cancellationVerified: true,
        verificationMethod: sourceCount >= 2
          ? 'multi-sub-coherent-efficiency'
          : 'single-sub-phase-rotation',
        verificationEvidence: verification,
      });
    }
    // Unverified candidates are NOT included — they remain correctable
  }

  return verified;
}

/**
 * Full candidate + verify chain. Returns only verified cancellation regions.
 *
 * Signature matches identifyProtectedNullRegions, plus perSourceComplexTransfers.
 */
export function identifyVerifiedProtectedNullRegions(
  curve, assessmentStartHz, assessmentEndHz, anchorDb, activeSubs, usableLfHz,
  requestedSystemOutputDb, canonicalTargetCurve, perSourceComplexTransfers,
) {
  const candidates = identifyProtectedNullRegions(
    curve, assessmentStartHz, assessmentEndHz, anchorDb, activeSubs, usableLfHz,
    requestedSystemOutputDb, canonicalTargetCurve,
  );
  return verifyCancellationNullRegions(candidates, perSourceComplexTransfers);
}

// ── Synthetic validation ───────────────────────────────────────────────────

export function runCancellationNullValidation() {
  const makeCandidate = (centreHz, leftHz, rightHz, depthDb) => ({
    centreFrequencyHz: centreHz,
    leftShoulderFrequencyHz: leftHz,
    rightShoulderFrequencyHz: rightHz,
    startHz: centreHz - 0.5,
    endHz: centreHz + 0.5,
    nullDepthDb: depthDb,
    protected: false,
  });

  // CASE A — Correctable dip (5 dB, no cancellation): two sources in phase, both weaker at centre
  const caseA = verifyCancellationNullRegions(
    [makeCandidate(50, 40, 60, -5)],
    [
      { sourceIndex: 0, points: [{ frequency: 40, re: 1.0, im: 0 }, { frequency: 50, re: 0.56, im: 0 }, { frequency: 60, re: 1.0, im: 0 }] },
      { sourceIndex: 1, points: [{ frequency: 40, re: 1.0, im: 0 }, { frequency: 50, re: 0.56, im: 0 }, { frequency: 60, re: 1.0, im: 0 }] },
    ],
  );

  // CASE B — Headroom-limited dip (8 dB, no cancellation): two sources in phase, both weaker
  const caseB = verifyCancellationNullRegions(
    [makeCandidate(50, 40, 60, -8)],
    [
      { sourceIndex: 0, points: [{ frequency: 40, re: 1.0, im: 0 }, { frequency: 50, re: 0.4, im: 0 }, { frequency: 60, re: 1.0, im: 0 }] },
      { sourceIndex: 1, points: [{ frequency: 40, re: 1.0, im: 0 }, { frequency: 50, re: 0.4, im: 0 }, { frequency: 60, re: 1.0, im: 0 }] },
    ],
  );

  // CASE C — Single-sub modal node: phase flips through null
  const caseC = verifyCancellationNullRegions(
    [makeCandidate(50, 40, 60, -15)],
    [
      { sourceIndex: 0, points: [{ frequency: 40, re: 0.8, im: 0.1 }, { frequency: 50, re: -0.05, im: 0.0 }, { frequency: 60, re: -0.7, im: -0.1 }] },
    ],
  );

  // CASE D — Multi-sub phase cancellation: strong individual, destructive combination
  const caseD = verifyCancellationNullRegions(
    [makeCandidate(50, 40, 60, -12)],
    [
      { sourceIndex: 0, points: [{ frequency: 40, re: 1.0, im: 0 }, { frequency: 50, re: 1.0, im: 0 }, { frequency: 60, re: 1.0, im: 0 }] },
      { sourceIndex: 1, points: [{ frequency: 40, re: 0.9, im: 0.1 }, { frequency: 50, re: -0.9, im: 0.1 }, { frequency: 60, re: 0.9, im: 0.1 }] },
    ],
  );

  // CASE E — Deep correctable deficit (12 dB, no cancellation): two sources in phase, both very weak
  const caseE = verifyCancellationNullRegions(
    [makeCandidate(50, 40, 60, -12)],
    [
      { sourceIndex: 0, points: [{ frequency: 40, re: 1.0, im: 0 }, { frequency: 50, re: 0.25, im: 0 }, { frequency: 60, re: 1.0, im: 0 }] },
      { sourceIndex: 1, points: [{ frequency: 40, re: 1.0, im: 0 }, { frequency: 50, re: 0.25, im: 0 }, { frequency: 60, re: 1.0, im: 0 }] },
    ],
  );

  // CASE F — Safe fallback: no complex data → no protection
  const caseF = verifyCancellationNullRegions(
    [makeCandidate(50, 40, 60, -15)],
    [],
  );

  const checks = [
    { id: 'A', expected: 'correctable dip NOT protected', passed: caseA.length === 0 },
    { id: 'B', expected: 'headroom-limited dip NOT protected', passed: caseB.length === 0 },
    { id: 'C', expected: 'single-sub modal node protected', passed: caseC.length === 1 },
    { id: 'D', expected: 'multi-sub phase cancellation protected', passed: caseD.length === 1 },
    { id: 'E', expected: 'deep correctable deficit NOT protected', passed: caseE.length === 0 },
    { id: 'F', expected: 'no complex data → no protection (safe fallback)', passed: caseF.length === 0 },
  ];

  return {
    checks,
    allPassed: checks.every((check) => check.passed),
    caseA, caseB, caseC, caseD, caseE, caseF,
  };
}