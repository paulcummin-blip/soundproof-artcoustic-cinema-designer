/**
 * designIntentAuthority.js
 * ------------------------
 * WHICH Design Intent the Project Report shows.
 *
 * The report always has a Design Intent: the deterministic paragraph the report's
 * own intent authority composes from the saved design, which is what the report
 * renders when nothing else is accepted. When an Astra narrative has been
 * generated for THIS report and validated, and the evidence it was written
 * against is still the evidence the report stands on, that narrative is shown
 * instead.
 *
 * The order is deliberate and it is the reliability rule: the deterministic text
 * is the floor, never the casualty. A narrative that was refused, that failed, or
 * that was written for a different design is not shown at all — it is not
 * displayed partially, not displayed with a warning, and never mixed with the
 * deterministic text. The report reads as one finished document either way.
 *
 * This is the DISPLAY half of the rule the shared record states for the server:
 * the narrative is shown only when it was accepted in full, its text is finished
 * prose rather than a fragment, and every fingerprint both sides state agrees.
 *
 * Pure: no React, no DOM, no side effects.
 */

/** The status a narrative must carry to be displayable at all. */
const ACCEPTED = 'accepted';

const FINGERPRINT_KEYS = ['engineeringFingerprint', 'calculationFingerprint', 'seatPriorityFingerprint'];

/** The two sources a report's Design Intent can come from. */
export const DESIGN_INTENT_SOURCE = Object.freeze({
  ASTRA: 'astra',
  DETERMINISTIC: 'deterministic',
});

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Whether returned text is finished prose rather than a fragment: it ends on
 * sentence punctuation, is long enough to be a paragraph, and carries more than
 * one sentence. Incomplete output is never displayed, whatever its status says.
 */
export function isCompleteDesignIntentText(text) {
  const value = asText(text);
  if (!value) return false;
  if (value.length < 120) return false;
  if (!/[.!?"\u201d]$/.test(value)) return false;
  return value.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length >= 2;
}

/** The three fingerprints, in canonical shape, from either side. */
function fingerprintsOf(value) {
  const given = (value && typeof value === 'object') ? value : {};
  return Object.fromEntries(FINGERPRINT_KEYS.map((key) => [key, asText(given[key])]));
}

/**
 * Resolve the Design Intent the report shows.
 *
 * @param {Object} input
 * @param {string|null} [input.deterministic] — the report's own composed intent
 * @param {Object|null} [input.saved] — the saved Astra narrative metadata
 * @param {Object|null} [input.currentSourceFingerprints] — the evidence the saved
 *   report stands on now
 * @returns {{ text: string|null, source: string, reason: string|null }}
 */
export function resolveDesignIntent({
  deterministic = null,
  saved = null,
  currentSourceFingerprints = null,
} = {}) {
  const fallback = asText(deterministic);
  const record = (saved && typeof saved === 'object' && !Array.isArray(saved)) ? saved : null;

  const asDeterministic = (reason) => ({
    text: fallback,
    source: DESIGN_INTENT_SOURCE.DETERMINISTIC,
    reason,
  });

  if (!record) return asDeterministic('no_saved_narrative');
  if (record.status !== ACCEPTED) return asDeterministic(`not_accepted:${record.status || 'unknown'}`);

  const text = asText(record.text);
  if (!isCompleteDesignIntentText(text)) return asDeterministic('incomplete_narrative');

  // A fingerprint that either side cannot state is never treated as a difference,
  // so a narrative is never hidden for a reason the report cannot state.
  const savedFp = fingerprintsOf(record.evidence_fingerprints);
  const currentFp = fingerprintsOf(currentSourceFingerprints);
  for (const key of FINGERPRINT_KEYS) {
    if (!savedFp[key] || !currentFp[key]) continue;
    if (savedFp[key] !== currentFp[key]) return asDeterministic(`evidence_moved:${key}`);
  }

  return { text, source: DESIGN_INTENT_SOURCE.ASTRA, reason: null };
}

export default resolveDesignIntent;