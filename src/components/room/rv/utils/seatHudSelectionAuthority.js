//
// Seat HUD selection — the ONE normal dismissal authority.
//
// The product rule, in full: once a seat is clicked that seat is PINNED, and its
// Seat HUD stays open until the user explicitly starts an interaction somewhere
// that is neither the pinned seat nor the HUD. Dismissal is therefore decided
// when an interaction STARTS — on pointerdown — and never later:
//
//   pointerdown inside the pinned seat ..... keep the selection (a seat drag)
//   pointerdown inside the Seat HUD ....... keep the selection (a HUD interaction)
//   pointerdown anywhere else ............. the one genuine click-away
//
// Nothing else dismisses it: not pointerup, not a drag ending, not a seat save,
// not a recalculation, not hover loss, and not the click the browser dispatches
// after a release. Where the pointer is RELEASED is irrelevant — which is why
// this decision is made from the DOM target at press time, never from React
// state that the rest of the gesture can still change.
//
// The pinned seat itself is the selection: it is set by the seat's own click and
// cleared only by this authority or by the HUD's explicit close control.

/** Marks the Seat HUD card. A press inside it belongs to the HUD. */
export const SEAT_HUD_INTERACTION_ATTRIBUTE = 'data-seat-hud';

/** Marks a seat's own plan element. A press on it belongs to that seat. */
export const SEAT_INTERACTION_ATTRIBUTE = 'data-seat';

export const SEAT_INTERACTION = 'seat';
export const HUD_INTERACTION = 'hud';
export const OUTSIDE_INTERACTION = 'outside';

const SEAT_SELECTOR = `[${SEAT_INTERACTION_ATTRIBUTE}]`;
const HUD_SELECTOR = `[${SEAT_HUD_INTERACTION_ATTRIBUTE}]`;

/**
 * Which object owns the interaction that is starting at this DOM target.
 * Anything that is not inside a seat or the HUD is OUTSIDE — including a target
 * that cannot be inspected at all, which by definition is inside neither.
 */
export function resolvePlanInteractionOwner(target) {
  if (!target || typeof target.closest !== 'function') return OUTSIDE_INTERACTION;
  if (target.closest(SEAT_SELECTOR)) return SEAT_INTERACTION;
  if (target.closest(HUD_SELECTOR)) return HUD_INTERACTION;
  return OUTSIDE_INTERACTION;
}

/** True only for the one genuine click-away: a press that belongs to neither. */
export function isSeatHudDismissalPointerDown(target) {
  return resolvePlanInteractionOwner(target) === OUTSIDE_INTERACTION;
}

export default resolvePlanInteractionOwner;