/**
 * Live background worker-input readiness.
 *
 * Reflects the ACTUAL live payload needed by the background worker, NOT the
 * completed foreground authority. The background worker requires a non-empty
 * raw response curve and active subwoofers before it can generate a candidate
 * pool. A restored completed authority can satisfy foregroundReady but must
 * NOT start speculative jobs until the live rawCurve has hydrated.
 *
 * Curve points are { frequency, spl } (see buildAuthoritativeResponseCurves).
 * `frequency` is the mandatory axis (always finite and > 0 after the response
 * filter); `spl` may be null for some points and the worker tolerates that, so
 * only the frequency axis is validated here.
 *
 * @param {object} params
 * @param {Array}  params.rspRawCurve  - live RSP raw curve points
 * @param {Array}  params.sources      - active subwoofer sources (activeSubs)
 * @returns {boolean}
 */
export function isBackgroundInputsReady({ rspRawCurve, sources } = {}) {
  if (!Array.isArray(rspRawCurve) || rspRawCurve.length === 0) return false;
  for (const point of rspRawCurve) {
    if (!point || !Number.isFinite(point.frequency) || point.frequency <= 0) return false;
  }
  if (!Array.isArray(sources) || sources.length === 0) return false;
  return true;
}