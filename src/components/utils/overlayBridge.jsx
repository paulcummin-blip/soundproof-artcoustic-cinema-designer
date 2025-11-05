/**
 * Non-invasive bridge to the zone overlays.
 * - Dispatches "b44:overlay:setLCR" with the payload.
 * - If window.Base44Overlay.setLCR exists, call it.
 * - Persist last LCR so overlays can resync after redraws.
 * - NEW: short replay window so redraws don't wipe icons.
 */

const GLOBAL_KEY = "__B44_LAST_LCR__";
const REPLAYER_KEY = "__B44_LCR_REPLAYER__";
const DEBUG_KEY = "__B44_DEBUG_LCR__"; // set to true in console to see logs

function log(...args) {
  try {
    if (window[DEBUG_KEY]) console.log("[B44:LCR]", ...args);
  } catch { /* ignore */ }
}

function setLastLcr(payload) {
  try {
    window[GLOBAL_KEY] = payload;
    log("stored", payload);
  } catch { /* ignore */ }
}

export function getLastLcr() {
  try {
    return window[GLOBAL_KEY] || null;
  } catch {
    return null;
  }
}

function sendToOverlay(payload) {
  // 1) Event path
  try {
    const ev = new CustomEvent("b44:overlay:setLCR", { detail: payload });
    window.dispatchEvent(ev);
    log("dispatched event b44:overlay:setLCR");
  } catch { /* ignore */ }

  // 2) Optional explicit hook
  try {
    if (window.Base44Overlay && typeof window.Base44Overlay.setLCR === "function") {
      window.Base44Overlay.setLCR(payload);
      log("called Base44Overlay.setLCR");
    }
  } catch { /* ignore */ }
}

export function syncLcrToOverlay() {
  const payload = getLastLcr();
  if (!payload) return;
  sendToOverlay(payload);
}

/**
 * Replays the last payload on an interval for a short time.
 * Default: every 250ms for ~3s (12 ticks).
 */
function startReplayer() {
  try {
    // Clear any previous replayer
    if (window[REPLAYER_KEY]?.stop) {
      window[REPLAYER_KEY].stop();
    }

    const payload = getLastLcr();
    if (!payload) return;

    let ticks = 0;
    const maxTicks = 12; // ~3s at 250ms
    const interval = setInterval(() => {
      ticks += 1;
      sendToOverlay(payload);
      if (ticks >= maxTicks) {
        clearInterval(interval);
        window[REPLAYER_KEY] = null;
        log("replayer stopped");
      }
    }, 250);

    window[REPLAYER_KEY] = {
      stop: () => { try { clearInterval(interval); } catch {} }
    };

    log("replayer started");
  } catch { /* ignore */ }
}

export function pushLcrToOverlay(payload) {
  // 1) Persist
  setLastLcr(payload);

  // 2) Immediate send
  sendToOverlay(payload);

  // 3) Microtask retry (first-paint races)
  setTimeout(() => sendToOverlay(payload), 0);

  // 4) Short replay window to survive redraws
  startReplayer();
}

/* --- Passive helpers: overlays can pull or trigger sync when ready --- */

window.addEventListener("b44:overlay:requestSync", () => {
  log("received requestSync");
  syncLcrToOverlay();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    log("visibilitychange → sync");
    syncLcrToOverlay();
  }
});

/**
 * Optional: turn on logs in your console to see the bridge working:
 *   window.__B44_DEBUG_LCR__ = true
 */