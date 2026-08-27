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

import { useMemo, useEffect, useRef } from 'react';
import { useCompletedBassAuthority, BASS_AUTHORITY_STATUS } from '@/components/room/bass/completedBassResultStore';
import { buildComplianceBassPresentation } from '@/components/room/bass/bassCompliancePresentation';
import { buildDesignRatingInput } from '@/components/report/technical/buildDesignRatingInput';
import {
  buildArtcousticDesignRatingAuthority,
  calculateRoomDesignRating,
  calculateScopedRoomDesignRating,
} from '@/components/report/technical/artcousticSystemDesignRating';
import { attachAuthoritativeP19ToSeatSnapshot, attachAuthoritativeP20ToSeatSnapshot } from '@/components/room/seatHudPresentation';
import { getPrimarySeats, getSecondarySeats } from '@/components/utils/seatPriorityAuthority';
import { hasMinimumSystemForAsdr } from '@/components/utils/minimumSystemForAsdr';
import { resolveP14TargetSelectionState } from '@/components/room/bass/p14TargetSelectionState';

// Map numeric RP22 parameter IDs to the string keys expected by buildDesignRatingInput
const SEAT_PARAM_KEY_MAP = {
  1: 'p1', 4: 'p4', 5: 'p5', 6: 'p6',
  9: 'p9', 10: 'p10', 16: 'p16', 17: 'p17',
  19: 'p19', 20: 'p20',
};

/**
 * Build a lightweight reportSeatHudById from analysisResult.perSeatRp22.
 * Maps numeric RP22 keys to string keys and computes rp23 viewing angles.
 *
 * Exported so the Visual Report (RP22ClientReport) can build the same
 * param authority for the RP22 seating-coverage floor without duplicating
 * the seat-HUD mapping logic.
 */
export function buildLightweightSeatHudById(seats, analysisResult, primarySeatingPosition, completedP19Result, completedP19Results, completedP20Results) {
  const out = {};
  const perSeatRp22 = analysisResult?.perSeatRp22;
  const perSeatRp23 = analysisResult?.perSeatRp23;
  const list = Array.isArray(seats) ? seats : [];

  for (const seat of list) {
    if (!seat?.id) continue;
    const seatData = perSeatRp22?.[seat.id];

    // Map numeric rp22 keys to string keys (empty if no seatData — P19/P20
    // are overlaid from the completed bass authority below regardless)
    const rp22 = {};
    const srcRp22 = seatData?.rp22 || {};
    for (const [numKey, strKey] of Object.entries(SEAT_PARAM_KEY_MAP)) {
      const metric = srcRp22[numKey];
      if (metric != null) rp22[strKey] = metric;
    }

    // RP23 viewing angle — consume the SAME canonical engine authority as
    // buildSeatHudSnapshot (analysisResult.perSeatRp23[seatId].angleDeg).
    // No local screen-geometry recalculation; no synthetic screen-plane fallback.
    // When the engine result is null/unavailable, SCREEN is excluded from ASDR.
    const engineRp23 = perSeatRp23?.[seat.id];
    const angleDeg = engineRp23 && Number.isFinite(engineRp23.angleDeg) ? Number(engineRp23.angleDeg) : null;

    let snapshot = { rp22, rp23: { angleDeg } };

    // Overlay authoritative P19/P20 from the SAME completed bass authority as
    // RP22Report (reusing the exact helpers from seatHudPresentation.js).
    // RSP coincidence uses the same 0.05 m tolerance — no isPrimary fallback.
    const seatX = Number(seat.x);
    const seatY = Number(seat.y);
    const isRspPosition = Number.isFinite(primarySeatingPosition?.x) && Number.isFinite(primarySeatingPosition?.y)
      && Number.isFinite(seatX) && Number.isFinite(seatY)
      && Math.hypot(seatX - primarySeatingPosition.x, seatY - primarySeatingPosition.y) <= 0.05;

    snapshot = attachAuthoritativeP19ToSeatSnapshot(snapshot, seat.id, isRspPosition, completedP19Result, completedP19Results);
    snapshot = attachAuthoritativeP20ToSeatSnapshot(snapshot, seat.id, completedP20Results);

    out[seat.id] = snapshot;
  }
  return out;
}

