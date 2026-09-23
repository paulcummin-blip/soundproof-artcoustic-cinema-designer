// recommendationEvidence.js
// ---------------------------------------------------------------------------
// Builds the RP22 evidence and expected physical effect sections.
//
// RP22 evidence is SUPPORTING ONLY — it confirms the engineering reasoning,
// it never leads it. The expected physical effect describes the engineering
// outcome in physical terms, not parameter terms.
// ---------------------------------------------------------------------------

import { EXPECTED_EFFECT } from './recommendationTypes.js';
import { countFailingSeats } from '@/components/room/bass/improveBassV2/zeroFailOptimiser.js';

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || '').match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function levelText(level) {
  const n = numericLevel(level);
  return n > 0 ? `L${n}` : 'FAIL';
}

/**
 * Build the RP22 evidence section comparing current to winner.
 *
 * @param {object} currentResult - baseline canonical result
 * @param {object} winner - selected winner
 * @returns {{ p19: object, p20: object, p18: object, p14: object }}
 */
export function buildRp22Evidence(currentResult, winner) {
  if (!currentResult || !winner) {
    return { p19: null, p20: null, p18: null, p14: null };
  }

  // P19 — worst primary seat level
  const currentP19Primary = (currentResult.perSeatP19 || []).filter((s) => s.isPrimary);
  const winnerP19Primary = (winner.perSeatP19 || []).filter((s) => s.isPrimary);
  const currentP19Level = currentP19Primary.length
    ? levelText(currentP19Primary.reduce((worst, s) =>
        numericLevel(s.level) < numericLevel(worst.level) ? s : worst
      , currentP19Primary[0]).level)
    : '—';
  const winnerP19Level = winnerP19Primary.length
    ? levelText(winnerP19Primary.reduce((worst, s) =>
        numericLevel(s.level) < numericLevel(worst.level) ? s : worst
      , winnerP19Primary[0]).level)
    : '—';

  // P20 — worst seat level
  const currentP20Worst = (currentResult.perSeatP20 || []).reduce((worst, s) =>
    numericLevel(s.level) < numericLevel(worst?.level) ? s : worst
  , currentResult.perSeatP20?.[0] || { level: null });
  const winnerP20Worst = (winner.perSeatP20 || []).reduce((worst, s) =>
    numericLevel(s.level) < numericLevel(worst?.level) ? s : worst
  , winner.perSeatP20?.[0] || { level: null });

  // P18
  const currentP18Level = levelText(currentResult.p18AchievedLevel);
  const winnerP18Level = levelText(winner.p18AchievedLevel);
  const currentP18Hz = Number(currentResult.achievedP18Hz) || 0;
  const winnerP18Hz = Number(winner.achievedP18Hz) || 0;

  // P14
  const currentP14Level = levelText(currentResult.p14AchievedLevel);
  const winnerP14Level = levelText(winner.p14AchievedLevel);
  const currentP14Db = Number(currentResult.p14AchievedDb) || 0;
  const winnerP14Db = Number(winner.p14AchievedDb) || 0;

  return {
    p19: {
      from: currentP19Level,
      to: winnerP19Level,
      changed: currentP19Level !== winnerP19Level,
    },
    p20: {
      from: levelText(currentP20Worst?.level),
      to: levelText(winnerP20Worst?.level),
      changed: levelText(currentP20Worst?.level) !== levelText(winnerP20Worst?.level),
    },
    p18: {
      from: currentP18Level,
      to: winnerP18Level,
      fromHz: currentP18Hz,
      toHz: winnerP18Hz,
      changed: currentP18Level !== winnerP18Level || Math.abs(currentP18Hz - winnerP18Hz) > 1,
    },
    p14: {
      from: currentP14Level,
      to: winnerP14Level,
      fromDb: currentP14Db,
      toDb: winnerP14Db,
      changed: currentP14Level !== winnerP14Level || Math.abs(currentP14Db - winnerP14Db) > 0.1,
    },
  };
}

/**
 * Build the expected physical effect from the engineering changes.
 *
 * @param {object} currentResult - baseline canonical result
 * @param {object} winner - selected winner
 * @returns {{ description: string, effects: string[] }}
 */
