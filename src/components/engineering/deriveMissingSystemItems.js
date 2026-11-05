/**
 * deriveMissingSystemItems
 * -------------------------
 * Pure helper: from the current design state and the selected Dolby layout,
 * return the plain-English list of mandatory equipment that is still missing
 * and therefore blocks engineering publication.
 *
 * Reuses the EXISTING authorities — `rolesForLayout` (canonical bed + overhead
 * roles per layout) and the same installed-model / subwoofer-presence checks as
 * `hasMinimumSystemForAsdr` — so the dealer-facing explanation is derived from
 * the existing readiness authority, never hardcoded.
 *
 * Returns an array of plain-English item phrases (empty when the system is
 * complete). Each phrase is a noun the dealer guidance composes into a
 * sentence; no internal gate names, parameter keys or code leak through.
 */

import { getCanonicalRole } from '@/components/utils/surroundRoleMap';
import { rolesForLayout } from '@/components/utils/surroundRoleMap';
import { isCentreCabinetRole, hasInstalledModel } from '@/components/utils/frontStageModeAuthority';
import { isIntegratedLcrSpeaker } from '../../../shared/channelArchitecture.js';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';

const LCR_ROLES = new Set(['FL', 'FC', 'FR']);
const SURROUND_ROLES = new Set(['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW']);
const OVERHEAD_ROLES = new Set(['TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR']);

const hasInstalled = (s) =>
  Number.isFinite(s?.position?.x) && Number.isFinite(s?.position?.y) && hasInstalledModel(s?.model);

/**
 * @param {Object} input
 * @param {Array}  input.placedSpeakers
 * @param {Array}  [input.subwoofers]
 * @param {Array}  [input.subwooferInstances]
 * @param {string} input.dolbyLayout        e.g. "5.1.2"
 * @param {boolean} [input.useWidesInsteadOfRears]
 * @returns {string[]} plain-English missing item phrases (empty when complete)
 */
export function deriveMissingSystemItems({
  placedSpeakers,
  subwoofers,
  subwooferInstances,
  dolbyLayout,
  useWidesInsteadOfRears = false,
} = {}) {
  const speakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];
  const required = new Set(rolesForLayout({ dolbyLayout: dolbyLayout || '5.1', useWidesInsteadOfRears }));

  const lcrPresent = new Set();
  const installedCentreCabinets = new Set();
  let hasSurround = false;
  let integratedLcr = false;
  let hasOverhead = false;
  for (const s of speakers) {
    const role = getCanonicalRole(s?.role);
    if (!role) continue;
    if (isCentreCabinetRole(role) && hasInstalled(s)) installedCentreCabinets.add(role);
    if (LCR_ROLES.has(role)) {
      lcrPresent.add(role);
      if (role === 'FC' && s?.model) {
        const meta = getSpeakerModelMeta(s.model);
        if (isIntegratedLcrSpeaker(s, meta)) integratedLcr = true;
      }
    } else if (SURROUND_ROLES.has(role)) {
      if (hasInstalled(s)) hasSurround = true;
    } else if (OVERHEAD_ROLES.has(role)) {
      if (hasInstalled(s)) hasOverhead = true;
    }
  }
  if (installedCentreCabinets.has('FCL') && installedCentreCabinets.has('FCR')) lcrPresent.add('FC');
  const hasLcr = (lcrPresent.has('FL') && lcrPresent.has('FC') && lcrPresent.has('FR')) || integratedLcr;

  const subs = Array.isArray(subwoofers) ? subwoofers : [];
  const instances = Array.isArray(subwooferInstances) ? subwooferInstances : [];
  const hasSub = subs.length > 0 || instances.some((i) => i && i.enabled !== false);

  const requiresOverheads = [...required].some((r) => OVERHEAD_ROLES.has(r));

  const missing = [];
  if (!hasLcr) missing.push('front left, centre and right speakers');
  if (!hasSurround) missing.push('surround speakers');
  if (requiresOverheads && !hasOverhead) missing.push('overhead speaker models');
  if (!hasSub) missing.push('subwoofer system');
  return missing;
}