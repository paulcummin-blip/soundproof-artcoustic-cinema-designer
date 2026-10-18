// adiEditorialRejectionStore.js
// ---------------------------------------------------------------------------
// THE SESSION'S LAST REFUSED ADI EDITORIAL REWRITE, kept so a refusal stays
// diagnosable after its notice has been dismissed.
//
// A refused rewrite returns its diagnostic ONCE, in the response to the button
// that asked for it, and it is written NOWHERE: the copy on screen is untouched,
// the section and the report snapshot are untouched, and no editorial history is
// appended. Dismissing the one-line notice would therefore take the only copy of
// what was proposed, why it was refused, and which stage refused it with it. This
// holds that response for the sitting so the detail can be read or copied at any
// point while the page is open.
//
// Session-scoped and in memory only: it is not a record, it is not saved to the
// database, it is never read by a report or a proposal, and it disappears with the
// page. Nothing here writes a narrative, a design value or a document.
//
// Master-admin surface only: the backend sends the diagnostic to a master admin
// alone, so an ordinary dealer's attempt stores nothing at all. A response that
// carries no diagnostic replaces nothing — the session keeps what it was actually
// given rather than blanking it.
// ---------------------------------------------------------------------------

import { useSyncExternalStore } from 'react';

let held = null;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => {
    try { listener(); } catch { /* a failing subscriber never breaks the store */ }
  });
}

/** Hold one refused attempt's diagnostic for the session. */
export function saveAdiEditorialRejection(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') return null;
  held = { ...diagnostics, held_at: new Date().toISOString() };
  notify();
  return held;
}

/** The refused attempt held for this session, or null. */
export function readAdiEditorialRejection() {
  return held;
}

/** Forget what this session held. */
export function clearAdiEditorialRejection() {
  if (!held) return false;
  held = null;
  notify();
  return true;
}

export function subscribeAdiEditorialRejection(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React binding — the refused rewrite held in the current session. */
export function useAdiEditorialRejection() {
  return useSyncExternalStore(
    subscribeAdiEditorialRejection,
    readAdiEditorialRejection,
    () => null,
  );
}