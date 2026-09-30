/**
 * liveSpeakerPositions.js
 *
 * ONE effective speaker position source for the Room Designer plan.
 *
 * While a speaker is being dragged, the transient draft position is the
 * effective position for every consumer — the speaker visual, the angle lines
 * and labels, the pinned seat HUD and the P5 / RP23 preview metrics. Committed
 * speaker state is only written once, on pointer-up.
 *
 *   effectiveSpeakerPosition =
 *     dragPreviewPosition  if this speaker is currently being dragged
 *     committedPosition    otherwise
 *
 * These helpers are pure presentation maths. They never write state, never
 * persist, and never trigger a recalculation.
 */

/** True when a draft entry carries a usable, finite plan position. */
function hasUsablePosition(draft) {
  const p = draft?.position;
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

/**
 * Build the live draft lookup for the dragged speaker(s).
 * Returns null when no drag is active, so callers can skip all merging work and
 * keep their committed-list identity (and therefore every memo downstream).
 */
export function buildLiveSpeakerPositionMap(draftSpeakers, isSpeakerDragActive) {
  if (!isSpeakerDragActive || !Array.isArray(draftSpeakers)) return null;
  const map = new Map();
  for (const draft of draftSpeakers) {
    if (draft?.id && hasUsablePosition(draft)) map.set(draft.id, draft);
  }
  return map.size > 0 ? map : null;
}

/**
 * Apply the live draft positions over any speaker list (committed, filtered or
 * otherwise). Returns the original array untouched when there is no active drag,
 * so identity is preserved and nothing re-renders needlessly.
 */
export function applyLiveSpeakerPositions(speakers, liveById) {
  if (!liveById || !Array.isArray(speakers)) return speakers;
  return speakers.map((speaker) => {
    const draft = liveById.get(speaker?.id);
    if (!draft || !hasUsablePosition(draft)) return speaker;
    return {
      ...speaker,
      position: draft.position,
      ...(draft.meta !== undefined ? { meta: draft.meta } : {}),
      ...(draft.positionSource !== undefined ? { positionSource: draft.positionSource } : {}),
      ...(draft.isOnRearWall !== undefined ? { isOnRearWall: draft.isOnRearWall } : {}),
    };
  });
}