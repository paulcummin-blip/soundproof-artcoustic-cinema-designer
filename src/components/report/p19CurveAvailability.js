/**
 * p19CurveAvailability.js
 * -----------------------
 * THE one P19 curve-availability authority.
 *
 * P19 is the corrected (post-EQ) response at the Reference Seating Position,
 * plotted against the target across the P19 assessment band. Whether that curve
 * exists is a fact about the SAVED completed bass evidence for this version — not
 * about which page is being read. It was previously decided separately on each
 * surface, which is how one page came to state the curve was unavailable while
 * another drew it.
 *
 * Every P19 surface reads this one resolver, so the report cannot contradict
 * itself:
 *
 *   · curve available  → the graph is drawn, and wording that describes the
 *                        curve's shape may be used because that curve supports it.
 *   · curve not available → the graph is not drawn, and NO wording describes the
 *                        shape of a curve the report does not hold.
 *
 * It resolves through the shared P19 graph builder — the same evidence, the same
 * builders, the same band — so this adds no second reading of the bass maths and
 * recalculates nothing. Pure: no React, no fetching, no side effects.
 */

import { buildP19RspGraph } from './technical/bassResponseGraphAuthority';

/**
 * Whether the current saved P19 curve exists, and the graph built from it.
 *
 * @param {object} params
 * @param {object|null} [params.graph] - an already-built buildP19RspGraph result
 * @param {object|null} [params.contract] - the saved completed bass contract
 * @param {boolean} [params.authoritative] - the evidence store's own authority flag
 * @param {object|null} [params.roomDims] - { widthM, lengthM, heightM }
 * @returns {{ available: boolean, reason: string|null, graph: object }}
 */
export function resolveP19CurveAvailability({ graph = null, contract = null, authoritative = false, roomDims = null } = {}) {
  const resolved = graph || buildP19RspGraph({ contract, authoritative, roomDims });
  return {
    available: resolved?.ready === true,
    reason: resolved?.ready === true ? null : (resolved?.reason || 'no-curves'),
    graph: resolved,
  };
}

/**
 * What the page says about the result.
 *
 * Wording that describes the curve — how closely the response follows the
 * target, whether any region stands out — is only used when that curve is
 * actually held. With no curve, the page states the published result and its
 * deviation from the target, and claims nothing about the response's shape.
 *
 * @param {string|null} level - the published P19 level
 * @param {boolean} curveAvailable
 * @param {{ withCurve: object, withoutCurve: object }} wording
 * @returns {string|null}
 */
export function selectP19Interpretation(level, curveAvailable, { withCurve = {}, withoutCurve = {} } = {}) {
  if (!level) return null;
  const wording = curveAvailable ? withCurve : withoutCurve;
  return wording?.[level] || null;
}

export default resolveP19CurveAvailability;