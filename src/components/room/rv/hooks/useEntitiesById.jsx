/**
 * useEntitiesById.js
 * Extracted from RoomVisualisation.jsx (Stage 1).
 *
 * Builds a combined lookup map (id → entity) for speakers, seats and subs.
 * Matches the old byId useMemo in RoomVisualisation exactly.
 */

import { useMemo } from 'react';

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {{ placedSpeakers: Array|null, seatingPositions: Array|null, frontSubs: Array|null, rearSubs: Array|null }} opts
 * @returns {Map<string, object>}
 */
export function useEntitiesById({
  placedSpeakers,
  seatingPositions,
  frontSubs,
  rearSubs,
}) {
  const byId = useMemo(() => {
    const map = new Map();

    // ── Speakers ────────────────────────────────────────────────────────────
    if (Array.isArray(placedSpeakers)) {
      for (const speaker of placedSpeakers) {
        if (!speaker) continue;
        // Primary key: speaker.id
        if (speaker.id) {
          map.set(String(speaker.id), speaker);
        }
        // Fallback key: uppercase role (so callers can do byId.get('FL') etc.)
        const roleKey = (speaker.role ?? '').toUpperCase();
        if (roleKey && !map.has(roleKey)) {
          map.set(roleKey, speaker);
        }
      }
    }

    // ── Seats ───────────────────────────────────────────────────────────────
    if (Array.isArray(seatingPositions)) {
      for (const seat of seatingPositions) {
        if (!seat) continue;
        if (seat.id) {
          map.set(String(seat.id), seat);
        }
      }
    }

    // ── Front subs ──────────────────────────────────────────────────────────
    if (Array.isArray(frontSubs)) {
      frontSubs.forEach((sub, idx) => {
        if (!sub) return;
        const key = sub.id ? String(sub.id) : `front-sub-${idx}`;
        map.set(key, { ...sub, _subType: 'front' });
      });
    }

    // ── Rear subs ───────────────────────────────────────────────────────────
    if (Array.isArray(rearSubs)) {
      rearSubs.forEach((sub, idx) => {
        if (!sub) return;
        const key = sub.id ? String(sub.id) : `rear-sub-${idx}`;
        map.set(key, { ...sub, _subType: 'rear' });
      });
    }

    return map;
  }, [placedSpeakers, seatingPositions, frontSubs, rearSubs]);

  return byId;
}