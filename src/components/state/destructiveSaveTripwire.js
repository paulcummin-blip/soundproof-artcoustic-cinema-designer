/**
 * destructiveSaveTripwire.js
 * --------------------------
 * Secondary safety guard before writing an existing populated project.
 *
 * Compares the hydrated project's structural counts with the outgoing
 * payload. If several major populated design groups suddenly collapse to
 * defaults/empty in one save, the save is blocked.
 *
 * This is a SECONDARY protection — it does not replace the hydration
 * authority gate. It catches the case where hydration succeeded but
 * state was subsequently wiped (e.g. by a stale closure or race condition).
 *
 * Manual intentional resets must use an explicit intentional-reset path
 * rather than looking identical to an accidental hydration wipe.
 */

/**
 * @typedef {Object} StructuralCounts
 * @property {number} speakers
 * @property {number} subs
 * @property {number} roomElements
 * @property {number} seatingPositions
 * @property {string} dolbyConfig
 */

/**
 * Check whether an outgoing payload looks like a destructive wipe of a
 * previously-populated project.
 *
 * @param {StructuralCounts|null} hydratedCounts - Snapshot from the hydrated DB record.
 * @param {object} outgoingData - The serialized payload about to be written.
 * @returns {{destructive: boolean, reason: string|null}}
 */
export function checkDestructiveSave(hydratedCounts, outgoingData) {
  if (!hydratedCounts) return { destructive: false, reason: null };

  const outSpeakers = Array.isArray(outgoingData?.selected_speakers)
    ? outgoingData.selected_speakers.length
    : 0;
  const outSubs = Array.isArray(outgoingData?.subwooferInstances)
    ? outgoingData.subwooferInstances.length
    : 0;
  const outElements = Array.isArray(outgoingData?.room_elements)
    ? outgoingData.room_elements.length
    : 0;
  const outFormat = outgoingData?.dolby_config || "5.1";

  const exSpeakers = hydratedCounts.speakers || 0;
  const exSubs = hydratedCounts.subs || 0;
  const exElements = hydratedCounts.roomElements || 0;
  const exFormat = hydratedCounts.dolbyConfig || "5.1";

  const collapsedGroups = [];

  // Speakers: existing > 0 → outgoing = 0
  if (exSpeakers > 0 && outSpeakers === 0) {
    collapsedGroups.push(`speakers ${exSpeakers}→0`);
  }

  // Subs: existing > 0 → outgoing = 0
  if (exSubs > 0 && outSubs === 0) {
    collapsedGroups.push(`subs ${exSubs}→0`);
  }

  // Room elements: existing > 0 → outgoing = 0
  if (exElements > 0 && outElements === 0) {
    collapsedGroups.push(`roomElements ${exElements}→0`);
  }

  // System format: non-default → default 5.1
  if (exFormat !== "5.1" && outFormat === "5.1") {
    collapsedGroups.push(`format ${exFormat}→5.1`);
  }

  // Block if 2+ major groups collapse simultaneously.
  // A single-group change (e.g. deleting all subs) is allowed — it's a
  // legitimate edit. 2+ groups collapsing at once looks like a wipe.
  if (collapsedGroups.length >= 2) {
    return {
      destructive: true,
      reason: `DESTRUCTIVE_SAVE_BLOCKED: ${collapsedGroups.join(", ")}`,
    };
  }

  return { destructive: false, reason: null };
}