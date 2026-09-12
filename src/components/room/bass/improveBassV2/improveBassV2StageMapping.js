// improveBassV2StageMapping.js
// Pure mapping from engine onProgress phases to user-facing progress stages.
//
// The engine emits onProgress(phase, label, current, total) at each internal
// phase. This module maps those phases to the 7 user-facing stages:
//   1. Checking phase / polarity
//   2. Checking delays
//   3. Checking gain
//   4. Checking subwoofer positions
//   5. Checking seating positions
//   6. Comparing improvements
//   7. Preparing recommendations
//
// IMPORTANT: The engine tests phase/delay/gain TOGETHER in a combined
// searchDelayPolarityTrim call (polarity → delay → trim → re-optimise delay).
// They are NOT tested separately. This mapping preserves the actual engine
// behaviour: all three calibration stages become active together during the
// `calibrating` phase and complete together when it finishes.
//
// Stage 11C (seating position search) is NOT implemented. The seating stage
// is always shown as "not_tested" — never faked as completed.

export const STAGE_KEYS = [
  'phase_polarity',
  'delays',
  'gain',
  'sub_positions',
  'seating_positions',
  'comparing',
  'preparing',
];

export const STAGE_LABELS = {
  phase_polarity: 'Checking phase / polarity',
  delays: 'Checking delays',
  gain: 'Checking gain',
  sub_positions: 'Checking subwoofer positions',
  seating_positions: 'Checking seating positions',
  comparing: 'Comparing improvements',
  preparing: 'Preparing recommendations',
};

export const STAGE_SUPPORTING_TEXT = {
  phase_polarity: 'Testing polarity states between subwoofers.',
  delays: 'Testing timing alignment between subwoofers.',
  gain: 'Testing level balance between subwoofers.',
  sub_positions: 'Testing practical placement changes.',
  seating_positions: 'Testing whether small seating changes could improve bass consistency.',
  comparing: 'Comparing all tested improvements.',
  preparing: 'Preparing final recommendations.',
};

// Engine phase → active user-facing stage key.
// null = pre-stage (reviewing / awaiting_stage2) — no stage active yet.
const PHASE_TO_ACTIVE_STAGE = {
  reviewing: null,
  awaiting_stage2: null,
  idle: null,
  calibrating: 'phase_polarity', // combined calibration — phase/polarity is first
  testing_positions: 'sub_positions',
  screening_symmetric: 'sub_positions',
  confirming_symmetric: 'sub_positions',
  'screening_asymmetric-pair': 'sub_positions',
  'confirming_asymmetric-pair': 'sub_positions',
  screening_individual: 'sub_positions',
  confirming_individual: 'sub_positions',
  finalising: 'comparing',
};

// Sub-stage label for the sub_positions stage, derived from the engine phase
// or positionSearchPhase store field.
const SUB_POSITION_SUB_LABELS = {
  testing_positions: 'Testing recommended positions',
  screening_symmetric: 'Testing symmetric positions',
  confirming_symmetric: 'Confirming symmetric positions',
  'screening_asymmetric-pair': 'Testing alternative positions',
  'confirming_asymmetric-pair': 'Confirming alternative positions',
  screening_individual: 'Testing final position options',
  confirming_individual: 'Confirming final positions',
  symmetric: 'Testing symmetric positions',
  'asymmetric-pair': 'Testing alternative positions',
  individual: 'Testing final position options',
};

/**
 * Build the user-facing stage display from the V2 store state.
 *
 * @param {object} state - improveBassV2 store state (phase, status,
 *   positionSearchPhase, stageVerdicts)
 * @returns {object} stage display model:
 *   { headerLabel, supportingText, stages: [{key,label,status,supportingText,verdict,subStageLabel}], activeStageKey }
 */
