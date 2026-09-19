/**
 * buildViewingAuthority.js
 * --------------------------------
 * Layer 1 — RP23 viewing geometry sub-authority.
 * Exposes screen viewing angles and RP23 compliance per seat.
 * Pure function. No GPT. No side effects.
 *
 * Inputs:
 *   project         — Project entity (for screen dims, seating)
 *   analysisResult  — From useRP22AnalysisEngine (may contain viewing angles)
 *   seats           — Array of seating positions
 */

import { CONFIDENCE, withConfidence, notCalculated, SOURCE } from './confidence';

function extractViewingAngles(analysisResult, seats) {
  // The analysis result may contain per-seat viewing angles under various keys
  // depending on the engine version. Check the most common locations.
  const viewingData = analysisResult?.viewing || analysisResult?.rp23 || analysisResult?.viewingAngles || null;
  if (!viewingData) return null;

  // If viewing data is an array of per-seat results
  if (Array.isArray(viewingData)) {
    return viewingData.map((seat) => ({
      seat_id: seat.seatId || seat.id || null,
      horizontal_angle_deg: Number.isFinite(seat.horizontalAngle) ? Number(seat.horizontalAngle) : (Number.isFinite(seat.horizontal_angle_deg) ? Number(seat.horizontal_angle_deg) : null),
      vertical_angle_deg: Number.isFinite(seat.verticalAngle) ? Number(seat.verticalAngle) : (Number.isFinite(seat.vertical_angle_deg) ? Number(seat.vertical_angle_deg) : null),
      rp23_level: seat.rp23Level || seat.rp23_level || null,
    }));
  }

  // If viewing data is an object keyed by seat ID
  const seatIds = seats?.map((s) => s.id).filter(Boolean) || [];
  if (seatIds.length > 0 && typeof viewingData === 'object') {
    return seatIds.map((seatId) => {
      const seatData = viewingData[seatId];
      if (!seatData) return { seat_id: seatId, horizontal_angle_deg: null, vertical_angle_deg: null, rp23_level: null };
      return {
        seat_id: seatId,
        horizontal_angle_deg: Number.isFinite(seatData.horizontalAngle) ? Number(seatData.horizontalAngle) : (Number.isFinite(seatData.horizontal_angle_deg) ? Number(seatData.horizontal_angle_deg) : null),
        vertical_angle_deg: Number.isFinite(seatData.verticalAngle) ? Number(seatData.verticalAngle) : (Number.isFinite(seatData.vertical_angle_deg) ? Number(seatData.vertical_angle_deg) : null),
        rp23_level: seatData.rp23Level || seatData.rp23_level || null,
      };
    });
  }

  return null;
}

function buildViewingSummary(perSeatAngles) {
  if (!perSeatAngles || perSeatAngles.length === 0) {
    return notCalculated('Viewing angles not calculated.');
  }

  const validAngles = perSeatAngles.filter((s) => s.horizontal_angle_deg != null || s.vertical_angle_deg != null);
  if (validAngles.length === 0) {
    return notCalculated('Viewing angles not calculated.');
  }

  const horizontalAngles = validAngles.map((s) => s.horizontal_angle_deg).filter(Number.isFinite);
  const verticalAngles = validAngles.map((s) => s.vertical_angle_deg).filter(Number.isFinite);

  const minH = horizontalAngles.length > 0 ? Math.min(...horizontalAngles) : null;
  const maxH = horizontalAngles.length > 0 ? Math.max(...horizontalAngles) : null;
  const minV = verticalAngles.length > 0 ? Math.min(...verticalAngles) : null;
  const maxV = verticalAngles.length > 0 ? Math.max(...verticalAngles) : null;

  let statement = `Viewing angles calculated for ${validAngles.length} seat${validAngles.length !== 1 ? 's' : ''}.`;
  if (minH != null && maxH != null) {
    statement += ` Horizontal viewing angle ranges from ${minH.toFixed(0)}° to ${maxH.toFixed(0)}°.`;
  }
  if (minV != null && maxV != null) {
    statement += ` Vertical viewing angle ranges from ${minV.toFixed(0)}° to ${maxV.toFixed(0)}°.`;
  }

  return withConfidence(statement, CONFIDENCE.COMPUTED_GEOMETRIC, SOURCE.GEOMETRIC_CALCULATION);
}

export function buildViewingAuthority(project, analysisResult, seats) {
  const perSeatAngles = extractViewingAngles(analysisResult, seats);
  const summary = buildViewingSummary(perSeatAngles);

  return {
    available: perSeatAngles != null,
    per_seat: perSeatAngles || [],
    summary: summary.statement,
    confidence: summary.confidence,
    source: summary.source,
  };
}