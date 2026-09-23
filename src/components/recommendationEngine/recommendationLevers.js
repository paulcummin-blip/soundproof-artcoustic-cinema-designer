// recommendationLevers.js
// ---------------------------------------------------------------------------
// Identifies all available engineering levers and determines which lever
// best matches the physical cause.
//
// Available levers are determined by what the optimiser actually tested:
//   - Calibration: always available (delay, phase, polarity, gain, EQ)
//   - Physical: available if position or seating candidates were tested
//   - Specification: always theoretically available but only recommended
//     when calibration and physical are exhausted or the cause requires it
//
// The appropriate lever is determined by matching the physical cause to
// the lever class. The recommendation class must match the engineering cause.
// ---------------------------------------------------------------------------

import { LEVER_CLASS, LEVER, PROBLEM_TYPE } from './recommendationTypes.js';

/**
 * Identify all engineering levers available given the optimiser's search.
 *
 * @param {object} selection - the optimiser selection object
 * @returns {{ calibration: string[], physical: string[], specification: string[] }}
 */
export function identifyAvailableLevers(selection) {
  if (!selection) {
    return { calibration: [], physical: [], specification: [] };
  }

  const calibration = [];
  const physical = [];
  const specification = [];

  // Calibration levers — check which were actually tested
  const phaseDiagnostics = selection.phaseDiagnostics || {};
  const calDiagnostics = selection.calibrationDiagnostics || {};
  const gainDiagnostics = selection.gainDiagnostics || {};

  if (phaseDiagnostics.status !== 'skipped' && phaseDiagnostics.status !== 'not_tested') {
    calibration.push(LEVER.PHASE);
  }
  if (calDiagnostics.status !== 'skipped' && calDiagnostics.status !== 'not_tested') {
    calibration.push(LEVER.DELAY);
  }
  if (gainDiagnostics.status !== 'skipped' && gainDiagnostics.status !== 'not_tested') {
    calibration.push(LEVER.GAIN);
  }
  // Polarity and EQ are always part of the calibration search
  calibration.push(LEVER.POLARITY);
  calibration.push(LEVER.EQ);

  // Physical levers — check if position and seating were tested
  const positionOpt = selection.positionOptimisation || {};
  const seatingResult = selection.seatingResult;
  const seatingMaterial = selection.seatingMaterial?.material === true;

  if (positionOpt.subOptimisationExhausted !== undefined || selection.confirmedResults?.some((r) => r?.isPositionCandidate)) {
    physical.push(LEVER.MOVE_SUBWOOFER);
  }
  if (seatingResult || seatingMaterial || selection.seatingDiagnostics?.tested > 0) {
    physical.push(LEVER.MOVE_SEATING);
  }

  // Specification levers — always theoretically available
  specification.push(LEVER.ADDITIONAL_SUBWOOFER);
  specification.push(LEVER.DIFFERENT_SUBWOOFER);
  specification.push(LEVER.DIFFERENT_LAYOUT);

  // Deduplicate
  return {
    calibration: [...new Set(calibration)],
    physical: [...new Set(physical)],
    specification: [...new Set(specification)],
  };
}

/**
 * Determine which available lever best matches the physical cause.
 *
 * The recommendation class must match the engineering cause:
 *   - Arrival mismatch → calibration (delay/phase)
 *   - Room mode at seat → physical (move seating) or calibration (EQ)
 *   - Subwoofer placement → physical (move subwoofer)
 *   - Capability limit → specification
 *
 * @param {object} problem - output of identifyProblem()
 * @param {object} physicalCause - output of inferPhysicalCause()
 * @param {object} availableLevers - output of identifyAvailableLevers()
 * @param {object} selection - the optimiser selection (to check what was tested)
 * @returns {{ class: string, lever: string, reason: string }}
 */
