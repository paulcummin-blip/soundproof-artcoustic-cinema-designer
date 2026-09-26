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
//   A single-source modal node is a transfer-function dip, NOT a destructive
//   cancellation between sources. It IS correctable by EQ within headroom —
//   boosting the source increases pressure at the listener proportionally.
//
//   Phase rotation through a modal null is normal transfer-function behaviour
//   but does NOT prove destructive cancellation. Confirming cancellation
//   requires field decomposition (direct vs. modal/reflected contributions)
//   to show the direct and reflected fields are opposing. The authoritative
//   engine only exposes the TOTAL per-source complex pressure — the direct/
//   modal decomposition is not available without an engine modification.
//
//   Per the safe-fallback principle: phase rotation alone must NOT classify
//   a region as uncorrectable. Single-sub candidates are NOT protected.
//   They remain correctable within headroom/capability limits.
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
      // Multi-sub: use coherent efficiency to detect destructive cancellation.
      verification = verifyMultiSubCancellation(transfers, centreFreq, leftFreq, rightFreq);
    }
    // Single-sub (sourceCount === 1): NO protection. A single-source modal node
    // is a transfer-function dip, correctable by EQ within headroom. Phase
    // rotation alone is not sufficient evidence of destructive cancellation
    // without field decomposition (direct vs. modal), which the engine does not
    // expose. Safe fallback: NOT protected.

    if (verification && verification.isCancellation) {
      verified.push({
        ...candidate,
        protected: true,
        cancellationVerified: true,
        verificationMethod: 'multi-sub-coherent-efficiency',
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

  // CASE C — Single-sub modal node: phase flips through null.
  // EXPECTED: NOT protected. Phase rotation alone is insufficient evidence of
  // destructive cancellation without field decomposition (direct vs. modal).
  // The engine only exposes the total per-source complex pressure. A single-sub
  // modal node is a transfer-function dip, correctable by EQ within headroom.
  const caseC = verifyCancellationNullRegions(
    [makeCandidate(50, 40, 60, -15)],
    [
      { sourceIndex: 0, points: [{ frequency: 40, re: 0.8, im: 0.1 }, { frequency: 50, re: -0.05, im: 0.0 }, { frequency: 60, re: -0.7, im: -0.1 }] },
    ],
  );

  // CASE D — Multi-sub destructive cancellation: strong individual, destructive combination
  const caseD = verifyCancellationNullRegions(
    [makeCandidate(50, 40, 60, -12)],
    [
      { sourceIndex: 0, points: [{ frequency: 40, re: 1.0, im: 0 }, { frequency: 50, re: 1.0, im: 0 }, { frequency: 60, re: 1.0, im: 0 }] },
      { sourceIndex: 1, points: [{ frequency: 40, re: 0.9, im: 0.1 }, { frequency: 50, re: -0.9, im: 0.1 }, { frequency: 60, re: 0.9, im: 0.1 }] },
    ],
  );

  // CASE E — Deep narrow correctable deficit (12 dB, no cancellation): two
  // sources in phase, both very weak at centre. Candidate detector triggers
  // (6 Hz / 10 dB) but complex contributions are coherent → NOT protected.
  const caseE = verifyCancellationNullRegions(
    [makeCandidate(50, 40, 60, -12)],
    [
      { sourceIndex: 0, points: [{ frequency: 40, re: 1.0, im: 0 }, { frequency: 50, re: 0.25, im: 0 }, { frequency: 60, re: 1.0, im: 0 }] },
      { sourceIndex: 1, points: [{ frequency: 40, re: 1.0, im: 0 }, { frequency: 50, re: 0.25, im: 0 }, { frequency: 60, re: 1.0, im: 0 }] },
    ],
  );

  // CASE F — False-positive protection test: 15 dB narrow dip with COHERENT
  // sources (both in phase). The 6 Hz / 10 dB candidate detector triggers, but
  // the complex contributions are substantially coherent (efficiency = 1.0).
  // EXPECTED: NOT protected. This is the critical false-positive guard.
  const caseF = verifyCancellationNullRegions(
    [makeCandidate(50, 40, 60, -15)],
    [
      { sourceIndex: 0, points: [{ frequency: 40, re: 1.0, im: 0 }, { frequency: 50, re: 0.18, im: 0 }, { frequency: 60, re: 1.0, im: 0 }] },
      { sourceIndex: 1, points: [{ frequency: 40, re: 1.0, im: 0 }, { frequency: 50, re: 0.18, im: 0 }, { frequency: 60, re: 1.0, im: 0 }] },
    ],
  );

  // CASE G — Safe fallback: no complex data → no protection
  const caseG = verifyCancellationNullRegions(
    [makeCandidate(50, 40, 60, -15)],
    [],
  );

  const checks = [
    { id: 'A', expected: 'correctable dip NOT protected', passed: caseA.length === 0 },
    { id: 'B', expected: 'headroom-limited dip NOT protected', passed: caseB.length === 0 },
    { id: 'C', expected: 'single-sub modal node NOT protected (no field decomposition)', passed: caseC.length === 0 },
    { id: 'D', expected: 'multi-sub destructive cancellation protected', passed: caseD.length === 1 },
    { id: 'E', expected: 'deep narrow correctable deficit NOT protected', passed: caseE.length === 0 },
    { id: 'F', expected: 'false-positive: coherent sources NOT protected', passed: caseF.length === 0 },
    { id: 'G', expected: 'no complex data → no protection (safe fallback)', passed: caseG.length === 0 },
  ];

  return {
    checks,
    allPassed: checks.every((check) => check.passed),
    caseA, caseB, caseC, caseD, caseE, caseF, caseG,
  };
}