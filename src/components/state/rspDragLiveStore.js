/**
 * rspDragLiveStore
 * Lightweight external store that publishes the transient (draft) RSP
 * coordinate while the RSP marker is being dragged in the Room Visualisation.
 *
 * Consumers (BassBackgroundAnalysisOwner) subscribe and use the live RSP
 * coordinate to run the normalized room-transfer preview without committing
 * canonical RSP state.
 *
 * Flow:
 *   pointer move  → useMlpDragHandler writes mlpDragInfo + publishRspDragLive()
 *   pointer up    → useMouseUpHandler commits onSetManualRspY_m + clearRspDragLive()
 *
 * The store coalesces notifications: if the rounded coordinate signature is
 * unchanged since the last publish, no notification is sent.
 */

let listeners = new Set();
let state = { rsp: null, active: false };
let lastSig = "";

function notify() {
  listeners.forEach((l) => {
    try { l(); } catch (_) { /* listener removed */ }
  });
}

export function subscribeRspDragLive(cb) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getRspDragLive() {
  return state;
}

/**
 * Publish the current draft RSP coordinate. Only notifies subscribers when
 * the rounded X/Y signature actually changes (cheap coalescing).
 */
export function publishRspDragLive(rsp) {
  if (!rsp || !Number.isFinite(Number(rsp.x)) || !Number.isFinite(Number(rsp.y))) return;
  const sig = `${Math.round(Number(rsp.x) * 1000)}:${Math.round(Number(rsp.y) * 1000)}`;
  if (sig === lastSig) return;
  lastSig = sig;
  state = { rsp, active: true };
  notify();
}

/**
 * Clear the live draft. Called on pointer release / commit / cancel / blur.
 */
export function clearRspDragLive() {
  if (!state.active && state.rsp === null && lastSig === "") return;
  lastSig = "";
  state = { rsp: null, active: false };
  notify();
}