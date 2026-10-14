/**
 * speakerRoleQuantities.js
 * ------------------------
 * HOW MANY PHYSICAL LOUDSPEAKERS THE DESIGN HOLDS AT EACH PROPOSAL ROLE.
 *
 * The count is read from the version's own placed speakers, with the SAME
 * canonical role map and the same installed-model rule the Current Speaker
 * Design schedule counts with (src/components/report/speakerDesign/speakerDesignRows.js).
 * The proposal's Qty column and the version's equipment schedule therefore count
 * the same loudspeakers at the same positions — the schedule is the checklist the
 * proposal states.
 *
 * The screen stage follows the schedule's own centre rule:
 *   - a centre that is its own model is counted at the centre, and the screen
 *     channels count without it;
 *   - a stage whose centre shares the sides' model is counted whole (left, centre
 *     and right), because that is one stated LCR position.
 *
 * Nothing is calculated, graded or inferred. A role the design does not hold
 * counts zero and is never invented, and a loudspeaker that is not installed
 * (model "off" or "none") is not counted.
 *
 * Pure: no React, no reads, no writes.
 */

import { getCanonicalRole } from '@/components/utils/surroundRoleMap';

/** The canonical role, with any numeric suffix removed ("TFL1" → "TFL"). */
const canon = (role) => getCanonicalRole(role).replace(/\d+$/, '');

/** The roles that make up the screen stage. */
const SCREEN_STAGE_ROLES = new Set(['FL', 'FR', 'FC', 'FCL', 'FCR']);

/** The roles the centre channel occupies. */
const CENTRE_ROLES = new Set(['FC', 'FCL', 'FCR']);

const SIDE_ROLES = new Set(['SL', 'SR']);
const REAR_ROLES = new Set(['SBL', 'SBR']);
const WIDE_ROLES = new Set(['LW', 'RW']);
const OVERHEAD_ROLES = new Set([
  'TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR', 'TBL', 'TBR',
  'UFL', 'UFR', 'UBL', 'UBR',
]);

/** An installed model is a real loudspeaker: "off" and "none" are absence. */
const isInstalled = (value) => {
  const model = String(value ?? '').trim().toLowerCase();
  return !!model && model !== 'off' && model !== 'none';
};

/**
 * The physical loudspeaker count per proposal role.
 *
 * @param {Array} [placedSpeakers] — the version's placed speakers
 * @returns {{lcr: number, centre_soundbar: number, surround: number,
 *   rear_surround: number, front_wide: number, overhead: number}}
 */
export function speakerRoleQuantities(placedSpeakers = []) {
  const installed = (Array.isArray(placedSpeakers) ? placedSpeakers : [])
    .filter((speaker) => isInstalled(speaker?.model));

  const countIn = (roles) => installed.filter((speaker) => roles.has(canon(speaker?.role))).length;

  const stage = installed.filter((speaker) => SCREEN_STAGE_ROLES.has(canon(speaker?.role)));
  const centreSpeakers = stage.filter((speaker) => CENTRE_ROLES.has(canon(speaker?.role)));
  const sides = stage.length - centreSpeakers.length;

  return {
    // A centre of its own model is counted at the centre; the screen channels are
    // then counted on their own, exactly as the schedule states them.
    lcr: centreSpeakers.length > 0 ? sides : stage.length,
    centre_soundbar: centreSpeakers.length,
    surround: countIn(SIDE_ROLES),
    rear_surround: countIn(REAR_ROLES),
    front_wide: countIn(WIDE_ROLES),
    overhead: countIn(OVERHEAD_ROLES),
  };
}

export default speakerRoleQuantities;