export function determineAppropriateLever(problem, physicalCause, availableLevers, selection) {
  if (!problem || problem.type === PROBLEM_TYPE.NONE) {
    return { class: LEVER_CLASS.CALIBRATION, lever: LEVER.DELAY, reason: 'No problem identified.' };
  }

  const calibrationAvailable = availableLevers.calibration.length > 0;
  const physicalAvailable = availableLevers.physical.length > 0;

  switch (problem.type) {
    case PROBLEM_TYPE.CAPABILITY:
      // Capability cannot be fixed by calibration or physical movement
      return {
        class: LEVER_CLASS.SPECIFICATION,
        lever: LEVER.DIFFERENT_SUBWOOFER,
        reason: 'A capability limit requires a different or additional subwoofer. No calibration or positioning change can overcome the physical capability of the current subwoofer(s).',
      };

    case PROBLEM_TYPE.EXTENSION:
      // Extension may be capability or placement
      if (calibrationAvailable) {
        return {
          class: LEVER_CLASS.CALIBRATION,
          lever: LEVER.EQ,
          reason: 'Extension may be partially addressable through EQ. However, if the subwoofer cannot physically produce the target frequency, specification changes are required.',
        };
      }
      return {
        class: LEVER_CLASS.SPECIFICATION,
        lever: LEVER.DIFFERENT_SUBWOOFER,
        reason: 'Extension below the subwoofer capability requires a different subwoofer.',
      };

    case PROBLEM_TYPE.LOCAL_CANCELLATION:
      // Cancellation between multiple subs → delay/phase
      if (calibrationAvailable && availableLevers.calibration.includes(LEVER.DELAY)) {
        return {
          class: LEVER_CLASS.CALIBRATION,
          lever: LEVER.DELAY,
          reason: 'A local cancellation between multiple subwoofers is best addressed by aligning arrival times through delay adjustment.',
        };
      }
      if (physicalAvailable) {
        return {
          class: LEVER_CLASS.PHYSICAL,
          lever: LEVER.MOVE_SUBWOOFER,
          reason: 'A local cancellation caused by subwoofer placement requires moving the subwoofer away from the pressure minimum.',
        };
      }
      return {
        class: LEVER_CLASS.CALIBRATION,
        lever: LEVER.EQ,
        reason: 'A local cancellation may be partially addressable through EQ, though physical movement is preferred.',
      };

    case PROBLEM_TYPE.ROOM_MODE:
      // Room mode at seat → move seating or move sub
      if (physicalAvailable && availableLevers.physical.includes(LEVER.MOVE_SEATING)) {
        return {
          class: LEVER_CLASS.PHYSICAL,
          lever: LEVER.MOVE_SEATING,
          reason: 'A room mode affecting specific seats is best addressed by moving the seating away from the modal peak or null.',
        };
      }
      if (physicalAvailable && availableLevers.physical.includes(LEVER.MOVE_SUBWOOFER)) {
        return {
          class: LEVER_CLASS.PHYSICAL,
          lever: LEVER.MOVE_SUBWOOFER,
          reason: 'A room mode can be addressed by repositioning the subwoofer to change the modal excitation pattern.',
        };
      }
      return {
        class: LEVER_CLASS.CALIBRATION,
        lever: LEVER.EQ,
        reason: 'A room mode may be partially addressable through EQ, though physical positioning is preferred.',
      };

    case PROBLEM_TYPE.SEAT_CONSISTENCY:
      // Seat consistency → move subs or add subs
      if (physicalAvailable && availableLevers.physical.includes(LEVER.MOVE_SUBWOOFER)) {
        return {
          class: LEVER_CLASS.PHYSICAL,
          lever: LEVER.MOVE_SUBWOOFER,
          reason: 'Seat-to-seat variation is best addressed by repositioning subwoofers to provide more uniform modal excitation across all seats.',
        };
      }
      if (calibrationAvailable) {
        return {
          class: LEVER_CLASS.CALIBRATION,
          lever: LEVER.DELAY,
          reason: 'Seat-to-seat variation may be partially addressable through delay and phase adjustment to align arrivals across seats.',
        };
      }
      return {
        class: LEVER_CLASS.SPECIFICATION,
        lever: LEVER.ADDITIONAL_SUBWOOFER,
        reason: 'Seat-to-seat variation with a single subwoofer is fundamentally limited. Additional subwoofers provide the spatial diversity needed for consistent response.',
      };

    case PROBLEM_TYPE.RESPONSE_SMOOTHNESS:
      // Response smoothness → calibration first
      if (calibrationAvailable) {
        return {
          class: LEVER_CLASS.CALIBRATION,
          lever: LEVER.EQ,
          reason: 'Response smoothness is best addressed through EQ to flatten the response at the worst seat.',
        };
      }
      if (physicalAvailable) {
        return {
          class: LEVER_CLASS.PHYSICAL,
          lever: LEVER.MOVE_SUBWOOFER,
          reason: 'Response smoothness may be addressable by repositioning the subwoofer to reduce the modal interaction.',
        };
      }
      return {
        class: LEVER_CLASS.SPECIFICATION,
        lever: LEVER.DIFFERENT_SUBWOOFER,
        reason: 'Response smoothness that cannot be addressed by calibration or positioning may require a different subwoofer.',
      };

    default:
      return {
        class: LEVER_CLASS.CALIBRATION,
        lever: LEVER.DELAY,
        reason: 'Calibration is the default appropriate lever.',
      };
  }
}

/**
 * Check whether all available levers have been exhausted.
 * Used for the "No Recommendation" gate.
 */
export function areAllLeversExhausted(selection) {
  if (!selection) return false;

  const positionOpt = selection.positionOptimisation || {};
  const calibrationMaterial = selection.calibrationMaterial?.material === true;
  const phaseMaterial = selection.phaseMaterial?.material === true;
  const gainMaterial = selection.gainMaterial?.material === true;
  const seatingMaterial = selection.seatingMaterial?.material === true;
  const combinedMaterial = selection.combinedMaterial?.material === true;

  // All levers are exhausted when:
  // 1. Position search was exhausted (subOptimisationExhausted === true)
  // 2. No calibration improvement was found (calibration, phase, gain all not material)
  // 3. No seating improvement was found
  // 4. No combined improvement was found
  return positionOpt.subOptimisationExhausted === true
    && !calibrationMaterial
    && !phaseMaterial
    && !gainMaterial
    && !seatingMaterial
    && !combinedMaterial;
}