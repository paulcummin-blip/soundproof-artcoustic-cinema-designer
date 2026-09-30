/**
 * Resolve canonical speaker models from the explicit role map, falling back to
 * the version's authoritative placed-speaker list when legacy versions do not
 * carry selected_speakers_by_role.
 */

import { canonicalProductId, canonicaliseRoleModelMap } from '@/components/utils/modelKeyNormaliser';

const ROLE_CODES = Object.freeze({
  lcr: ['FL', 'FC', 'FR'],
  surround: ['SL', 'SR'],
  rear_surround: ['SBL', 'SBR'],
  front_wide: ['LW', 'RW'],
  overhead: ['TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR'],
});

export function resolveSpeakerModelsByRole(project, placedSpeakers = []) {
  // Proposals name products, never roles-encoded-as-ids: the role keys carry the
  // use (surround / rear_surround / …) and the model carries the product.
  const resolved = canonicaliseRoleModelMap({ ...(project?.selected_speakers_by_role || {}) });
  const speakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];

  for (const [role, codes] of Object.entries(ROLE_CODES)) {
    if (resolved[role]) continue;
    const speaker = speakers.find((item) =>
      item?.model && codes.includes(String(item?.role || '').toUpperCase()),
    );
    if (speaker?.model) resolved[role] = canonicalProductId(speaker.model);
  }

  return resolved;
}