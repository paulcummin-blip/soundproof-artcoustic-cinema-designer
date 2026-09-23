// recommendationPhysicalCause.js
// ---------------------------------------------------------------------------
// States the most likely physical cause for the identified problem.
//
// The cause is INFERRED from the engineering data, not directly measured.
// When the cause is inferred rather than directly measured, it is labelled
// as "Likely physical cause" — never presented as measured fact.
//
// The cause is determined by matching the problem type and the engineering
// data (worst frequency, seat position, subwoofer count) to known physical
// mechanisms.
// ---------------------------------------------------------------------------

import { PROBLEM_TYPE } from './recommendationTypes.js';

/**
 * Infer the most likely physical cause for the identified problem.
 *
 * @param {object} problem - output of identifyProblem()
 * @param {object} currentResult - canonical result for the current design
 * @param {object} [context] - optional context (subwooferCount, roomDims)
 * @returns {{ description: string, inferred: boolean }}
 */
export function inferPhysicalCause(problem, currentResult, context = {}) {
  if (!problem || problem.type === PROBLEM_TYPE.NONE) {
    return { description: 'No physical cause to identify.', inferred: false };
  }

  const worstSeat = problem.worstSeat;
  const worstFreq = Number(worstSeat?.worstFrequencyHz) || 0;
  const subwooferCount = Number(context.subwooferCount) || 0;
  const isPrimary = !!worstSeat?.isPrimary;

  switch (problem.type) {
    case PROBLEM_TYPE.CAPABILITY:
      return {
        description: 'The subwoofer cannot produce the target output level at the lowest frequencies. This is a physical capability limit of the current subwoofer(s), not a room acoustics issue.',
        inferred: false,
      };

    case PROBLEM_TYPE.EXTENSION:
      return {
        description: 'The subwoofer cannot reach the target low-frequency extension. This is likely a combination of subwoofer capability and room gain at the lowest frequencies.',
        inferred: true,
      };

    case PROBLEM_TYPE.ROOM_MODE: {
      const modeDescription = describeRoomMode(worstFreq, context.roomDims);
      return {
        description: `A room mode at ${worstFreq.toFixed(0)} Hz is exciting the worst seat${isPrimary ? ' (primary listening position)' : ''}. ${modeDescription}`,
        inferred: true,
      };
    }

    case PROBLEM_TYPE.LOCAL_CANCELLATION: {
      if (subwooferCount >= 2) {
        return {
          description: `A cancellation at ${worstFreq.toFixed(0)} Hz is likely caused by arrival time differences between subwoofers at the worst seat. The front and rear subwoofers are arriving out of phase at this frequency.`,
          inferred: true,
        };
      }
      return {
        description: `A cancellation at ${worstFreq.toFixed(0)} Hz is likely caused by the subwoofer's position relative to the room boundaries. The subwoofer is at a pressure minimum for this frequency.`,
        inferred: true,
      };
    }

    case PROBLEM_TYPE.SEAT_CONSISTENCY: {
      if (subwooferCount <= 1) {
        return {
          description: 'Seat-to-seat variation is likely caused by having only one subwoofer. A single source cannot provide consistent response across multiple seats because room modes affect each seat differently.',
          inferred: true,
        };
      }
      if (worstFreq > 0 && worstFreq < 80) {
        return {
          description: `Seat-to-seat variation is likely caused by a room mode at ${worstFreq.toFixed(0)} Hz that affects seats differently depending on their position in the room.`,
          inferred: true,
        };
      }
      return {
        description: 'Seat-to-seat variation is likely caused by the subwoofer positions creating different arrival times and modal excitation at different seats.',
        inferred: true,
      };
    }

    case PROBLEM_TYPE.RESPONSE_SMOOTHNESS: {
      if (worstFreq > 0 && worstFreq < 40) {
        return {
          description: `The response deviation at ${worstFreq.toFixed(0)} Hz is likely caused by a low-frequency room mode that is exciting the worst seat.`,
          inferred: true,
        };
      }
      if (worstFreq > 0 && worstFreq >= 40 && worstFreq < 100) {
        if (subwooferCount >= 2) {
          return {
            description: `The response deviation at ${worstFreq.toFixed(0)} Hz is likely caused by arrival time differences between multiple subwoofers creating a cancellation at the worst seat.`,
            inferred: true,
          };
        }
        return {
          description: `The response deviation at ${worstFreq.toFixed(0)} Hz is likely caused by the subwoofer's position relative to room boundaries creating a modal peak or dip at the worst seat.`,
          inferred: true,
        };
      }
      return {
        description: 'The response deviation is likely caused by the interaction between the subwoofer position and the room acoustics at the worst seat.',
        inferred: true,
      };
    }

    default:
      return { description: 'The physical cause could not be determined.', inferred: true };
  }
}

function describeRoomMode(freq, roomDims) {
  const W = Number(roomDims?.widthM) || 0;
  const L = Number(roomDims?.lengthM) || 0;
  const H = Number(roomDims?.heightM) || 0;
  if (W <= 0 || L <= 0 || H <= 0) return '';

  const speedOfSound = 343;
  const lengthMode = speedOfSound / (2 * L);
  const widthMode = speedOfSound / (2 * W);
  const heightMode = speedOfSound / (2 * H);

  const modes = [
    { axis: 'length', freq: lengthMode, harmonic: 1 },
    { axis: 'width', freq: widthMode, harmonic: 1 },
    { axis: 'height', freq: heightMode, harmonic: 1 },
  ];

  // Check harmonics
  for (let n = 2; n <= 4; n++) {
    modes.push({ axis: 'length', freq: lengthMode * n, harmonic: n });
    modes.push({ axis: 'width', freq: widthMode * n, harmonic: n });
  }

  const closest = modes.reduce((best, m) =>
    Math.abs(m.freq - freq) < Math.abs(best.freq - freq) ? m : best
  , modes[0]);

  if (Math.abs(closest.freq - freq) < 3) {
    return `This corresponds to the ${closest.axis} axis ${closest.harmonic === 1 ? 'fundamental' : `harmonic ${closest.harmonic}`} mode.`;
  }
  return '';
}