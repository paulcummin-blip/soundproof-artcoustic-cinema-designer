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
 * It also carries the movement itself: the transient highlight, and the live
 * position a drag publishes while it is moving.
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

// ---------------------------------------------------------------------------
// The transient highlight — a MOVEMENT cue, never a permanent mark
//
// Green means "this speaker is moving now": it lights the moment movement
// begins (a speaker dragged in the elevation, or a value typed in the panel),
// stays lit for as long as the movement lasts, holds briefly after the speaker
// is released, then returns to normal on its own. Nothing is ever left
// permanently marked, and no outline is ever drawn around a control or a
// speaker. Both ends read this one authority, so the drawing and the panel can
// never disagree about what is moving.
// ---------------------------------------------------------------------------
export const HIGHLIGHT_GREEN = '#213428'; // Artcoustic dark green
export const HIGHLIGHT_HOLD_MS = 5000;

const NO_HIGHLIGHT = { roles: [], lit: false, token: 0 };

let highlight = NO_HIGHLIGHT;
let holdTimer = null;

const cancelHold = () => {
  if (holdTimer === null) return;
  clearTimeout(holdTimer);
  holdTimer = null;
};

const publishHighlight = (next) => {
  highlight = next;
  listeners.forEach((listener) => listener());
};

/** Movement begins, or continues: light these speakers, right now. */
export function beginSpeakerHighlight(roles = []) {
  cancelHold();
  const nextRoles = normaliseRoles(roles);
  if (!nextRoles.length) return;
  // Already lit for exactly these speakers: nothing to republish.
  if (highlight.lit && nextRoles.join('|') === highlight.roles.join('|')) return;
  publishHighlight({ roles: nextRoles, lit: true, token: highlight.token + 1 });
}

/** Movement has stopped: hold the light, then let it return on its own. */
export function settleSpeakerHighlight({ hold = HIGHLIGHT_HOLD_MS } = {}) {
  if (!highlight.lit) return;
  cancelHold();
  if (Number(hold) > 0) {
    holdTimer = setTimeout(() => {
      holdTimer = null;
      releaseSpeakerHighlight();
    }, Number(hold));
    return;
  }
  releaseSpeakerHighlight();
}

/** Let it return to normal now. */
export function releaseSpeakerHighlight() {
  cancelHold();
  if (!highlight.lit) return;
  publishHighlight({ roles: [], lit: false, token: highlight.token + 1 });
}

export function getSpeakerHighlight() {
  return highlight;
}

export function useSpeakerHighlight() {
  return useSyncExternalStore(subscribeSpeakerSelection, getSpeakerHighlight, getSpeakerHighlight);
}

/** Are these speakers lit right now? (a control asks about the speakers it governs) */
export function useSpeakerHighlighted(roles) {
  const light = useSpeakerHighlight();
  if (!light.lit) return false;
  return normaliseRoles(roles).some((role) => light.roles.includes(role));
}

// ---------------------------------------------------------------------------
// The LIVE POSITION — the movement itself, published as numbers
//
// While a speaker is being dragged in the Side Elevation its position lives in
// the gesture, not in the project: nothing is saved, nothing is recalculated and
// no second store of the design is created. The gesture publishes it here so
// every surface that displays that speaker's own numbers reads the position the
// designer can see, at the moment they see it — the acoustic centre height
// control above all, which then shows the moving height at two decimals.
//
// One number, one authority: the position becomes the project's own on release,
// through the one save path, and the live number is withdrawn with it.
// ---------------------------------------------------------------------------
const NO_LIVE_POSITION = { role: null, z: null, y: null, token: 0 };

let livePosition = NO_LIVE_POSITION;
const positionListeners = new Set();

export function subscribeLiveSpeakerPosition(listener) {
  positionListeners.add(listener);
  return () => {
    positionListeners.delete(listener);
  };
}

export function getLiveSpeakerPosition() {
  return livePosition;
}

/** The speaker being moved right now, at the position it is being moved to. */
export function publishLiveSpeakerPosition({ role = null, z = null, y = null } = {}) {
  const nextRole = role ? String(role).toUpperCase() : null;
  const nextZ = Number.isFinite(Number(z)) ? Number(z) : null;
  const nextY = Number.isFinite(Number(y)) ? Number(y) : null;

  if (
    nextRole === livePosition.role &&
    nextZ === livePosition.z &&
    nextY === livePosition.y
  ) {
    return;
  }

  livePosition = { role: nextRole, z: nextZ, y: nextY, token: livePosition.token + 1 };
  positionListeners.forEach((listener) => listener());
}

/** The movement has stopped: the live number is withdrawn. */
export function clearLiveSpeakerPosition() {
  if (!livePosition.role) return;
  livePosition = { ...NO_LIVE_POSITION, token: livePosition.token + 1 };
  positionListeners.forEach((listener) => listener());
}

export function useLiveSpeakerPosition() {
  return useSyncExternalStore(
    subscribeLiveSpeakerPosition,
    getLiveSpeakerPosition,
    getLiveSpeakerPosition,
  );
}

/** The live position of these speakers, while one of them is being moved. */
export function useLiveSpeakerPositionForRoles(roles) {
  const live = useLiveSpeakerPosition();
  if (!live.role) return null;
  return normaliseRoles(roles).includes(live.role) ? live : null;
}

export default useSpeakerSelection;