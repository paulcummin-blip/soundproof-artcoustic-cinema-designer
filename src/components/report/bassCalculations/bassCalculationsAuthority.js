// bassCalculationsAuthority.js
// ---------------------------------------------------------------------------
// Data authority for the "BASS CALCULATIONS" report page.
//
// Reads the SAME saved completed bass contract the Technical Report's bass
// response graphs read (via the finished-graph adapter), and extracts the four
// saved response curves the page plots:
//
//   1. Raw Bass Response      — graphPayload.roomResponseCurve
//   2. Selected Subwoofers     — graphPayload.sourceCapabilityCurves (array)
//   3. Subwoofers In-Room      — graphPayload.physicalRawResponseCurve
//   4. Final EQ Response       — graphPayload.postEqRspCurve
//      (+ target: graphPayload.productionHouseCurveTarget when present)
//
// The authority is fingerprint-gated: the saved contract's resultFingerprint
// must match the current calculation fingerprint, so a stale contract is never
// drawn as the current design. When anything is missing or stale it reports
// not-ready and the page states that plainly — no curve is invented, smoothed
// into existence, or reconstructed from RP22 scores.
//
// Pure: no React, no fetching, no side effects.

const NUM = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const cloneCurve = (curve) =>
  Array.isArray(curve)
    ? curve
        .map((p) => {
          const frequency = NUM(p?.frequency);
          const spl = NUM(p?.spl);
          if (frequency == null || spl == null) return null;
          return { frequency, spl };
        })
        .filter(Boolean)
    : [];

/**
 * Build the four-curve data for the Bass Calculations page.
 *
 * @param {object} params
 * @param {object|null} params.contract - the saved completed bass contract
 * @param {boolean} [params.authoritative] - the evidence store's authority flag
 * @param {string|null} [params.currentFingerprint] - the current calculation
 *   fingerprint; when supplied and mismatched, the authority reports stale
 * @returns {{ready: boolean, reason: string|null, resultFingerprint: string|null, graphs: object}}
 */
export function buildBassCalculationsData({
  contract = null,
  authoritative = false,
  currentFingerprint = null,
} = {}) {
  const empty = {
    ready: false,
    reason: "no-current-bass-authority",
    resultFingerprint: null,
    graphs: { raw: [], subs: [], inRoom: [], final: [], target: [] },
  };

  if (authoritative !== true) return empty;
  if (!contract?.graphPayload) return { ...empty, reason: "no-graph-payload" };

  const gp = contract.graphPayload;
  const resultFingerprint = contract?.job?.resultFingerprint || null;

  if (currentFingerprint && resultFingerprint && currentFingerprint !== resultFingerprint) {
    return { ...empty, reason: "fingerprint-mismatch", resultFingerprint };
  }

  const raw = cloneCurve(gp.roomResponseCurve);
  const inRoom = cloneCurve(gp.physicalRawResponseCurve);
  const final = cloneCurve(gp.postEqRspCurve);
  const target = cloneCurve(gp.productionHouseCurveTarget);
  const subs = Array.isArray(gp.sourceCapabilityCurves)
    ? gp.sourceCapabilityCurves.map((c) => cloneCurve(c)).filter((c) => c.length > 0)
    : [];

  const graphs = { raw, subs, inRoom, final, target };

  const missing = [];
  if (raw.length === 0) missing.push("roomResponseCurve");
  if (inRoom.length === 0) missing.push("physicalRawResponseCurve");
  if (final.length === 0) missing.push("postEqRspCurve");
  if (subs.length === 0) missing.push("sourceCapabilityCurves");

  if (missing.length > 0) {
    return {
      ready: false,
      reason: `missing-curves:${missing.join(",")}`,
      resultFingerprint,
      graphs,
    };
  }

  return {
    ready: true,
    reason: null,
    resultFingerprint,
    graphs,
  };
}