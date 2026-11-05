/**
 * evaluateAndRecordAll
 * ---------------------
 * Evaluate a complete set of speakers against their applicable RP22 placement
 * zones and record every verdict in the placement-warning store. Used by the
 * RoomVisualisation drag-tick effect and the speaker-position commit so that a
 * single placement change highlights ALL speakers currently outside their
 * zones — not only the one being dragged.
 *
 * Speakers with no applicable zone (indeterminate) record nothing, so a null
 * verdict never clears a warning that another speaker's evaluation owns.
 */
import { evaluatePlacementZones } from "./placementZoneAuthority";
import { recordPlacementEvaluation } from "./placementWarningStore";
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

export function evaluateAndRecordAll(speakers, ctx) {
  const list = Array.isArray(speakers) ? speakers : [];
  const outsideIds = evaluatePlacementZones({ speakers: list, ...ctx });
  for (const s of list) {
    const id = s.id || getCanonicalRole(s.role);
    if (!id) continue;
    // Only record a definitive verdict. A speaker that is inside its zone
    // (outsideIds.has(id) === false) clears immediately; a speaker with no
    // applicable zone is skipped so it never interferes with another's warning.
    recordPlacementEvaluation(id, outsideIds.has(id));
  }
  return outsideIds;
}