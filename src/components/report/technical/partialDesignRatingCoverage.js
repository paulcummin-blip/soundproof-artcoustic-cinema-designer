/**
 * partialDesignRatingCoverage.js
 * --------------------------------
 * Pure coverage helper for the Live Partial Artcoustic System Design Rating.
 *
 * The completed Design Rating (calculateRoomDesignRating / calculateScoped-
 * RoomDesignRating) already scores only the parameters that have current
 * valid evidence, skipping provisional/missing and genuine N/A results. This
 * module does NOT re-score anything: it reads the SAME authority map produced
 * by buildArtcousticDesignRatingAuthority and reports, for a given seating
 * scope, how much of the full APPLICABLE parameter set is currently assessed
 * versus still unavailable, plus which parameter groups (and specifically
 * bass) remain outstanding.
 *
 * "Applicable" = a parameter that WOULD be scored in a complete design for
 * this configuration: scored now, or provisional (applicable but not yet
 * calculated). Genuine N/A parameters (no overhead layer, no front wides, a
 * verified topology N/A) and V1-excluded assumption parameters (P8) are NOT
 * applicable and never count against coverage.
 *
 * Pure: no React, no UI, no side effects. Reuses the existing PARAM_WEIGHTS,
 * V1_EXCLUDED_PARAMS and BASS_PARAMS from the rating core, and the existing
 * section membership from designRatingSectionForParameterKey, so coverage can
 * never disagree with the section pills.
 */

import {
  PARAM_WEIGHTS,
  V1_EXCLUDED_PARAMS,
} from "./artcousticSystemDesignRating";
import { designRatingSectionForParameterKey } from "./designRatingPresentation";

/** Bass-authority parameters — singled out in the partial summary. */
const BASS_PARAM_KEYS = Object.freeze(new Set(["p14", "p18", "p19", "p20"]));

/**
 * Summarise partial coverage for one seating scope.
 *
 * @param {Object} authority - Authority map from buildArtcousticDesignRatingAuthority
 * @param {string[]} scopeSeatIds - Seat IDs in this scope (Primary / Secondary / All)
 * @returns {{
 *   status: "PARTIAL"|"NOT_ASSESSED",
 *   assessedWeight: number,
 *   fullApplicableWeight: number,
 *   coveragePercent: number,
 *   assessedCount: number,
 *   fullApplicableCount: number,
 *   assessedParameterKeys: string[],
 *   unavailableParameterKeys: string[],
 *   unavailableGroups: Object<string, string[]>,
 *   bassUnavailable: boolean,
 *   bassUnavailableKeys: string[],
 * }}
 */
export function summarisePartialDesignRating(authority, scopeSeatIds) {
  const seatIdSet = new Set(Array.isArray(scopeSeatIds) ? scopeSeatIds : []);
  let assessedWeight = 0;
  let fullApplicableWeight = 0;
  let assessedCount = 0;
  let fullApplicableCount = 0;
  const assessedParameterKeys = [];
  const unavailableParameterKeys = [];

  for (const key of Object.keys(PARAM_WEIGHTS)) {
    if (V1_EXCLUDED_PARAMS.has(key)) continue;
    const param = authority?.parameters?.[key];
    if (!param) continue;
    const weight = param.effectiveWeight ?? PARAM_WEIGHTS[key];

    if (param.scope === "room") {
      // Genuine N/A room parameters are not applicable to this design.
      if (param.state === "na") continue;
      fullApplicableWeight += weight;
      fullApplicableCount += 1;
      if (param.state === "scored") {
        assessedWeight += weight;
        assessedCount += 1;
        assessedParameterKeys.push(key);
      } else {
        unavailableParameterKeys.push(key);
      }
      continue;
    }

    // Seat-scope: a parameter is applicable to this scope unless every seat
    // in the scope is genuine N/A for it. It is assessed when at least one
    // eligible seat in the scope is scored.
    const scopedSeatIds = (authority?.seatIds || []).filter((id) => seatIdSet.has(id));
    let allNaInScope = true;
    let anyScoredInScope = false;
    for (const id of scopedSeatIds) {
      const sa = param.seats?.[id];
      if (!sa || sa.state === "na") continue;
      allNaInScope = false;
      if (sa.state === "scored") anyScoredInScope = true;
    }
    if (allNaInScope) continue; // N/A for this scope — not applicable
    fullApplicableWeight += weight;
    fullApplicableCount += 1;
    if (anyScoredInScope) {
      assessedWeight += weight;
      assessedCount += 1;
      assessedParameterKeys.push(key);
    } else {
      unavailableParameterKeys.push(key);
    }
  }

  const coveragePercent = fullApplicableWeight > 0
    ? (assessedWeight / fullApplicableWeight) * 100
    : 0;

  const unavailableGroups = {};
  const bassUnavailableKeys = [];
  for (const key of unavailableParameterKeys) {
    const section = designRatingSectionForParameterKey(key);
    if (section) {
      if (!unavailableGroups[section]) unavailableGroups[section] = [];
      unavailableGroups[section].push(key);
    }
    if (BASS_PARAM_KEYS.has(key)) bassUnavailableKeys.push(key);
  }

  return {
    status: assessedWeight > 0 ? "PARTIAL" : "NOT_ASSESSED",
    assessedWeight,
    fullApplicableWeight,
    coveragePercent,
    assessedCount,
    fullApplicableCount,
    assessedParameterKeys,
    unavailableParameterKeys,
    unavailableGroups,
    bassUnavailable: bassUnavailableKeys.length > 0,
    bassUnavailableKeys,
  };
}