// userInteractionStore.js — Shared Room Designer user-interaction authority.
//
// Tracks MEANINGFUL user interaction for background scheduling:
//   pointerdown, wheel, keydown, and the existing b44-bass-drag-start/end events.
//
// Hover / passive pointer movement are intentionally NOT tracked (Part 4).
//
// Runtime UI state only — never persisted.
//
// Consumers (P14TargetBackgroundScheduler, Stage 1/2 hooks) subscribe and use:
//   - isUserInteracting(): true during an active drag OR within IDLE_QUIET_MS
//     of the last meaningful interaction.
//   - getIdleResumeDeadline(): lastInteractionAt + IDLE_QUIET_MS — background
//     work may resume only after this deadline (3s sustained inactivity).
//   - subscribe(listener): notified on every meaningful interaction so the
//     scheduler can pause speculative work immediately.
//   - useIsDragActive(): React hook — reactive boolean for Stage 1/2 hooks.
//
// FIX 3: All pointer listeners use CAPTURE phase so that component-level
// stopPropagation() (subwoofer drag, RSP drag, speaker drag) cannot suppress
// the interaction signal. The RSP/MLP GRABBED free-move lifecycle (which
// survives mouse-button release) is bracketed via mlpGrabStore subscription.

import { useSyncExternalStore } from "react";
import { subscribeMlpGrab, getMlpGrab } from "./mlpGrabStore.js";

const IDLE_QUIET_MS = 3000;

let lastInteractionAt = 0;
let pointerDown = false;      // primary pointer button held — brackets ALL drag types
let bassDragActive = false;   // explicit b44-bass-drag-start/end events
let mlpGrabbed = false;       // RSP/MLP GRABBED free-move lifecycle (survives button release)
let idleQuietMs = IDLE_QUIET_MS;
const listeners = new Set();

function now() { return Date.now(); }

function notify() {
  listeners.forEach((l) => { try { l(); } catch (_) { /* listener errors are non-fatal */ } });
}

/** Record a meaningful interaction (pointerdown / wheel / keydown). */
export function markInteraction() {
  lastInteractionAt = now();
  notify();
}

/** Set/clear the active-drag flag. Drag-start and drag-end both count as
 *  interactions (they bracket a sustained user activity). */
export function setDragActive(active) {
  bassDragActive = !!active;
  lastInteractionAt = now();
  notify();
}

export function getLastInteractionAt() { return lastInteractionAt; }

/** True when ANY drag type is physically active: pointer button held,
 *  bass drag event, or RSP/MLP GRABBED free-move mode. */
export function isDragActive() { return pointerDown || bassDragActive || mlpGrabbed; }

/** True if the user is currently interacting: an active drag, OR a meaningful
 *  interaction within the last IDLE_QUIET_MS. Used to defer heavy background
 *  completion processing until the app is genuinely idle. */
export function isUserInteracting() {
  return isDragActive() || (now() - lastInteractionAt < idleQuietMs);
}

/** Deadline (ms timestamp) after which background work may resume. */
export function getIdleResumeDeadline() {
  return lastInteractionAt + idleQuietMs;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook: reactive boolean — true during any active drag lifecycle.
 *  Stage 1/2 hooks use this to cancel speculative work during manipulation. */
export function useIsDragActive() {
  return useSyncExternalStore(subscribe, isDragActive, isDragActive);
}

// ── Test-only helpers ──────────────────────────────────────────────────────
export function setIdleQuietMsForTest(ms) { idleQuietMs = ms; }
export function resetUserInteractionForTest() {
  lastInteractionAt = 0;
  pointerDown = false;
  bassDragActive = false;
  mlpGrabbed = false;
  listeners.clear();
}

// ── Install window listeners (browser only) ───────────────────────────────
// Hover / pointermove / mousemove are deliberately NOT registered.
// pointerdown with the primary button brackets ALL drag types (seat, RSP,
// speaker, subwoofer, bass) — not just bass drags. pointerup/pointercancel
// clear the bracket. This catches drags that don't dispatch the custom
// b44-bass-drag-start/end events.
//
// FIX 3: CAPTURE phase is essential. useMouseDownHandler calls
// e.stopPropagation() on pointerdown, which suppresses bubble-phase listeners.
// Capture-phase listeners fire BEFORE the event reaches the target, so
// stopPropagation() in a component cannot prevent the interaction signal.
if (typeof window !== "undefined") {
  const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV === true;
  window.addEventListener("pointerdown", (e) => {
    if (e.button === 0 || e.button === undefined) {
      pointerDown = true;
      if (isDev) console.log("[interaction]", "START — pointerdown (capture)", e.button);
    }
    markInteraction();
  }, { passive: true, capture: true });
  window.addEventListener("wheel", markInteraction, { passive: true, capture: true });
  window.addEventListener("keydown", markInteraction, { passive: true, capture: true });
  const dragEndEvents = ["pointerup", "pointercancel"];
  dragEndEvents.forEach((evt) => {
    window.addEventListener(evt, () => {
      const wasDown = pointerDown;
      pointerDown = false;
      if (wasDown && isDev) console.log("[interaction]", "END —", evt, "(capture)");
      markInteraction();
    }, { passive: true, capture: true });
  });
  window.addEventListener("b44-bass-drag-start", () => {
    if (isDev) console.log("[interaction]", "START — bass-drag");
    setDragActive(true);
  });
  window.addEventListener("b44-bass-drag-end", () => {
    if (isDev) console.log("[interaction]", "END — bass-drag");
    setDragActive(false);
  });

  // RSP/MLP GRABBED free-move lifecycle: the RSP marker has a "grabbed" mode
  // that survives mouse-button release. The user can move the RSP without
  // holding any button. Bracket this lifecycle as active interaction so
  // speculative workers don't restart during free-move.
  subscribeMlpGrab(() => {
    const next = getMlpGrab();
    if (next !== mlpGrabbed) {
      mlpGrabbed = next;
      if (isDev) console.log("[interaction]", next ? "START — RSP/MLP grabbed (free-move)" : "END — RSP/MLP grabbed");
      markInteraction();
    }
  });
}