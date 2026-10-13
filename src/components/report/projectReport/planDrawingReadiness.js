/**
 * planDrawingReadiness.js
 * -----------------------
 * The consolidated Project Report prints the Technical Report's three plan
 * drawings — the room plan, the dimensioned room plan and the speaker position
 * plan — from the same raster captures the Technical Report takes for its own
 * export. The captures are taken by the embedded Technical Report, once its
 * pages are ready, because that document holds the frozen geometry and the
 * capture host.
 *
 * This module is the one signal between the two: the embedded Technical Report
 * publishes whether its plan drawings exist yet, and the Project Report's export
 * waits on it. A report exported before the drawings exist would silently print
 * without them, which is exactly the omission this restores.
 *
 * The initial value is deliberately inert — not pending, not ready — so an
 * export is never blocked by a signal that was never published. Only a document
 * that is actually mid-capture reports pending.
 *
 * Pure: no React, no DOM, no side effects.
 */

const listeners = new Set();

let snapshot = Object.freeze({ pending: false, ready: false });

/** Publish the embedded document's drawing-capture state. No-op when unchanged. */
export function publishPlanDrawingReadiness(next) {
  const pending = next?.pending === true;
  const ready = next?.ready === true;
  if (snapshot.pending === pending && snapshot.ready === ready) return;
  snapshot = Object.freeze({ pending, ready });
  listeners.forEach((listener) => listener());
}

/** Subscribe to changes; returns the unsubscribe function. */
export function subscribePlanDrawingReadiness(listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The current state, read synchronously (stable reference between changes). */
export function readPlanDrawingReadiness() {
  return snapshot;
}