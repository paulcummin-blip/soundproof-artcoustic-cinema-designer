// components/utils/minimumSystemForAsdr.js
// ----------------------------------------
// Minimum 5.1 system gate for the Artcoustic System Design Rating (ASDR).
//
// ASDR must not calculate, display, or publish until the design has:
//   - an LCR / screen speaker stage (FL, FC, FR)
//   - at least one surround speaker (SL/SR/SBL/SBR/LW/RW)
//   - at least one subwoofer
//
// Pure function — no React. Safe to call from hooks, effects, or tests.

import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';

const LCR_ROLES = new Set(['FL', 'FC', 'FR']);
const SURROUND_ROLES = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW']);

/**
 * @param {Array} placedSpeakers - appState.speakerSystem.placedSpeakers
 * @param {Object} appState - app state (for subwoofer presence)
 * @returns {boolean} true when the minimum 5.1-equivalent system is present
 */
export function hasMinimumSystemForAsdr(placedSpeakers, appState) {
  const speakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];

  const lcrPresent = new Set();
  let hasSurround = false;
  let integratedLcr = false;
  for (const s of speakers) {
    const role = getCanonicalRole(s?.role);
    if (LCR_ROLES.has(role)) {
      lcrPresent.add(role);
      // An integrated LCR soundbar (FC with frontStageType=integrated_lcr)
      // provides FL+FC+FR in a single cabinet — equivalent to a complete
      // discrete LCR stage for publication eligibility.
      if (role === 'FC' && s?.model) {
        const meta = getSpeakerModelMeta(s.model);
        if (meta?.frontStageType === 'integrated_lcr') {
          integratedLcr = true;
        }
      }
    } else if (SURROUND_ROLES.has(role)) {
      hasSurround = true;
    }
  }
  const hasDiscreteLcr = lcrPresent.has('FL') && lcrPresent.has('FC') && lcrPresent.has('FR');
  const hasLcr = hasDiscreteLcr || integratedLcr;

  const subs = Array.isArray(appState?.subwoofers) ? appState.subwoofers : [];
  const instances = Array.isArray(appState?.subwooferInstances) ? appState.subwooferInstances : [];
  const hasSub = subs.length > 0 || instances.some((i) => i && i.enabled !== false);

  return hasLcr && hasSurround && hasSub;
}