/**
 * Resolve the bass-authority readiness state for the current project.
 *
 * A rating is final only when the completed bass contract is AUTHORITATIVE
 * and the current/result fingerprints agree. While bass is LOADING or
 * UPDATING the rating is pending. Projects with no applicable bass
 * configuration (UNCALCULATED / BLOCKED) settle normally. ERROR settles
 * immediately so the rating never waits forever.
 *
 * @param {Object} completedBassAuthority
 * @returns {{ ready: boolean, pending: boolean, reason: string, fingerprint: string|null }}
 */
export function resolveBassReadiness(completedBassAuthority, bassApplicable = false, p14TargetSelected = true) {
  const status = completedBassAuthority?.authorityStatus;
  const currentFp = completedBassAuthority?.currentFingerprint || null;
  const resultFp = completedBassAuthority?.contract?.job?.resultFingerprint || null;
  // #3: BLOCKED/UNCALCULATED count as settled only after persisted-authority
  // hydration has completed and the current canonical design is genuinely
  // proven to have no applicable bass authority. During hydration, remain
  // pending so a provisional ASDR cannot publish before the persisted
  // authority arrives.
  const hydrationSettled = completedBassAuthority?.hydrationSettled === true;

  // P14 target not selected — distinct from "bass not yet computed". No
  // calculation has been requested. The rating is not pending calculation;
  // it is waiting for the user to select a target. The outcome (not ready)
  // is the same, but the reason lets the UI show "Select Bass Target to
  // complete design rating" instead of "Calculating bass analysis…".
  if (!p14TargetSelected) {
    return { ready: false, pending: false, reason: 'p14-target-not-selected', fingerprint: null };
  }

  if (status === BASS_AUTHORITY_STATUS.AUTHORITATIVE) {
    if (currentFp && resultFp && currentFp === resultFp) {
      return { ready: true, pending: false, reason: 'authoritative', fingerprint: currentFp };
    }
    return { ready: false, pending: true, reason: 'fingerprint-mismatch', fingerprint: currentFp };
  }
  // LIMITED: the requested P14 dBC is physically unattainable. The bass
  // analysis is terminal (not pending), but the design rating cannot be
  // completed at this target — P18/P19/P20 were not evaluated. Settled
  // (not pending) so the UI can show the capability shortfall rather than
  // an indefinite "calculating" state.
  if (status === BASS_AUTHORITY_STATUS.LIMITED) {
    return { ready: false, pending: false, reason: 'p14-capability-limited', fingerprint: currentFp };
  }
  if (status === BASS_AUTHORITY_STATUS.NOT_VERIFIED) {
    return { ready: false, pending: true, reason: 'not-verified', fingerprint: currentFp };
  }
  if (status === BASS_AUTHORITY_STATUS.LOADING) {
    return { ready: false, pending: true, reason: 'loading', fingerprint: currentFp };
  }
  if (status === BASS_AUTHORITY_STATUS.UPDATING) {
    return { ready: false, pending: true, reason: 'updating', fingerprint: currentFp };
  }
  if (status === BASS_AUTHORITY_STATUS.UNCALCULATED) {
    if (!hydrationSettled) {
      return { ready: false, pending: true, reason: 'hydration-loading', fingerprint: null };
    }
    // When the system has a subwoofer (bassApplicable), UNCALCULATED means
    // the bass analysis has not been computed yet — NOT that bass is
    // inapplicable. Keep pending so a provisional partial ASDR cannot
    // publish before the foreground optimiser produces the authoritative
    // result. Only settle when bass is genuinely inapplicable.
    if (bassApplicable) {
      return { ready: false, pending: true, reason: 'bass-not-yet-computed', fingerprint: null };
    }
    return { ready: true, pending: false, reason: 'no-applicable-bass', fingerprint: null };
  }
  if (status === BASS_AUTHORITY_STATUS.BLOCKED) {
    if (!hydrationSettled) {
      return { ready: false, pending: true, reason: 'hydration-loading', fingerprint: null };
    }
    return { ready: true, pending: false, reason: 'blocked', fingerprint: null };
  }
  if (status === BASS_AUTHORITY_STATUS.ERROR) {
    return { ready: true, pending: false, reason: 'error', fingerprint: currentFp };
  }
  return { ready: false, pending: true, reason: 'unknown', fingerprint: currentFp };
}

