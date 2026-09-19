/**
 * buildViewingAuthority.js  (Stage 2A — fragile multi-key probe removed)
 * --------------------------------
 * Layer 1 — RP23 viewing geometry sub-authority.
 *
 * CHANGED in Stage 2A: The fragile multi-key probe
 *   (analysisResult.viewing || analysisResult.rp23 || analysisResult.viewingAngles)
 * has been REMOVED. The canonical RP23 source is analysisResult.perSeatRp23,
 * the SAME source consumed by buildLightweightSeatHudById in useAppDesignRating.
 *
 * Pure function. No GPT. No side effects. No independent RP23 recalculation.
 */

import { CONFIDENCE, withConfidence, notCalculated, SOURCE } from './confidence';
import { rp23LevelForAngleDeg } from '@/components/utils/viewingAngleUtils';

/**
 * @param {Object} analysisResult — from useRP22AnalysisEngine (must contain perSeatRp23)
 * @param {Array} seats — canonical seating positions
 */
export function buildViewingAuthority(analysisResult, seats) {
  const perSeatRp23 = analysisResult?.perSeatRp23;
  const seatList = Array.isArray(seats) ? seats : [];

  const perSeat = seatList
    .filter((s) => s && s.id)
    .map((seat) => {
      const engineRp23 = perSeatRp23?.[seat.id];
      const angleDeg = engineRp23 && Number.isFinite(engineRp23.angleDeg) ? Number(engineRp23.angleDeg) : null;
      const level = angleDeg != null ? rp23LevelForAngleDeg(angleDeg) : null;
      return {
        seat_id: seat.id,
        horizontal_angle_deg: angleDeg,
        rp23_level: level,
      };
    });

  const validAngles = perSeat.filter((s) => s.horizontal_angle_deg != null);

  if (validAngles.length === 0) {
    const nc = notCalculated('Viewing angles not calculated.');
    return {
      available: false,
      per_seat: perSeat,
      summary: nc.statement,
      confidence: nc.confidence,
      source: nc.source,
    };
  }

  const angles = validAngles.map((s) => s.horizontal_angle_deg);
  const minH = Math.min(...angles);
  const maxH = Math.max(...angles);

  let statement = `Viewing angles calculated for ${validAngles.length} seat${validAngles.length !== 1 ? 's' : ''}.`;
  statement += ` Horizontal viewing angle ranges from ${minH.toFixed(0)}° to ${maxH.toFixed(0)}°.`;

  const summary = withConfidence(statement, CONFIDENCE.COMPUTED_GEOMETRIC, SOURCE.GEOMETRIC_CALCULATION);

  return {
    available: true,
    per_seat: perSeat,
    summary: summary.statement,
    confidence: summary.confidence,
    source: summary.source,
  };
}