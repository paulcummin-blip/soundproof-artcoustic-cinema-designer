/**
 * useAppDesignRating.js
 * --------------------------------
 * Hook that computes the Artcoustic System Design Rating for the Room Designer app.
 *
 * Uses ONLY the approved Stage B adapter:
 *   buildArtcousticDesignRatingAuthority(...)
 *   calculateRoomDesignRating(...)
 *
 * The UI layer supplies ONLY existing canonical authority inputs.
 * No thresholds, FAIL rules, or bass scoring are reimplemented here.
 *
 * Builds a lightweight reportSeatHudById from analysisResult.perSeatRp22
 * + computed viewing angles, avoiding the expensive buildSeatHudSnapshot call.
 */

import { useMemo } from 'react';
import { useCompletedBassAuthority } from '@/components/room/bass/completedBassResultStore';
import { buildComplianceBassPresentation } from '@/components/room/bass/bassCompliancePresentation';
import { buildDesignRatingInput } from '@/components/report/technical/buildDesignRatingInput';
import {
  buildArtcousticDesignRatingAuthority,
  calculateRoomDesignRating,
} from '@/components/report/technical/artcousticSystemDesignRating';
import { calculateViewingAngle } from '@/components/utils/viewingAngleUtils';

// Map numeric RP22 parameter IDs to the string keys expected by buildDesignRatingInput
const SEAT_PARAM_KEY_MAP = {
  1: 'p1', 4: 'p4', 5: 'p5', 6: 'p6',
  9: 'p9', 10: 'p10', 16: 'p16', 17: 'p17',
  19: 'p19', 20: 'p20',
};

/**
 * Build a lightweight reportSeatHudById from analysisResult.perSeatRp22.
 * Maps numeric RP22 keys to string keys and computes rp23 viewing angles.
 */
function buildLightweightSeatHudById(seats, analysisResult, screen, screenFrontPlaneM, screenVisibleWidthInches) {
  const out = {};
  const perSeatRp22 = analysisResult?.perSeatRp22;
  if (!perSeatRp22 || typeof perSeatRp22 !== 'object') return out;

  const list = Array.isArray(seats) ? seats : [];
  for (const seat of list) {
    if (!seat?.id) continue;
    const seatData = perSeatRp22[seat.id];
    if (!seatData) continue;

    // Map numeric rp22 keys to string keys
    const rp22 = {};
    const srcRp22 = seatData.rp22 || {};
    for (const [numKey, strKey] of Object.entries(SEAT_PARAM_KEY_MAP)) {
      const metric = srcRp22[numKey];
      if (metric != null) rp22[strKey] = metric;
    }

    // Compute rp23 viewing angle
    const angleDeg = calculateViewingAngle(
      { x: Number(seat.x) || 0, y: Number(seat.y) || 0 },
      screenVisibleWidthInches,
      screen?.aspectRatio || '16:9',
      { y: screenFrontPlaneM }
    );

    out[seat.id] = { rp22, rp23: { angleDeg } };
  }
  return out;
}

/**
 * @param {Object} params
 * @param {Object} params.appState
 * @param {Array}  params.seats
 * @param {Object} params.analysisResult
 * @param {Array}  params.placedSpeakers
 * @param {Object} params.stableDimensions
 * @param {Object} params.screen
 * @param {Object} params.primarySeatingPosition
 * @param {string|number} params.screenVisibleWidthInches
 * @param {number} params.screenFrontPlaneM
 * @param {string} params.projectId
 * @returns {{ status, displayPercentage, coveragePercent } | null}
 */
export function useAppDesignRating({
  appState,
  seats,
  analysisResult,
  placedSpeakers,
  stableDimensions,
  screen,
  primarySeatingPosition,
  screenVisibleWidthInches,
  screenFrontPlaneM,
  projectId,
}) {
  const completedBassAuthority = useCompletedBassAuthority(projectId || 'free');
  const bassErrorMessage = completedBassAuthority?.errorMessage || null;

  const completedBassPresentation = useMemo(
    () => buildComplianceBassPresentation({ completedBassAuthority }, bassErrorMessage),
    [completedBassAuthority, bassErrorMessage]
  );

  const reportP12Mode = appState?.p12Mode || 'minimum';
  const reportP13Mode = appState?.splConfig?.p13Mode || 'minimum';
  const reportP14Mode = completedBassPresentation?.parameters?.p14?.targetBasis || appState?.splConfig?.p14Mode || 'minimum';

  const hasFrontWides = useMemo(() => {
    return (Array.isArray(placedSpeakers) ? placedSpeakers : []).some((s) => {
      const r = String(s?.role || '').toUpperCase();
      return r === 'LW' || r === 'RW';
    });
  }, [placedSpeakers]);

  const reportSeatHudById = useMemo(
    () => buildLightweightSeatHudById(seats, analysisResult, screen, screenFrontPlaneM, screenVisibleWidthInches),
    [seats, analysisResult, screen, screenFrontPlaneM, screenVisibleWidthInches]
  );

  const roomRating = useMemo(() => {
    try {
      const input = buildDesignRatingInput({
        seats,
        analysisResult,
        reportSeatHudById,
        completedBassAuthority,
        completedBassPresentation,
        reportP12Mode,
        reportP13Mode,
        reportP14Mode,
        hasFrontWides,
        placedSpeakers,
      });
      const authority = buildArtcousticDesignRatingAuthority(input);
      return calculateRoomDesignRating(authority);
    } catch (e) {
      console.warn('[useAppDesignRating] Failed to compute rating:', e);
      return null;
    }
  }, [seats, analysisResult, reportSeatHudById, completedBassAuthority, completedBassPresentation, reportP12Mode, reportP13Mode, reportP14Mode, hasFrontWides, placedSpeakers]);

  return roomRating;
}