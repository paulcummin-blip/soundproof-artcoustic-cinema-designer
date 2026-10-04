/**
 * canvasGradientGuard.js
 * ----------------------
 * Keeps a CSS gradient from aborting the issued-document capture.
 *
 * What fails, exactly:
 *
 *   html2canvas paints every CSS gradient onto a canvas it creates, and calls
 *   `addColorStop` once per colour stop with the offset
 *
 *     Math.max(Math.min(1, processStops[i] / lineLength), 0)
 *
 *   (html2canvas.js — `processColorStops`, called by
 *   `CanvasRenderer.prototype.renderBackgroundImage`). A gradient painted on a
 *   box that measures nothing has a gradient line of length 0, so that division
 *   is 0/0 = NaN, `Math.min(1, NaN)` is NaN, and the browser throws:
 *
 *     Failed to execute 'addColorStop' on 'CanvasGradient':
 *     The provided double value is non-finite.
 *
 *   That exception aborts the whole capture: the PDF downloads, but the Project
 *   Library copy is never stored.
 *
 * Two guards keep it from happening, neither of which changes a valid document:
 *
 *   1. neutraliseDegenerateGradients() removes the gradient from a box that
 *      measures nothing, in the capture clone only. Such a box paints nothing,
 *      so the captured (and printed) document is identical — the degenerate
 *      gradient is simply never built, which is the upstream fix.
 *   2. installCanvasGradientGuard() validates the canvas gradient API while the
 *      capture runs: every colour-stop offset is checked, a finite offset is
 *      clamped to 0-1, and a non-finite offset falls back to the last valid stop
 *      instead of throwing. The geometry passed to
 *      createLinearGradient/createRadialGradient is made finite at the same
 *      time, so a failed measurement cannot reach the canvas either.
 *
 * This is not a catch-all: nothing is swallowed, valid gradients pass through
 * untouched, whatever was sanitised is reported back to the caller, and the
 * canvas API is restored when the capture ends.
 *
 * Pure: no DOM ownership, no React, no network.
 */

/** Where a colour stop lands when its computed offset is not a number. */
export const GRADIENT_OFFSET_FALLBACK = 0;

/** A colour stop offset is a fraction of the gradient line: 0 to 1. */
export function clampGradientOffset(value) {
  const offset = Number(value);
  if (!Number.isFinite(offset)) return GRADIENT_OFFSET_FALLBACK;
  return Math.min(1, Math.max(0, offset));
}

/**
 * The offset to actually hand to addColorStop.
 *
 * A finite offset is clamped into 0-1. A non-finite one — the 0/0 a zero-length
 * gradient line produces — falls back to the last valid stop, so the gradient
 * still paints (flat at that point) instead of throwing and losing the capture.
 */
export function sanitiseGradientOffset(offset, previousOffset = GRADIENT_OFFSET_FALLBACK) {
  const value = Number(offset);
  if (Number.isFinite(value)) return clampGradientOffset(value);
  return clampGradientOffset(previousOffset);
}

/** A canvas gradient coordinate must be a finite number. */
export function sanitiseGradientCoordinate(value) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : 0;
}

/** A radial radius must be finite and never negative. */
export function sanitiseRadialRadius(value) {
  return Math.max(0, sanitiseGradientCoordinate(value));
}

function describeValue(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'number') return String(value);
  return String(value).slice(0, 60);
}

/** Replace a method on a live prototype, only when it can be replaced. */
function replacePrototypeMethod(target, name, build) {
  const original = target && typeof target[name] === 'function' ? target[name] : null;
  if (!original) return null;
  const replacement = build(original);
  target[name] = replacement;
  // A non-writable method is left exactly as it was.
  if (target[name] !== replacement) return null;
  return { original, replacement };
}

function restorePrototypeMethod(target, name, patched) {
  if (patched && target[name] === patched.replacement) target[name] = patched.original;
}

function classNameOf(element) {
  const value = element?.className;
  if (typeof value === 'string') return value.slice(0, 120);
  return String(element?.getAttribute?.('class') || '').slice(0, 120);
}

/**
 * Remove a gradient from any element that measures nothing on screen.
 *
 * A zero-width or zero-height box cannot paint anything, so removing its
 * background image cannot change the captured document — it only stops
 * html2canvas building a gradient whose line is zero long, which is what
 * produces the non-finite colour stop.
 *
 * @param {Document} scope the capture document
 * @returns {Array<{tag: string, className: string, width: number, height: number, backgroundImage: string}>}
 *   what was neutralised, so the capture can report it
 */
export function neutraliseDegenerateGradients(scope) {
  const documentScope = scope && typeof scope.querySelectorAll === 'function' ? scope : null;
  if (!documentScope) return [];
  const view = documentScope.defaultView || null;
  const findings = [];

  documentScope.querySelectorAll('*').forEach((element) => {
    const backgroundImage = view?.getComputedStyle?.(element)?.backgroundImage || '';
    if (!backgroundImage.includes('gradient(')) return;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return;

    element.style.setProperty('background-image', 'none', 'important');
    findings.push({
      tag: String(element.tagName || '').toLowerCase(),
      className: classNameOf(element),
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      backgroundImage: backgroundImage.slice(0, 160),
    });
  });

  return findings;
}

/**
 * Validate the canvas gradient API for the lifetime of one capture.
 *
 * @param {Window} [scope] the window whose canvas API paints the capture
 *   (the app's own window — html2canvas creates its canvas there)
 * @returns {{sanitisedStops: () => Array, restore: () => void}}
 */
export function installCanvasGradientGuard(scope) {
  const win = scope || (typeof window !== 'undefined' ? window : null);
  const gradientPrototype = win?.CanvasGradient?.prototype || null;
  const contextPrototype = win?.CanvasRenderingContext2D?.prototype || null;
  const sanitisedStops = [];
  const report = { sanitisedStops: () => sanitisedStops.slice(), restore: () => {} };
  if (!gradientPrototype || !contextPrototype) return report;

  const lastOffsetByGradient = new WeakMap();

  const patchedAddColorStop = replacePrototypeMethod(gradientPrototype, 'addColorStop', (original) => (
    function addColorStop(offset, color) {
      const safeOffset = sanitiseGradientOffset(offset, lastOffsetByGradient.get(this));
      if (!Number.isFinite(Number(offset))) {
        sanitisedStops.push({ received: describeValue(offset), used: safeOffset });
      }
      lastOffsetByGradient.set(this, safeOffset);
      return original.call(this, safeOffset, color);
    }
  ));

  const patchedLinearGradient = replacePrototypeMethod(contextPrototype, 'createLinearGradient', (original) => (
    function createLinearGradient(...args) {
      return original.apply(this, args.map(sanitiseGradientCoordinate));
    }
  ));

  const patchedRadialGradient = replacePrototypeMethod(contextPrototype, 'createRadialGradient', (original) => (
    function createRadialGradient(...args) {
      return original.apply(this, args.map((value, index) => (
        index === 2 || index === 5 ? sanitiseRadialRadius(value) : sanitiseGradientCoordinate(value)
      )));
    }
  ));

  return {
    sanitisedStops: () => sanitisedStops.slice(),
    restore: () => {
      restorePrototypeMethod(gradientPrototype, 'addColorStop', patchedAddColorStop);
      restorePrototypeMethod(contextPrototype, 'createLinearGradient', patchedLinearGradient);
      restorePrototypeMethod(contextPrototype, 'createRadialGradient', patchedRadialGradient);
    },
  };
}

export default installCanvasGradientGuard;