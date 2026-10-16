/**
 * reportDesignIntentRecord.js (shared)
 * ------------------------------------
 * WHAT IS SAVED BESIDE A PROJECT REPORT when an Astra Design Intent is generated,
 * and the one rule that decides whether it may ever be shown.
 *
 * The narrative is saved against the exact report version and the exact frozen
 * evidence it was written from, so reopening a report shows the narrative that
 * belongs to it — and a narrative written for a different design is never shown as
 * if it belonged to this one. Nothing here is regenerated on opening: a narrative
 * exists only because a designer asked for one, and it is displayed only while the
 * evidence it was written against is still the evidence the report stands on.
 *
 * The record is metadata plus the accepted text. A rejected or failed attempt is
 * recorded with its reason and carries NO text at all, so an incomplete or
 * refused draft can never reach the page.
 *
 * This is not a second engineering authority: it carries no figure, no level and
 * no product, and nothing in the report is read from it.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** What became of one Design Intent attempt. */
export const DESIGN_INTENT_STATUS = Object.freeze({
  /** Validated and accepted: the only status that may be displayed. */
  ACCEPTED: 'accepted',
  /** The provider returned a draft that broke a writer rule: never displayed. */
  REJECTED: 'rejected',
  /** The provider failed, timed out or returned nothing: never displayed. */
  FAILED: 'failed',
});

/** The keys of the saved narrative, in the order they are stated. */
const SOURCE_FINGERPRINT_KEYS = Object.freeze([
  'engineeringFingerprint',
  'calculationFingerprint',
  'seatPriorityFingerprint',
]);

function asText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The frozen-evidence identity a narrative is saved against, in canonical shape. */
export function designIntentEvidenceFingerprints(sourceFingerprints = null) {
  const given = (sourceFingerprints && typeof sourceFingerprints === 'object') ? sourceFingerprints : {};
  return Object.fromEntries(SOURCE_FINGERPRINT_KEYS.map((key) => [key, asText(given[key])]));
}

/**
 * Whether a narrative may be displayed for the evidence the report now stands on.
 * A narrative is shown only when it was ACCEPTED, when its text is present and
 * complete enough to print, and when every fingerprint both sides state agrees.
 * A fingerprint that either side cannot state is never treated as a difference, so
 * staleness is never manufactured — exactly as the saved-report status rule reads
 * the same three inputs.
 *
 * @param {Object|null} saved — the saved narrative metadata
 * @param {Object|null} currentFingerprints — the evidence the report stands on now
 * @returns {{ displayable: boolean, reason: string|null, text: string|null }}
 */
export function readAcceptedDesignIntent(saved, currentFingerprints = null) {
  const record = (saved && typeof saved === 'object' && !Array.isArray(saved)) ? saved : null;
  if (!record) return { displayable: false, reason: 'no_saved_narrative', text: null };
  if (record.status !== DESIGN_INTENT_STATUS.ACCEPTED) {
    return { displayable: false, reason: `not_accepted:${record.status || 'unknown'}`, text: null };
  }

  const text = asText(record.text);
  if (!text || !isCompleteNarrative(text)) {
    return { displayable: false, reason: 'incomplete_narrative', text: null };
  }

  const savedFp = designIntentEvidenceFingerprints(record.evidence_fingerprints);
  const currentFp = designIntentEvidenceFingerprints(currentFingerprints);
  for (const key of SOURCE_FINGERPRINT_KEYS) {
    if (!savedFp[key] || !currentFp[key]) continue;
    if (savedFp[key] !== currentFp[key]) {
      return { displayable: false, reason: `evidence_moved:${key}`, text: null };
    }
  }

  return { displayable: true, reason: null, text };
}

/**
 * Whether a returned narrative is finished prose rather than a fragment: it ends
 * on sentence punctuation, it is long enough to be a paragraph rather than a
 * heading, and it is not an echo of the contract. A draft that fails this is never
 * displayed, whatever its validation status said.
 */
export function isCompleteNarrative(text) {
  const value = asText(text);
  if (!value) return false;
  if (value.length < 120) return false;
  if (!/[.!?"\u201d]$/.test(value)) return false;
  return value.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean).length >= 2;
}

/**
 * The record saved beside the report.
 *
 * @param {Object} input
 * @param {string} input.status — DESIGN_INTENT_STATUS
 * @param {string|null} [input.text] — the accepted narrative, or null
 * @param {Object} [input.sourceFingerprints] — the evidence the report stands on
 * @param {Object} [input.providerIdentity] — provider, model, versions, durations
 * @param {string} [input.generatedBy]
 * @param {string} [input.generatedAt]
 * @param {Object|null} [input.rejection] — the refusal, when there is one
 * @returns {Object} the saved metadata
 */
export function buildDesignIntentRecord({
  status,
  text = null,
  sourceFingerprints = null,
  evidencePackFingerprint = null,
  inputFingerprint = null,
  providerIdentity = {},
  generatedBy = null,
  generatedAt = null,
  rejection = null,
} = {}) {
  const accepted = status === DESIGN_INTENT_STATUS.ACCEPTED;
  return {
    status: typeof status === 'string' ? status : DESIGN_INTENT_STATUS.FAILED,
    // Never stored beside a refusal: an unaccepted draft carries no text at all.
    text: accepted ? asText(text) : null,
    evidence_fingerprints: designIntentEvidenceFingerprints(sourceFingerprints),
    evidence_pack_fingerprint: asText(evidencePackFingerprint),
    input_fingerprint: asText(inputFingerprint),
    provider: providerIdentity.provider ?? null,
    model: providerIdentity.model ?? null,
    prompt_version: providerIdentity.promptVersion ?? null,
    contract_version: providerIdentity.contractVersion ?? null,
    validator_fingerprint: providerIdentity.validatorFingerprint ?? null,
    duration_ms: Number.isFinite(providerIdentity.durationMs) ? providerIdentity.durationMs : null,
    generated_at: asText(generatedAt),
    generated_by: asText(generatedBy),
    rejection: rejection
      ? { code: rejection.code ?? null, detail: rejection.detail ?? null }
      : null,
  };
}

export default buildDesignIntentRecord;