/**
 * @param {Object} params
 * @param {Object} params.appState
 * @param {Array}  params.seats
 * @param {Object} params.analysisResult
 * @param {Array}  params.placedSpeakers
 * @param {Object} params.stableDimensions
 * @param {Object} params.primarySeatingPosition
 * @param {string} params.projectId
 * @returns {{ status, displayPercentage, coveragePercent, bassReadiness, isPendingBass, retainedFromRefresh } | null}
 */
export function useAppDesignRating({
  appState,
  seats,
  analysisResult,
  placedSpeakers,
  stableDimensions,
  primarySeatingPosition,
  projectId,
  minimumSystemMet = true,
}) {
  const completedBassAuthority = useCompletedBassAuthority(projectId || 'free');
  const bassErrorMessage = completedBassAuthority?.errorMessage || null;

  const completedBassPresentation = useMemo(
    () => buildComplianceBassPresentation({ completedBassAuthority }, bassErrorMessage),
    [completedBassAuthority, bassErrorMessage]
  );

  // Same canonical P19/P20 sources as RP22Report.jsx
  const completedP19Result = completedBassAuthority?.contract?.productAnalysis?.parameters?.p19 || null;
  const completedP19Results = completedBassAuthority?.contract?.selectedCandidate?.perSeatP19Results || [];
  const completedP20Results = completedBassPresentation?.perSeatP20Results || [];

  const reportP12Mode = appState?.p12Mode || 'minimum';
  const reportP13Mode = appState?.splConfig?.p13Mode || 'minimum';
  const reportP14Mode = completedBassPresentation?.parameters?.p14?.targetBasis || appState?.splConfig?.p14Mode || 'minimum';
  const reportP18Mode = completedBassPresentation?.parameters?.p18?.targetBasis || appState?.splConfig?.p18Mode || 'minimum';

  const hasFrontWides = useMemo(() => {
    return (Array.isArray(placedSpeakers) ? placedSpeakers : []).some((s) => {
      const r = String(s?.role || '').toUpperCase();
      return r === 'LW' || r === 'RW';
    });
  }, [placedSpeakers]);

  const reportSeatHudById = useMemo(
    () => buildLightweightSeatHudById(seats, analysisResult, primarySeatingPosition, completedP19Result, completedP19Results, completedP20Results),
    [seats, analysisResult, primarySeatingPosition, completedP19Result, completedP19Results, completedP20Results]
  );

  const roomRating = useMemo(() => {
    if (!minimumSystemMet) return null;
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
        reportP18Mode,
        hasFrontWides,
        placedSpeakers,
      });
      const authority = buildArtcousticDesignRatingAuthority(input);
      const rating = calculateRoomDesignRating(authority);

      // Three scoped ratings from the SAME shared authority. All Seating is
      // the same authoritative result as the top-level rating. Primary and
      // Secondary average only their seat subsets. Secondary with zero seats
      // returns NOT_CONFIGURED. No second authority build; no duplicated
      // scoring logic — calculateScopedRoomDesignRating delegates to the same
      // internal core as calculateRoomDesignRating.
      const primarySeatIds = getPrimarySeats(seats).map((s) => s.id).filter(Boolean);
      const secondarySeatIds = getSecondarySeats(seats).map((s) => s.id).filter(Boolean);
      const scopedRatings = {
        primary: calculateScopedRoomDesignRating(authority, primarySeatIds),
        secondary: calculateScopedRoomDesignRating(authority, secondarySeatIds),
        all: rating,
      };

      // Stage B: expose per-seat levels + P12/P13 raw for RSP reach classification.
      // No formula change — reuses the authority's already-computed per-seat levels
      // and the analysisResult raw values. ASDR percentage/weights/thresholds are
      // unchanged.
      const seatLevels = {};
      for (const [key, param] of Object.entries(authority?.parameters || {})) {
        if (param?.scope === "seat" && param.seats) {
          const perSeat = {};
          for (const [seatId, sa] of Object.entries(param.seats)) {
            perSeat[seatId] = sa?.state === "scored" ? sa.level : null;
          }
          seatLevels[key] = perSeat;
        }
      }
      const p12RawDb = Number.isFinite(Number(analysisResult?.gradedParameters?.primary?.[12]?.value))
        ? Number(analysisResult.gradedParameters.primary[12].value)
        : null;
      const p13RawDb = Number.isFinite(Number(analysisResult?.gradedParameters?.primary?.[13]?.value))
        ? Number(analysisResult.gradedParameters.primary[13].value)
        : null;

      return { ...rating, seatLevels, p12RawDb, p13RawDb, scopedRatings };
    } catch (e) {
      console.warn('[useAppDesignRating] Failed to compute rating:', e);
      return null;
    }
  }, [seats, analysisResult, reportSeatHudById, completedBassAuthority, completedBassPresentation, reportP12Mode, reportP13Mode, reportP14Mode, reportP18Mode, hasFrontWides, placedSpeakers, minimumSystemMet]);

  // ── Bass readiness gate ──
  // A rating is final only when the completed bass contract is authoritative
  // and belongs to the current fingerprint. While pending, the partial
  // non-bass index must not be presented as final. If a verified
  // same-fingerprint rating already exists (e.g. a refresh is running over
  // the same design), it is retained until the new bass authority settles.
  //
  // bassApplicable: when the minimum 5.1 system is met (subwoofer present),
  // UNCALCULATED means the bass analysis has not been computed yet, not that
  // bass is inapplicable. This prevents a provisional partial ASDR from
  // publishing during the hydration window before the foreground optimiser
  // produces the authoritative result.
  //
  // projectIdMatch: the hydrated authority must belong to the active project.
  // A mismatch (e.g. during navigation between projects) keeps the rating
  // pending until the correct project's authority arrives.
  const expectedProjectKey = String(projectId || 'free');
  const projectIdMatch = String(completedBassAuthority?.projectId || 'free') === expectedProjectKey;
  const p14SelectionState = useMemo(
    () => resolveP14TargetSelectionState(appState?.splConfig),
    [appState?.splConfig?.selectedP14TargetBasis, appState?.splConfig?.selectedP14Level]
  );
  const bassReadiness = useMemo(
    () => {
      if (!projectIdMatch) {
        return { ready: false, pending: true, reason: 'project-id-mismatch', fingerprint: null };
      }
      return resolveBassReadiness(completedBassAuthority, minimumSystemMet, !p14SelectionState.noP14TargetSelected);
    },
    [completedBassAuthority, minimumSystemMet, projectIdMatch, p14SelectionState.noP14TargetSelected]
  );

  const lastFinalRatingRef = useRef(null);

  useEffect(() => {
    if (bassReadiness.ready && roomRating) {
      lastFinalRatingRef.current = {
        fingerprint: bassReadiness.fingerprint,
        rating: roomRating,
      };
    }
  }, [bassReadiness.ready, bassReadiness.fingerprint, roomRating]);

  const retainedFromRefresh = !bassReadiness.ready
    && lastFinalRatingRef.current?.fingerprint != null
    && bassReadiness.fingerprint != null
    && lastFinalRatingRef.current.fingerprint === bassReadiness.fingerprint;

  const effectiveRating = bassReadiness.ready
    ? roomRating
    : (retainedFromRefresh ? lastFinalRatingRef.current.rating : roomRating);

  if (!minimumSystemMet) return null;
  if (!effectiveRating) return null;

  const isP14TargetUnselected = bassReadiness.reason === 'p14-target-not-selected';

  return {
    ...effectiveRating,
    bassReadiness,
    isPendingBass: !bassReadiness.ready && !retainedFromRefresh && !isP14TargetUnselected,
    isP14TargetUnselected,
    retainedFromRefresh,
  };
}