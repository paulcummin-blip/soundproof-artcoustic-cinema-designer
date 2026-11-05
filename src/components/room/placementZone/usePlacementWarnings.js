/**
 * usePlacementWarnings
 * --------------------
 * React hook over the placement-zone warning store, plus a small helper that
 * evaluates one speaker against its applicable RP22 placement zone and records
 * the result. Producers call `evaluateAndRecordSpeaker` from user-initiated
 * drag / move paths; renderers read `usePlacementWarnings()`.
 */

import { useSyncExternalStore } from "react";
import {
  getWarnedSpeakerIds,
  recordPlacementEvaluation,
  subscribePlacementWarnings,
  clearAllPlacementWarnings,
} from "./placementWarningStore";
import { isSpeakerOutsidePlacementZone } from "./placementZoneAuthority";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

export function usePlacementWarnings() {
  return useSyncExternalStore(subscribePlacementWarnings, getWarnedSpeakerIds, getWarnedSpeakerIds);
}

/**
 * Evaluate a speaker against its placement zone and record the result so the
 * five-second temporary highlight starts, restarts or clears. A `null` verdict
 * (no applicable zone / indeterminate) records nothing.
 *
 * @param {Object} speaker - speaker with a position to evaluate
 * @param {Object} ctx     - evaluation context (see isSpeakerOutsidePlacementZone)
 */
export function evaluateAndRecordSpeaker(speaker, ctx) {
  const isOutside = isSpeakerOutsidePlacementZone(speaker, ctx);
  if (isOutside === null) return;
  const id = speaker?.id || getCanonicalRole(speaker?.role);
  if (!id) return;
  recordPlacementEvaluation(id, isOutside);
}

export { recordPlacementEvaluation, clearAllPlacementWarnings } from "./placementWarningStore";
export { isSpeakerOutsidePlacementZone, evaluatePlacementZones } from "./placementZoneAuthority";