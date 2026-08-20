/**
 * seatDragLiveStore
 * Lightweight external store that publishes transient (draft) seat positions
 * while a seat/row is being dragged longitudinally in the Room Visualisation.
 *
 * Consumers (e.g. ViewingAnglePanel) subscribe and use the live seat Y values to
 * recompute pure viewing geometry (angle, distance, RP23 level, viewing balance)
 * in real time — WITHOUT triggering heavy RP22 / bass / ASDR recalculation.
 *
 * Flow:
 *   pointer move  → useSeatDragHandler writes draftSeatsRef + publishSeatDragLive()
 *   pointer up    → commitDraftSeatPositions commits to state + clearSeatDragLive()
 *
 * The store coalesces notifications: if the rounded seat-Y signature is unchanged
 * since the last publish, no notification is sent (avoids flooding React).
 */

let listeners = new Set();
let state = { seats: null, active: false };
let lastSig = "";

function notify() {
  listeners.forEach((l) => {
    try { l(); } catch (_) { /* listener removed */ }
  });
}

export function subscribeSeatDragLive(cb) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getSeatDragLive() {
  return state;
}

/**
 * Publish the current draft seat array. Only notifies subscribers when the
 * rounded Y signature actually changes (cheap coalescing).
 */
export function publishSeatDragLive(seats) {
  if (!Array.isArray(seats)) return;
  const sig = seats
    .map((s) => `${s?.id ?? ""}:${Math.round((Number(s?.y) || 0) * 1000)}`)
    .join(",");
  if (sig === lastSig) return;
  lastSig = sig;
  state = { seats, active: true };
  notify();
}

/**
 * Clear the live draft. Called on pointer release / commit / window blur.
 */
export function clearSeatDragLive() {
  if (!state.active && state.seats === null && lastSig === "") return;
  lastSig = "";
  state = { seats: null, active: false };
  notify();
}