export function buildExpectedPhysicalEffect(currentResult, winner) {
  if (!currentResult || !winner) {
    return { description: 'No expected effect available.', effects: [] };
  }

  const effects = [];
  const parts = [];

  // Failing seat elimination
  const currentFails = countFailingSeats(currentResult);
  const winnerFails = countFailingSeats(winner);
  if (winnerFails < currentFails) {
    effects.push(EXPECTED_EFFECT.ELIMINATED_FAILING_SEAT);
    parts.push(`Eliminated ${currentFails - winnerFails} failing seat${currentFails - winnerFails > 1 ? 's' : ''}`);
  }

  // P19 improvement → response smoothness
  const p19Before = new Map((currentResult.perSeatP19 || []).map((s) => [String(s.seatId), s]));
  let p19Improved = false;
  let primaryP19Improved = false;
  for (const seat of (winner.perSeatP19 || [])) {
    const before = p19Before.get(String(seat.seatId));
    if (before && numericLevel(seat.level) > numericLevel(before.level)) {
      p19Improved = true;
      if (seat.isPrimary) primaryP19Improved = true;
    }
  }
  if (p19Improved) {
    effects.push(EXPECTED_EFFECT.IMPROVED_RESPONSE_SMOOTHNESS);
    parts.push('Improved response smoothness');
  }
  if (primaryP19Improved) {
    effects.push(EXPECTED_EFFECT.IMPROVED_PRIMARY_SEAT_RESPONSE);
  }

  // P20 improvement → seat consistency
  const p20Before = new Map((currentResult.perSeatP20 || []).map((s) => [String(s.seatId), s]));
  let p20Improved = false;
  for (const seat of (winner.perSeatP20 || [])) {
    const before = p20Before.get(String(seat.seatId));
    if (before && numericLevel(seat.level) > numericLevel(before.level)) {
      p20Improved = true;
    }
  }
  if (p20Improved) {
    effects.push(EXPECTED_EFFECT.REDUCED_SEAT_TO_SEAT_VARIATION);
    parts.push('Reduced seat-to-seat variation');
  }

  // P18 improvement → extension
  const currentP18Hz = Number(currentResult.achievedP18Hz) || 0;
  const winnerP18Hz = Number(winner.achievedP18Hz) || 0;
  if (winnerP18Hz > currentP18Hz + 1) {
    effects.push(EXPECTED_EFFECT.INCREASED_EXTENSION);
    parts.push(`Increased extension from ${currentP18Hz.toFixed(0)} Hz to ${winnerP18Hz.toFixed(0)} Hz`);
  }

  // P14 improvement → headroom
  const currentP14Db = Number(currentResult.p14AchievedDb) || 0;
  const winnerP14Db = Number(winner.p14AchievedDb) || 0;
  if (winnerP14Db > currentP14Db + 0.1) {
    effects.push(EXPECTED_EFFECT.INCREASED_HEADROOM);
    parts.push(`Increased headroom by ${(winnerP14Db - currentP14Db).toFixed(1)} dB`);
  }

  // Modal balance — if worst frequency deviation reduced
  const currentWorst = Math.max(...(currentResult.perSeatP19 || []).map((s) => Math.abs(Number(s.variationDbRaw) || 0)), 0);
  const winnerWorst = Math.max(...(winner.perSeatP19 || []).map((s) => Math.abs(Number(s.variationDbRaw) || 0)), 0);
  if (winnerWorst < currentWorst - 0.5 && !p19Improved) {
    effects.push(EXPECTED_EFFECT.IMPROVED_MODAL_BALANCE);
    parts.push('Improved modal balance');
  }

  const description = parts.length > 0
    ? parts.join(', ') + '.'
    : 'No significant physical effect expected.';

  return { description, effects };
}

/**
 * Identify what still limits the design after the recommendation is applied.
 *
 * @param {object} winner - the selected winner (the state AFTER applying)
 * @param {object} problem - the identified problem
 * @param {object} context - optional context (p14TargetDb, p18TargetHz)
 * @returns {{ description: string, type: string|null }}
 */
export function identifyRemainingLimitation(winner, problem, context = {}) {
  if (!winner) {
    return { description: 'No engineering results available.', type: null };
  }

  const fails = countFailingSeats(winner);
  const worstDev = Math.max(...(winner.perSeatP19 || []).map((s) => Math.abs(Number(s.variationDbRaw) || 0)), 0);
  const p18Hz = Number(winner.achievedP18Hz) || 0;
  const p14Db = Number(winner.p14AchievedDb) || 0;
  const p14TargetDb = Number(context.p14TargetDb) || 0;
  const p18TargetHz = Number(context.p18TargetHz) || 0;

  // Check what still limits
  if (p14TargetDb > 0 && p14Db < p14TargetDb - 0.5) {
    return {
      description: 'Subwoofer capability is now the limiting factor. The system cannot reach the target output level.',
      type: 'capability',
    };
  }

  if (p18TargetHz > 0 && p18Hz < p18TargetHz - 2) {
    return {
      description: 'Low-frequency extension is now the limiting factor.',
      type: 'extension',
    };
  }

  if (fails > 0) {
    return {
      description: `${fails} seat${fails > 1 ? 's remain' : ' remains'} failing P19 or P20 after this change.`,
      type: fails > 1 ? 'seat_consistency' : 'response_smoothness',
    };
  }

  if (worstDev > 3) {
    return {
      description: 'Response smoothness at the worst seat remains the limiting factor.',
      type: 'response_smoothness',
    };
  }

  // Check seat-to-seat variation
  const p19Raws = (winner.perSeatP19 || []).map((s) => Math.abs(Number(s.variationDbRaw) || 0));
  if (p19Raws.length >= 2) {
    const spread = Math.max(...p19Raws) - Math.min(...p19Raws);
    if (spread > 1.5) {
      return {
        description: 'Seat-to-seat variation remains the limiting factor.',
        type: 'seat_consistency',
      };
    }
  }

  return {
    description: 'No significant limitation remains. The design is well-optimised.',
    type: null,
  };
}