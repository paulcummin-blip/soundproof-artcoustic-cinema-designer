/**
 * useSpeakersByRole.js
 * Extracted from RoomVisualisation.jsx (Stage 1).
 *
 * Returns a Map of canonicalRole → speaker(s) for the current placedSpeakers array.
 */

import { useMemo } from 'react';
import { buildRoleMap } from '@/components/utils/speakerUtils';

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {{ placedSpeakers: Array|null|undefined, getCanonicalRole: (role:string)=>string }} opts
 * @returns {Map<string, object>}
 */
export function useSpeakersByRole({ placedSpeakers, getCanonicalRole }) {
  const byRole = useMemo(() => {
    // Attempt the fast path via buildRoleMap
    if (typeof buildRoleMap === 'function' && Array.isArray(placedSpeakers)) {
      try {
        const result = buildRoleMap(placedSpeakers);
        if (result instanceof Map) return result;
      } catch {
        // fall through to safe fallback
      }
    }

    // Safe fallback: build a plain Map keyed by canonical role
    const map = new Map();
    if (!Array.isArray(placedSpeakers)) return map;

    for (const speaker of placedSpeakers) {
      if (!speaker) continue;
      const role =
        typeof getCanonicalRole === 'function'
          ? getCanonicalRole(speaker.role)
          : (speaker.role ?? '').toUpperCase();
      if (!role) continue;
      // If multiple speakers share a role, keep the first (matches old behaviour)
      if (!map.has(role)) {
        map.set(role, speaker);
      }
    }

    return map;
  }, [placedSpeakers, getCanonicalRole]);

  return byRole;
}