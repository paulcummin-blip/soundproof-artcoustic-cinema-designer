// recommendationDiagnosisCopy.js
// ---------------------------------------------------------------------------
// ADI — Limiting Factor Copy
//
// The single source for the recommendation copy attached to the
// severity-driven limiting factors:
//
//   • SEAT_CONSISTENCY      — seat-to-seat consistency leads
//   • MULTI_SUB_INTERACTION — the pair/array placement is interacting poorly
//   • RESPONSE_SMOOTHNESS   — the reference-seat response is not controlled
//
// Copy is returned ONLY when the problem carries an explicit severity
// assessment from the limiting-factor authority. Problems produced by the
// legacy mild-detection heuristics (no `severity`) keep their existing copy,
// so a mild response feature is never described as a severe failure.
//
// The copy never leads with EQ: placement, delay, polarity and gain are
// stated first, and EQ last.
//
// This module is PURE: no React, no side effects.
// ---------------------------------------------------------------------------

import { PROBLEM_TYPE } from './recommendationTypes.js';

const COUNT_WORDS = Object.freeze({
  1: 'One',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
});

const INVESTIGATION_ACTION =
  'Try placement, delay, polarity, gain, or additional or alternative subwoofer positions before applying EQ.';

function countWord(count) {
  const n = Math.max(1, Math.min(8, Math.round(Number(count) || 0)));
  return COUNT_WORDS[n] || `${n}`;
}

function formatDeviationDb(value) {
  return `${Math.abs(Number(value) || 0).toFixed(1)} dB`;
}

function subwooferCountOf(problem, options) {
  return Number(problem?.metrics?.subwooferCount ?? options.subwooferCount) || 0;
}

function outputAndExtensionMet(problem, options) {
  const fromProblem = problem?.metrics?.outputAndExtensionMet;
  if (typeof fromProblem === 'boolean') return fromProblem;
  return options.outputAndExtensionMet === true;
}

// ── Seat-to-seat consistency ─────────────────────────────────────────────

function seatConsistencyCopy(problem, options) {
  const worst = problem?.metrics?.worstSeatDeviationDb ?? problem?.severity?.seatConsistency?.worstDeviationDb;
  const count = subwooferCountOf(problem, options);
  const strongOutput = outputAndExtensionMet(problem, options);

  if (count >= 4 && strongOutput) {
    return {
      assessment: 'Seat-to-seat consistency remains the limiting factor.',
      why: `${countWord(count)} subs have improved output, extension and reference-seat smoothness, but the array is not yet optimised for seat-to-seat consistency.`,
      action: 'Adjust front/rear timing, gain and polarity before final EQ.',
      remainingLimitation: 'The system has strong output and extension, but seat consistency still needs optimisation. Try placement, delay, polarity or gain before relying on EQ.',
    };
  }

  const action = count === 2
    ? 'Try moving one sub, changing delay, polarity or gain before applying EQ.'
    : INVESTIGATION_ACTION;

  const limitation = count <= 1
    ? 'A single subwoofer cannot provide consistent response across seats — an additional or alternative subwoofer position is the remaining limitation.'
    : 'Seat-to-seat consistency across the seating area is the remaining limitation.';

  return {
    assessment: 'Seat-to-seat consistency remains the limiting factor.',
    why: `Worst seat deviation is ${formatDeviationDb(worst)}. The current result does not meet L2 seat-to-seat consistency.`,
    action,
    remainingLimitation: limitation,
  };
}

// ── Reference-seat response (P19) ────────────────────────────────────────

function responseSmoothnessCopy(problem) {
  const deviation = problem?.metrics?.referenceSeatDeviationDb ?? problem?.severity?.responseSmoothness?.deviationDb;
  return {
    assessment: 'The reference-seat response is not currently controlled.',
    why: `Worst reference-seat deviation is ${formatDeviationDb(deviation)}. The current result does not meet L2 response smoothness.`,
    action: 'Reposition the subwoofers, or adjust delay, polarity and gain, before applying EQ.',
    remainingLimitation: 'The reference-seat response remains the limiting factor for this design.',
  };
}

// ── Pair / array placement interaction ───────────────────────────────────

function multiSubInteractionCopy(problem, options) {
  const count = subwooferCountOf(problem, options);
  const worst = problem?.metrics?.worstSeatDeviationDb ?? problem?.severity?.seatConsistency?.worstDeviationDb;
  const reference = problem?.metrics?.referenceSeatDeviationDb ?? problem?.severity?.responseSmoothness?.deviationDb;

  if (count === 2) {
    return {
      assessment: 'The reference-seat response and seat-to-seat consistency are both limiting this design.',
      why: 'This pair placement is interacting poorly with the room. The result has more extension, but the reference response and seat consistency are worse.',
      action: 'Try moving one sub, changing delay, polarity or gain before applying EQ.',
      remainingLimitation: `Worst seat deviation is ${formatDeviationDb(worst)} and the reference-seat response is not currently controlled (${formatDeviationDb(reference)}).`,
    };
  }

  return {
    assessment: 'The reference-seat response and seat-to-seat consistency are both limiting this design.',
    why: `${countWord(count)} subs are interacting poorly with the room. The result has more output and extension, but the reference response and seat consistency are worse.`,
    action: 'Adjust front/rear timing, gain and polarity before final EQ.',
    remainingLimitation: `Worst seat deviation is ${formatDeviationDb(worst)} and the reference-seat response is not currently controlled (${formatDeviationDb(reference)}).`,
  };
}

/**
 * Build the limiting-factor copy for a diagnosed problem.
 *
 * @param {object} problem - output of identifyLimitingFactor()
 * @param {object} [options] - { subwooferCount, outputAndExtensionMet }
 * @returns {{ assessment: string, why: string, action: string,
 *   remainingLimitation: string }|null} copy, or null when the problem is not
 *   a severity-driven limiting factor (callers keep their existing copy)
 */
export function buildDiagnosisCopy(problem, options = {}) {
  const type = problem?.type;
  const severity = problem?.severity;
  if (!type || !severity) return null;

  if (type === PROBLEM_TYPE.SEAT_CONSISTENCY) {
    // Only the severe seat-consistency factor gets the "does not meet L2" copy.
    if (severity.seatConsistency?.severe !== true) return null;
    return seatConsistencyCopy(problem, options);
  }

  if (type === PROBLEM_TYPE.MULTI_SUB_INTERACTION) {
    return multiSubInteractionCopy(problem, options);
  }

  if (type === PROBLEM_TYPE.RESPONSE_SMOOTHNESS) {
    if (severity.responseSmoothness?.severe !== true) return null;
    return responseSmoothnessCopy(problem);
  }

  return null;
}

/**
 * The physical cause sentence for a severity-driven limiting factor.
 * Returns null when the problem has no severity-driven copy.
 */
export function buildDiagnosisCause(problem, options = {}) {
  const copy = buildDiagnosisCopy(problem, options);
  return copy ? copy.why : null;
}

export { formatDeviationDb, INVESTIGATION_ACTION };