// recommendationProblem.js
// ---------------------------------------------------------------------------
// Identifies the limiting engineering issue from the canonical result.
//
// This is NOT an RP22 level. It identifies the physical/engineering problem
// that is holding back the design: seat consistency, response smoothness,
// extension, capability, room mode, or local cancellation.
//
// The problem is determined by examining which engineering metric is worst
// relative to its target or ideal state.
// ---------------------------------------------------------------------------

import { PROBLEM_TYPE } from './recommendationTypes.js';

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || '').match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function worstSeatP19(result) {
  const p19 = Array.isArray(result?.perSeatP19) ? result.perSeatP19 : [];
  if (!p19.length) return null;
  let worst = p19[0];
  for (const seat of p19) {
    if (Math.abs(Number(seat.variationDbRaw) || 0) > Math.abs(Number(worst.variationDbRaw) || 0)) {
      worst = seat;
    }
  }
  return worst;
}

function worstSeatP20(result) {
  const p20 = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  if (!p20.length) return null;
  let worst = p20[0];
  for (const seat of p20) {
    if (Math.abs(Number(seat.variationDbRaw) || 0) > Math.abs(Number(worst.variationDbRaw) || 0)) {
      worst = seat;
    }
  }
  return worst;
}

function seatVariationSpreadDb(result) {
  const p19 = Array.isArray(result?.perSeatP19) ? result.perSeatP19 : [];
  if (p19.length < 2) return 0;
  const raws = p19.map((s) => Math.abs(Number(s?.variationDbRaw) || 0));
  return Math.max(...raws) - Math.min(...raws);
}

function hasFailingSeats(result) {
  const p19 = Array.isArray(result?.perSeatP19) ? result.perSeatP19 : [];
  const p20 = Array.isArray(result?.perSeatP20) ? result.perSeatP20 : [];
  return p19.some((s) => numericLevel(s.level) === 0) || p20.some((s) => numericLevel(s.level) === 0);
}

function isExtensionLimited(result, context = {}) {
  const p18Hz = Number(result?.achievedP18Hz) || 0;
  const targetHz = Number(context.p18TargetHz) || 0;
  if (targetHz <= 0 || p18Hz <= 0) return false;
  return p18Hz < targetHz - 2; // 2 Hz tolerance
}

function isCapabilityLimited(result, context = {}) {
  const p14Db = Number(result?.p14AchievedDb) || 0;
  const targetDb = Number(context.p14TargetDb) || 0;
  if (targetDb <= 0 || p14Db <= 0) return false;
  return p14Db < targetDb - 0.5; // 0.5 dB tolerance
}

function isRoomModeProblem(result) {
  const worstP19 = worstSeatP19(result);
  if (!worstP19) return false;
  const freq = Number(worstP19.worstFrequencyHz) || 0;
  // Room modes typically manifest as narrow peaks/dips below 80 Hz
  return freq > 0 && freq < 80;
}

function isLocalCancellation(result) {
  const worstP19 = worstSeatP19(result);
  if (!worstP19) return false;
  const freq = Number(worstP19.worstFrequencyHz) || 0;
  const deviation = Math.abs(Number(worstP19.variationDbRaw) || 0);
  // Local cancellations manifest as deep narrow nulls, often above 30 Hz
  return freq > 30 && freq < 120 && deviation > 6;
}

/**
 * Identify the limiting engineering problem.
 *
 * @param {object} currentResult - canonical result for the current design
 * @param {object} [context] - optional context (p14TargetDb, p18TargetHz)
 * @returns {{ type: string|null, description: string, worstSeat: object|null }}
 */
export function identifyProblem(currentResult, context = {}) {
  if (!currentResult) {
    return { type: PROBLEM_TYPE.NONE, description: 'No engineering results available.', worstSeat: null };
  }

  const hasFails = hasFailingSeats(currentResult);
  const spread = seatVariationSpreadDb(currentResult);
  const worstP19 = worstSeatP19(currentResult);
  const worstP20 = worstSeatP20(currentResult);
  const extensionLimited = isExtensionLimited(currentResult, context);
  const capabilityLimited = isCapabilityLimited(currentResult, context);

  // Priority: capability > extension > failing seats > room mode > local cancellation > consistency > smoothness
  // Capability and extension are physical limits that calibration cannot fix.

  if (capabilityLimited) {
    return {
      type: PROBLEM_TYPE.CAPABILITY,
      description: 'Subwoofer capability is the limiting factor. The system cannot reach the target output level.',
      worstSeat: worstP19,
    };
  }

  if (extensionLimited) {
    return {
      type: PROBLEM_TYPE.EXTENSION,
      description: 'Low-frequency extension is the limiting factor. The system does not reach the target extension.',
      worstSeat: worstP19,
    };
  }

  if (hasFails) {
    // Determine if the fails are primarily P19 (response) or P20 (consistency)
    const p19Fails = (currentResult.perSeatP19 || []).filter((s) => numericLevel(s.level) === 0).length;
    const p20Fails = (currentResult.perSeatP20 || []).filter((s) => numericLevel(s.level) === 0).length;
    if (p20Fails > p19Fails) {
      return {
        type: PROBLEM_TYPE.SEAT_CONSISTENCY,
        description: 'Seat-to-seat consistency is the limiting factor. Some seats fail the consistency threshold.',
        worstSeat: worstP20,
      };
    }
    return {
      type: PROBLEM_TYPE.RESPONSE_SMOOTHNESS,
      description: 'Response smoothness is the limiting factor. Some seats fail the response deviation threshold.',
      worstSeat: worstP19,
    };
  }

  if (isRoomModeProblem(currentResult)) {
    const freq = Number(worstP19.worstFrequencyHz) || 0;
    return {
      type: PROBLEM_TYPE.ROOM_MODE,
      description: `A room mode at ${freq.toFixed(0)} Hz is causing the worst seat deviation.`,
      worstSeat: worstP19,
    };
  }

  if (isLocalCancellation(currentResult)) {
    const freq = Number(worstP19.worstFrequencyHz) || 0;
    return {
      type: PROBLEM_TYPE.LOCAL_CANCELLATION,
      description: `A local cancellation at ${freq.toFixed(0)} Hz is causing a deep null at the worst seat.`,
      worstSeat: worstP19,
    };
  }

  if (spread > 1.5) {
    return {
      type: PROBLEM_TYPE.SEAT_CONSISTENCY,
      description: 'Seat-to-seat variation is the limiting factor. The response differs significantly between seats.',
      worstSeat: worstP20,
    };
  }

  if (worstP19 && Math.abs(Number(worstP19.variationDbRaw) || 0) > 2) {
    return {
      type: PROBLEM_TYPE.RESPONSE_SMOOTHNESS,
      description: 'Response smoothness is the limiting factor. The worst seat has significant deviation from target.',
      worstSeat: worstP19,
    };
  }

  return {
    type: PROBLEM_TYPE.NONE,
    description: 'No significant engineering problem identified.',
    worstSeat: null,
  };
}