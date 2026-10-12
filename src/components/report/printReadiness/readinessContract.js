/**
 * readinessContract
 * -----------------
 * The vocabulary and the plain primitives of print preparation: how long each
 * stage may take, why preparation failed, the message a designer reads, and the
 * timers the resource waits are built from.
 *
 * No DOM, no React, no imports — this module must stay runnable from a plain
 * node script, and the fixture harness exercises it directly.
 */

/** How long each stage may take, and how often its state is re-read. */
export const PRINT_READINESS_BUDGET_MS = Object.freeze({
  inputs: 15000,
  stylesheets: 8000,
  fonts: 6000,
  images: 12000,
  layout: 2000,
  poll: 50,
});

/** Consecutive identical layout measurements required before printing. */
export const PRINT_READINESS_STABLE_FRAMES = 2;

/** Why preparation did not complete. Every one of these blocks printing. */
export const PRINT_READINESS_REASON = Object.freeze({
  INPUTS_FAILED: 'document_inputs_failed',
  INPUTS_TIMEOUT: 'document_inputs_timeout',
  STYLESHEETS_FAILED: 'required_stylesheet_failed',
  STYLESHEETS_TIMEOUT: 'required_stylesheet_timeout',
  FONTS_FAILED: 'required_font_failed',
  FONTS_TIMEOUT: 'required_font_timeout',
  IMAGES_FAILED: 'required_image_failed',
  IMAGES_DECODE_FAILED: 'required_image_decode_failed',
  LAYOUT_UNSTABLE: 'print_layout_unstable',
});

/** The plain-English subject of each failure, so the message names the cause. */
const REASON_SUBJECT = Object.freeze({
  [PRINT_READINESS_REASON.INPUTS_FAILED]: 'the proposal was still finishing loading',
  [PRINT_READINESS_REASON.INPUTS_TIMEOUT]: 'the proposal took too long to finish loading',
  [PRINT_READINESS_REASON.STYLESHEETS_FAILED]: 'a stylesheet did not load',
  [PRINT_READINESS_REASON.STYLESHEETS_TIMEOUT]: 'a stylesheet did not finish loading',
  [PRINT_READINESS_REASON.FONTS_FAILED]: 'a document font could not be loaded',
  [PRINT_READINESS_REASON.FONTS_TIMEOUT]: 'the document fonts did not finish loading',
  [PRINT_READINESS_REASON.IMAGES_FAILED]: 'an image could not be loaded',
  [PRINT_READINESS_REASON.IMAGES_DECODE_FAILED]: 'an image could not be decoded',
  [PRINT_READINESS_REASON.LAYOUT_UNSTABLE]: 'the page layout did not settle',
});

/** The failure message used when preparation did not complete. */
export const PRINT_NOT_READY_MESSAGE = 'The document was not ready to print, so nothing was sent to the printer. Choose Retry Export to prepare it again.';

/** The mark a timed-out wait carries, so a caller can tell it from a real error. */
export const READINESS_TIMEOUT_MARK = 'print-readiness-timeout';

/* ── Timing primitives ─────────────────────────────────────────────────── */

export const readinessNow = () => (typeof performance !== 'undefined' && performance.now
  ? performance.now()
  : Date.now());

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/** Resolve/reject with `promise`, or reject with a marked timeout error. */
export function withDeadline(promise, ms) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const error = new Error(READINESS_TIMEOUT_MARK);
      error.printReadinessTimeout = true;
      reject(error);
    }, Math.max(0, ms));
    Promise.resolve(promise).then(
      (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } },
      (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } },
    );
  });
}

/** Poll `check` until it is true, or until the budget runs out. */
export async function waitUntil(check, { budgetMs, pollMs = PRINT_READINESS_BUDGET_MS.poll }) {
  const deadline = readinessNow() + budgetMs;
  if (check()) return true;
  while (readinessNow() < deadline) {
    await delay(pollMs);
    if (check()) return true;
  }
  return check();
}

/** One animation frame of `win` (or of this document). */
export function frameRunner(win) {
  const view = win || (typeof window !== 'undefined' ? window : null);
  if (view && typeof view.requestAnimationFrame === 'function') {
    return () => new Promise((resolve) => view.requestAnimationFrame(() => resolve()));
  }
  if (typeof setTimeout === 'function') return () => delay(16);
  return null;
}

/** Let one rendered frame pass, so React has applied the state just resolved. */
export async function settleOneFrame(win = null) {
  const frame = frameRunner(win);
  if (frame) await frame();
}

/** A URL short enough to name in a message. */
function shorten(url) {
  const value = String(url || '');
  if (value.length <= 70) return value;
  const tail = value.split('/').pop() || value;
  return tail.length <= 70 ? tail : `${tail.slice(0, 67)}…`;
}

/** The message a designer reads when preparation could not complete. */
export function describePrintReadinessFailure(result) {
  const subject = REASON_SUBJECT[result?.reason] || 'a required part of the document was not ready';
  const failure = Array.isArray(result?.failures) ? result.failures[0] : null;
  const named = failure?.url ? ` (${shorten(failure.url)})` : '';
  return `The document was not ready to print, so nothing was sent to the printer: ${subject}${named}. Choose Retry Export to prepare it again.`;
}

/* ── Document inputs ───────────────────────────────────────────────────── */

/**
 * Resolve the document's own inputs before anything is prepared.
 *
 * The resolved value is the stable snapshot the export prints: once it is in
 * hand, nothing the editor finishes loading afterwards can change the document
 * that gets prepared. A resolver that fails or runs long is a failure — the
 * export reports it rather than printing a half-loaded document.
 *
 * @param {Function} resolveInputs - async () => the settled export inputs
 * @returns {Promise<{ok: boolean, value: any, reason: string|null, error: Error|null}>}
 */
export async function waitForDocumentInputs(
  resolveInputs,
  { budgetMs = PRINT_READINESS_BUDGET_MS.inputs } = {},
) {
  if (typeof resolveInputs !== 'function') {
    return { ok: true, value: undefined, reason: null, error: null };
  }
  try {
    const value = await withDeadline(Promise.resolve().then(() => resolveInputs()), budgetMs);
    return { ok: true, value, reason: null, error: null };
  } catch (error) {
    return {
      ok: false,
      value: null,
      reason: error?.printReadinessTimeout
        ? PRINT_READINESS_REASON.INPUTS_TIMEOUT
        : PRINT_READINESS_REASON.INPUTS_FAILED,
      error,
    };
  }
}