export function buildStageDisplay(state) {
  const phase = state?.phase || 'idle';
  const status = state?.status || 'idle';
  const positionSearchPhase = state?.positionSearchPhase || null;
  const stageVerdicts = state?.stageVerdicts || {};

  // Pre-stage: awaiting Stage 2
  if (status === 'awaiting_stage2') {
    return {
      headerLabel: 'Preparing placement…',
      supportingText: 'Testing practical improvements before recommending physical changes.',
      stages: STAGE_KEYS.map((key) => ({
        key,
        label: STAGE_LABELS[key],
        status: key === 'seating_positions' ? 'not_tested' : 'pending',
        supportingText: STAGE_SUPPORTING_TEXT[key],
        verdict: null,
        subStageLabel: null,
      })),
      activeStageKey: null,
    };
  }

  // Determine completion from phase progression
  const calibratingDone = !['reviewing', 'awaiting_stage2', 'calibrating', 'idle'].includes(phase);
  const subPositionsDone = phase === 'finalising';
  // Only a fully completed run marks comparing/preparing as completed.
  // Cancelled/error/stale runs freeze at the last active stage — comparing
  // and preparing never ran, so they remain pending.
  const runComplete = status === 'complete';
  const finalisingActive = phase === 'finalising';

  const groupedDelayOnly = stageVerdicts.phase_polarity === 'skipped' && stageVerdicts.gain === 'skipped';
  const activeStageKey = phase === 'calibrating' && groupedDelayOnly ? 'delays' : PHASE_TO_ACTIVE_STAGE[phase] ?? null;

  const stages = STAGE_KEYS.map((key) => {
    let stageStatus = 'pending';

    // Seating positions — Stage 11C not implemented, always not_tested
    if (key === 'seating_positions') {
      stageStatus = 'not_tested';
    }

    // Calibration stages (phase_polarity, delays, gain) — completed together
    // when the combined searchDelayPolarityTrim finishes. During the search,
    // only phase_polarity is shown as active (it's the first sub-stage of the
    // polarity→delay→trim combined search). Delays and gain remain pending
    // until the combined search completes, at which point all three are
    // marked completed together.
    if (key === 'phase_polarity') {
      if (calibratingDone) {
        stageStatus = 'completed';
      } else if (activeStageKey === 'phase_polarity') {
        stageStatus = 'active';
      }
    }
    if (key === 'delays' || key === 'gain') {
      if (calibratingDone) {
        stageStatus = 'completed';
      }
      // stays pending during calibrating — only phase_polarity is active
    }

    // Sub positions
    if (key === 'sub_positions') {
      if (subPositionsDone) {
        stageStatus = 'completed';
      } else if (activeStageKey === 'sub_positions') {
        stageStatus = 'active';
      }
    }

    // Comparing
    if (key === 'comparing') {
      if (runComplete) {
        stageStatus = 'completed';
      } else if (finalisingActive) {
        stageStatus = 'active';
      }
    }

    // Preparing
    if (key === 'preparing') {
      if (runComplete) {
        stageStatus = 'completed';
      } else if (finalisingActive) {
        stageStatus = 'active';
      }
    }

    if (groupedDelayOnly && (key === 'phase_polarity' || key === 'gain')) stageStatus = 'not_tested';
    if (key === 'delays' && activeStageKey === 'delays') stageStatus = 'active';
    if (stageVerdicts[key] === 'skipped') stageStatus = 'not_tested';

    // Show the actual grouped scan / canonical confirmation count.
    let subStageLabel = key === 'delays' && stageStatus === 'active'
      ? `${state.phaseLabel || 'Testing grouped delay options'} (${state.progressCurrent || 0} of ${state.progressTotal || 0})`
      : null;
    if (key === 'sub_positions' && stageStatus === 'active') {
      subStageLabel = SUB_POSITION_SUB_LABELS[phase]
        || SUB_POSITION_SUB_LABELS[positionSearchPhase]
        || null;
    }

    return {
      key,
      label: STAGE_LABELS[key],
      status: stageStatus,
      supportingText: STAGE_SUPPORTING_TEXT[key],
      verdict: stageVerdicts[key] || null,
      subStageLabel,
    };
  });

  return {
    headerLabel: 'Improving bass response',
    supportingText: 'Testing practical improvements before recommending physical changes.',
    stages,
    activeStageKey,
  };
}

/**
 * Format a stage verdict for display.
 *
 * @param {string|null|undefined} verdict - 'improvement' | 'no_improvement' | 'done' | null
 * @returns {string|null} display text, or null if no verdict
 */
export function formatStageVerdict(verdict) {
  if (verdict === 'improvement') return 'improvement found';
  if (verdict === 'no_improvement') return 'no material improvement';
  if (verdict === 'done') return 'done';
  if (verdict === 'incomplete') return 'evaluation incomplete';
  return null;
}