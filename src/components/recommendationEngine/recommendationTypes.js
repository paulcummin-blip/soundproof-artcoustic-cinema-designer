// recommendationTypes.js
// ---------------------------------------------------------------------------
// Type constants and schema version for the Recommendation Engine.
//
// The Recommendation Engine is a pure reasoning layer that consumes
// authoritative optimiser results and produces a structured recommendation
// object. It never recalculates engineering — it interprets existing results.
// ---------------------------------------------------------------------------

export const RECOMMENDATION_SCHEMA_VERSION = 1;

// Recommendation type — the first-class outcome of the engine.
export const RECOMMENDATION_TYPE = {
  RECOMMENDATION: 'recommendation',
  NO_RECOMMENDATION: 'no_recommendation',
  TRADE_OFF_AVAILABLE: 'trade_off_available',
};

// Assessment rating — engineering assessment of the current design.
export const ASSESSMENT_RATING = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  ACCEPTABLE: 'acceptable',
  LIMITED: 'limited',
  POOR: 'poor',
};

// Problem type — the limiting engineering issue.
export const PROBLEM_TYPE = {
  SEAT_CONSISTENCY: 'seat_consistency',
  RESPONSE_SMOOTHNESS: 'response_smoothness',
  EXTENSION: 'extension',
  CAPABILITY: 'capability',
  ROOM_MODE: 'room_mode',
  LOCAL_CANCELLATION: 'local_cancellation',
  NONE: null,
};

// Lever class — the engineering category of an action.
export const LEVER_CLASS = {
  CALIBRATION: 'calibration',
  PHYSICAL: 'physical',
  SPECIFICATION: 'specification',
};

// Individual lever identifiers.
export const LEVER = {
  GAIN: 'gain',
  DELAY: 'delay',
  PHASE: 'phase',
  POLARITY: 'polarity',
  EQ: 'eq',
  MOVE_SUBWOOFER: 'move_subwoofer',
  ROTATE_SUBWOOFER: 'rotate_subwoofer',
  MOVE_SEATING: 'move_seating',
  ADDITIONAL_SUBWOOFER: 'additional_subwoofer',
  DIFFERENT_SUBWOOFER: 'different_subwoofer',
  DIFFERENT_LAYOUT: 'different_layout',
};

// Intervention type — maps to the optimiser's candidate classification.
export const INTERVENTION_TYPE = {
  CALIBRATION: 'calibration',
  POSITION: 'position',
  SEATING: 'seating',
  COMBINED: 'combined',
  SPECIFICATION: 'specification',
};

// Confidence level — recommendation robustness (not prediction confidence).
export const CONFIDENCE_LEVEL = {
  VERY_HIGH: 'very_high',
  HIGH: 'high',
  MODERATE: 'moderate',
  LOW: 'low',
};

// Why-lost reason — why an alternative was not selected.
export const WHY_LOST = {
  ENGINEERING_INFERIOR: 'engineering-inferior',
  PROTECTED_OBJECTIVE_VIOLATION: 'protected-objective-violation',
  PRACTICALITY: 'practicality',
  EQUIVALENCE_TIE: 'equivalence-tie',
  SAFETY_REJECTED: 'safety-rejected',
  BELOW_MATERIALITY: 'below-materiality',
};

// Protected objective — the designer's active design objective.
export const PROTECTED_OBJECTIVE = {
  REFERENCE_PERFORMANCE: 'reference_performance',
  PROTECT_PRIMARY_SEATING: 'protect_primary_seating',
  BALANCED_CINEMA: 'balanced_cinema',
  WHOLE_ROOM_CONSISTENCY: 'whole_room_consistency',
};

// Expected physical effect identifiers.
export const EXPECTED_EFFECT = {
  REDUCED_SEAT_TO_SEAT_VARIATION: 'reduced_seat_to_seat_variation',
  IMPROVED_MODAL_BALANCE: 'improved_modal_balance',
  IMPROVED_RESPONSE_SMOOTHNESS: 'improved_response_smoothness',
  INCREASED_EXTENSION: 'increased_extension',
  INCREASED_HEADROOM: 'increased_headroom',
  IMPROVED_PRIMARY_SEAT_RESPONSE: 'improved_primary_seat_response',
  ELIMINATED_FAILING_SEAT: 'eliminated_failing_seat',
};