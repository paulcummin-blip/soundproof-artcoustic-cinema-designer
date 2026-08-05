/**
 * canonicalP2Authority
 * ---------------------
 * Pure function: evaluates RP22 Parameter 2 —
 * "Decoder/renderer capability and discretely rendered speaker configuration,
 *  excluding subwoofers."
 *
 * Canonical source: app.dolbyLayout (listenerLevel.subwoofer.upper format)
 *
 * Grading (Dolby):
 *   < 5   → FAIL
 *   5–10  → L1
 *   11–14 → L2
 *   ≥ 15  → L4  (L3 shares the same 15 threshold; no separate L3 range)
 *
 * Subwoofer count is NEVER included in the discrete speaker count.
 */

const P2_TITLE = "Decoder/renderer capability and discretely rendered speaker configuration, excl. subwoofers";
const P2_UNIT = "count";

function parseLayoutField(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

export function evaluateCanonicalP2(layoutStr) {
  const noData = {
    title: P2_TITLE,
    value: null,
    formatted: null,
    configuration: null,
    level: null,
    unit: P2_UNIT,
    status: "no_data",
    applicable: false,
    source: "canonical-layout",
  };

  if (layoutStr == null) return noData;

  const str = String(layoutStr).trim();
  if (!str) return noData;

  // Take the first whitespace-delimited token (e.g. "9.4.6" from "9.4.6 Atmos")
  const base = str.split(/\s+/)[0];
  const parts = base.split(".");

  // Must have exactly listenerLevel and subwoofer (or listenerLevel.subwoofer.upper)
  if (parts.length < 2 || parts.length > 3) return noData;

  const listenerLevel = parseLayoutField(parts[0]);
  const subwoofer = parseLayoutField(parts[1]);
  const upper = parts.length >= 3 ? parseLayoutField(parts[2]) : 0;

  // All present fields must be valid non-negative integers
  if (listenerLevel === null || subwoofer === null) return noData;
  if (parts.length >= 3 && upper === null) return noData;

  // Reconstruct canonical configuration string
  const configuration = `${listenerLevel}.${subwoofer}.${upper}`;

  // Discrete speaker count = listener-level + upper (subwoofer excluded)
  const discreteSpeakerCount = listenerLevel + upper;

  // Grading (Dolby)
  let level;
  if (discreteSpeakerCount >= 15) level = "L4";
  else if (discreteSpeakerCount >= 11) level = "L2";
  else if (discreteSpeakerCount >= 5) level = "L1";
  else level = "FAIL";

  return {
    title: P2_TITLE,
    value: discreteSpeakerCount,
    formatted: `${discreteSpeakerCount} speakers`,
    configuration,
    level,
    unit: P2_UNIT,
    status: "ok",
    applicable: true,
    source: "canonical-layout",
  };
}