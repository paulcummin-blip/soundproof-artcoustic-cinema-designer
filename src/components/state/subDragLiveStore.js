/**
 * subDragLiveStore
 * Lightweight external store that publishes transient (draft) subwoofer positions
 * while a sub is being dragged in the Room Visualisation.
 *
 * Consumers (e.g. BassBackgroundAnalysisOwner) subscribe and use the live sub
 * positions to run the normalized room-transfer preview without committing
 * the design state.
 *
 * Flow:
 *   pointer move  → useSubDragHandler writes draft refs + publishSubDragLive()
 *   pointer up    → commitDraftSubPositions commits to state + clearSubDragLive()
 *
 * The store coalesces notifications: if the rounded position signature is
 * unchanged since the last publish, no notification is sent.
 */

let listeners = new Set();
let state = { subs: null, active: false };
let lastSig = "";

function notify() {
  listeners.forEach((l) => {
    try { l(); } catch (_) { /* listener removed */ }
  });
}

export function subscribeSubDragLive(cb) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getSubDragLive() {
  return state;
}

/**
 * Publish the current draft sub array. Only notifies subscribers when the
 * rounded position signature actually changes (cheap coalescing).
 */
export function publishSubDragLive(subs) {
  if (!Array.isArray(subs)) return;
  const sig = subs
    .map((s) => `${s?.id ?? ""}:${Math.round((Number(s?.position?.x) || 0) * 1000)}:${Math.round((Number(s?.position?.y) || 0) * 1000)}`)
    .join(",");
  if (sig === lastSig) return;
  lastSig = sig;
  state = { subs, active: true };
  notify();
}

/**
 * Clear the live draft. Called on pointer release / commit / window blur.
 */
export function clearSubDragLive() {
  if (!state.active && state.subs === null && lastSig === "") return;
  lastSig = "";
  state = { subs: null, active: false };
  notify();
}