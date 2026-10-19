/**
 * speakerSelectionStore
 *
 * ONE selection shared by the elevation drawing and the speaker control panel,
 * so a designer never has to work out which control belongs to which
 * loudspeaker: pointing at either end points at the same speaker.
 *
 * Two shapes of selection, both naming CANONICAL roles:
 *   - one speaker  — { primary: 'SL1', roles: ['SL1'] }   picked in the drawing,
 *                    so SL, SL1, SR and SR1 stay individually identifiable.
 *   - a whole group — { group: 'side', roles: ['SL','SR'] } chosen at a control
 *                    that governs the group, so its speakers light up together.
 *
 * UI state only. Selecting reads no geometry and triggers no calculation: it
 * never recalculates, saves or changes project data, and it survives a change
 * of view because it is not owned by any one view.
 *
 * `token` changes on every distinct selection, which is how a surface knows a
 * fresh choice was made (and can bring the matching controls into view).
 */
import { useSyncExternalStore } from 'react';

const EMPTY = { roles: [], primary: null, group: null, source: null, token: 0 };

let selection = EMPTY;
const listeners = new Set();

export function subscribeSpeakerSelection(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSpeakerSelection() {
  return selection;
}

const normaliseRoles = (roles) =>
  Array.from(
    new Set(
      (Array.isArray(roles) ? roles : [])
        .map((role) => String(role || '').toUpperCase())
        .filter(Boolean),
    ),
  );

/** Which end of the interface the selection came from: 'drawing' | 'panel'. */
export function setSpeakerSelection({ roles = null, primary = null, group = null, source = null } = {}) {
  const nextPrimary = primary ? String(primary).toUpperCase() : null;
  const nextRoles = normaliseRoles(roles ?? (nextPrimary ? [nextPrimary] : []));
  const nextGroup = group || null;
  const nextSource = source || null;

  const unchanged =
    nextPrimary === selection.primary &&
    nextRoles.join('|') === selection.roles.join('|') &&
    nextGroup === selection.group &&
    nextSource === selection.source;
  if (unchanged) return;

  selection = {
    roles: nextRoles,
    primary: nextPrimary,
    group: nextGroup,
    source: nextSource,
    token: selection.token + 1,
  };
  listeners.forEach((listener) => listener());
}

export function clearSpeakerSelection() {
  if (!selection.primary && !selection.group) return;
  selection = { ...EMPTY, token: selection.token + 1 };
  listeners.forEach((listener) => listener());
}

export function useSpeakerSelection() {
  return useSyncExternalStore(subscribeSpeakerSelection, getSpeakerSelection, getSpeakerSelection);
}

export default useSpeakerSelection;