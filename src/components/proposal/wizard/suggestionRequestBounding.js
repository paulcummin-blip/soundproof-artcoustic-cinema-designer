/**
 * suggestionRequestBounding.js
 * ----------------------------
 * The bounded wait around the ADI suggestion request.
 *
 * The Client Brief examples are optional assistance, so the wait for them is
 * bounded: once the maximum wait has elapsed the designer is given the general
 * examples and a Retry rather than a loading line that never clears.
 *
 * The request is NOT cancelled when the wait elapses, it is DISCARDED. The
 * bounding promise has already settled with 'timeout', so a response arriving
 * afterwards is never delivered to the caller: it can neither overwrite the
 * fallback nor change the brief. The timer is always cleared, and the promise
 * resolves exactly once whatever happens.
 *
 * Pure: no React, no SDK, no side effects beyond its own timer.
 */

/** The longest the Client Brief step waits for design-specific suggestions. */
export const SUGGESTION_TIMEOUT_MS = 30000;

/**
 * Settle as soon as the request settles, or report a timeout once the wait has
 * elapsed, whichever happens first.
 *
 * @param {Promise<any>} promise — the request to bound
 * @param {number} [ms] — the maximum wait in milliseconds
 * @returns {Promise<{ status: 'settled'|'failed'|'timeout', response?: any, error?: any }>}
 */
export function settleWithin(promise, ms = SUGGESTION_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let timer = null;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      resolve(result);
    };

    timer = setTimeout(() => finish({ status: 'timeout' }), ms);

    Promise.resolve(promise).then(
      (response) => finish({ status: 'settled', response }),
      (error) => finish({ status: 'failed', error }),
    );
  });
}

export default settleWithin;