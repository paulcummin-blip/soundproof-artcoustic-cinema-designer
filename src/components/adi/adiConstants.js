// adiConstants.js
// ---------------------------------------------------------------------------
// Artcoustic Design Intelligence (ADI) — Engineering Decision Model constants.
//
// ADI is the reasoning layer. The optimiser is the execution layer.
// RP22 is the reporting layer. The authority model is unchanged.
// ---------------------------------------------------------------------------

// ── EQ Correctability Classes ─────────────────────────────────────────────
//
// ADI distinguishes three classes of response feature.
// Each class determines whether EQ is permitted and whether physical
// changes are recommended.

export const CORRECTABILITY_CLASS = {
  // Class 1: Absolute cancellation.
  // Deep null with no usable energy remaining. Do not boost.
  // Recommend seating, movement, or additional subwoofers.
  ABSOLUTE_CANCELLATION: 'absolute_cancellation',

  // Class 2: Recoverable feature.
  // Usable energy remains and the correction is compatible with the
  // selected design objectives. Allow constrained EQ.
  RECOVERABLE: 'recoverable',

  // Class 3: Capability-limited feature.
  // Correction is mathematically possible but prevents the design
  // achieving the selected capability or extension objective.
  // Explain the engineering trade-off rather than automatically applying.
  CAPABILITY_LIMITED: 'capability_limited',
};

// ── Engineering Constraints (hard gates) ──────────────────────────────────
//
// Every candidate must pass ALL hard gates before ranking.
// Candidates that fail any gate are rejected — never ranked.

export const ENGINEERING_CONSTRAINT = {
  CAPABILITY: 'capability',                     // P14 achieved >= P14 target
  EXTENSION: 'extension',                         // P18 achieved >= P18 target
  PROTECTED_SEAT_REGRESSION: 'protected_seat_regression', // no primary seat level regression
  TEMPORAL_BEHAVIOUR: 'temporal_behaviour',       // no new significant problems
  ROBUSTNESS: 'robustness',                       // no muted subs, no output failure
};

// ── Engineering Dominance Criteria ──────────────────────────────────────
//
// Ranking uses engineering dominance, NOT a single weighted score.
// Criteria are evaluated in this exact order. The first criterion that
// differs between two candidates determines the winner.

export const DOMINANCE_CRITERION = {
  PHYSICALLY_CORRECT: 'physically_correct', // addresses the diagnosed physical cause
  SIMPLER: 'simpler',                         // fewer changes (calibration < physical < specification)
  MORE_ROBUST: 'more_robust',                 // less sensitive to small changes
  LESS_INVASIVE: 'less_invasive',             // fewer subwoofers moved/added
  RP22_RESULT: 'rp22_result',                 // better P19/P20 outcomes (last tiebreak only)
};

// ── ADI Outcome Types ────────────────────────────────────────────────────

export const ADI_OUTCOME = {
  RECOMMENDATION: 'recommendation',
  TRADE_OFF: 'trade_off',
  NO_FURTHER_ENGINEERING: 'no_further_engineering',
  NO_FURTHER_EQ: 'no_further_eq',
};

// ── Engineering Lever Hierarchy ──────────────────────────────────────────
//
// Always evaluate in this order. Never recommend additional hardware
// if a materially equivalent result can be achieved using calibration
// or physical adjustment.

export const LEVER_HIERARCHY_ORDER = {
  CALIBRATION: 1,   // Gain, Delay, Polarity, Phase
  PHYSICAL: 2,      // Seating, Subwoofer movement
  SPECIFICATION: 3, // Additional subwoofers, Different subwoofers
};

// ── Configurable Materiality Thresholds ─────────────────────────────────
//
// Materiality thresholds remain empirical and configurable.
// Do not hard-code 0.5 dB. These defaults match the existing engine
// but can be overridden by passing a thresholds object.

export const DEFAULT_MATERIALITY_THRESHOLDS = {
  levelImprovement: 1,            // any level increase is material
  withinLevelDeviationDb: 1.0,   // >= 1.0 dB within same level
  severeNullReductionDb: 3.0,    // >= 3.0 dB null reduction
  newProblemThresholdDb: 1.0,    // new problem if deviation worsens > this
  rawWorseningThresholdDb: 1.0,  // same-level raw worsening for trade-off
  absoluteCancellationDb: 6.0,   // deviation > this = absolute cancellation
  capabilityHeadroomMarginDb: 1.0, // headroom margin for capability-limited class
};