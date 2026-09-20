/**
 * Resolve canonical speaker models from the explicit role map, falling back to
 * the version's authoritative placed-speaker list when legacy versions do not
 * carry selected_speakers_by_role.
 */

const ROLE_CODES = Object.freeze({
  lcr: ['FL', 'FC', 'FR'],
  surround: ['SL', 'SR'],
  rear_surround: ['SBL', 'SBR'],
  front_wide: ['LW', 'RW'],
  overhead: ['TFL', 'TFR', 'TML', 'TMR', 'TRL', 'TRR'],
});

export function resolveSpeakerModelsByRole(project, placedSpeakers = []) {
  const resolved = { ...(project?.selected_speakers_by_role || {}) };
  const speakers = Array.isArray(placedSpeakers) ? placedSpeakers : [];

  for (const [role, codes] of Object.entries(ROLE_CODES)) {
    if (resolved[role]) continue;
    const speaker = speakers.find((item) =>
      item?.model && codes.includes(String(item?.role || '').toUpperCase()),
    );
    if (speaker?.model) resolved[role] = speaker.model;
  }

  return resolved;
}
