// components/utils/rp22SeatResponseConsistency.js
// Helpers for computing seat-to-seat frequency response consistency metrics

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Compute screen variance metrics (P16)
 * Placeholder - returns null until full-band response data is available
 * @param {Object} seatResponses - Per-seat frequency response data
 * @param {String} rspSeatId - Reference seat ID (MLP)
 * @returns {Map} seatId => variance in dB
 */
export function computeScreenVarianceMetrics(seatResponses, rspSeatId) {
  // TODO: Implement when frequency response data is available
  // For now, return null to show "—" in HUD
  return new Map();
}

/**
 * Compute wide/surround/upper variance metrics (P17)
 * Placeholder - returns null until full-band response data is available
 * @param {Object} seatResponses - Per-seat frequency response data
 * @param {String} rspSeatId - Reference seat ID (MLP)
 * @returns {Map} seatId => variance in dB
 */
export function computeWideSurroundUpperVarianceMetrics(seatResponses, rspSeatId) {
  // TODO: Implement when frequency response data is available
  return new Map();
}

/**
 * Compute bass variance metrics (P20)
 * Placeholder - returns null until bass response data is available
 * @param {Object} seatBassResponses - Per-seat bass frequency response data
 * @param {String} rspSeatId - Reference seat ID (MLP)
 * @param {Number} transitionHz - Transition frequency (default 200 Hz)
 * @returns {Map} seatId => variance in dB
 */
export function computeBassVarianceMetrics(seatBassResponses, rspSeatId, transitionHz = 200) {
  // TODO: Implement when bass simulation data is integrated
  return new Map();
}