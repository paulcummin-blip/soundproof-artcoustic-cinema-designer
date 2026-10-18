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
 * @param {Object} [options]
 * @param {string|null} [options.currentGeometryFingerprint] — the geometry the design
 *   holds now, from the same shared geometry authority. A narrative whose frozen
 *   geometry no longer matches is not shown: an explanation of a seating position is
 *   only true of the room it was written in.
 * @param {string|null} [options.currentVisualFingerprint] — the pictures that represent
 *   the design now, from the same shared visual context authority. A narrative whose
 *   frozen selection no longer matches was written while a different set of images
 *   stood for this design, so it is not presented as current.
 * @returns {{ displayable: boolean, reason: string|null, text: string|null }}
 */
export function readAcceptedDesignIntent(saved, currentFingerprints = null, {
  currentGeometryFingerprint = null,
  currentVisualFingerprint = null,
} = {}) {
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

  // THE GEOMETRY, on the same rule as the evidence: a fingerprint either side cannot
  // state is never treated as a difference, so a narrative written before the
  // geometry was frozen is not hidden for a reason nobody can state.
  const savedGeometry = asText(record.geometry_fingerprint);
  const currentGeometry = asText(currentGeometryFingerprint);
  if (savedGeometry && currentGeometry && savedGeometry !== currentGeometry) {
    return { displayable: false, reason: 'geometry_moved', text: null };
  }

  // THE PICTURES, on the same rule again. A narrative written while one set of
  // images represented this design describes the cinema those images showed, so once
  // the selection changes it is not presented as current: replacing a render is a
  // change of visual identity, and the design now reads differently on the page.
  const savedVisual = asText(record.visual_fingerprint);
  const currentVisual = asText(currentVisualFingerprint);
  if (savedVisual && currentVisual && savedVisual !== currentVisual) {
    return { displayable: false, reason: 'visual_context_moved', text: null };
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
 * @param {string|null} [input.geometryFingerprint] — the frozen geometry the narrative
 *   was written from, where the writer was given one. Null when no usable geometry was
 *   supplied, which is honest: a narrative that explains no seating position is pinned
 *   to no room.
 * @param {string|null} [input.visualFingerprint] — the identity of the image selection
 *   the narrative was written from, where the writer was shown pictures. Null when no
 *   usable selection was supplied, which is honest: a narrative written from the frozen
 *   evidence alone is pinned to no image set and is never hidden when images change.
 * @param {Object|null} [input.visualContext] — the compact identity of that selection:
 *   which pictures, each with the revision of its own file and the designer's own
 *   metadata describing it. No storage address appears in it.
 * @param {Object} [input.providerIdentity] — provider, model, versions, durations
 * @param {string} [input.generatedBy]
 * @param {string} [input.generatedAt]
 * @param {Object|null} [input.rejection] — the refusal, when there is one
 * @param {Object|null} [input.editorial] — the ADI editorial act, where the wording
 *   of an already-accepted narrative was improved: when it was improved, by whom,
 *   and the wording it replaced. Wording only: the evidence identity, the geometry
 *   and the image fingerprints are carried across unchanged, so an improved
 *   narrative is pinned to exactly what the narrative it replaces was pinned to.
 *   Absent — not null — on every record that was not editorially improved, so a
 *   record written before this existed is unchanged.
 * @returns {Object} the saved metadata
 */
export function buildDesignIntentRecord({
  status,
  text = null,
  sourceFingerprints = null,
  evidencePackFingerprint = null,
  inputFingerprint = null,
  geometryFingerprint = null,
  visualFingerprint = null,
  visualContext = null,
  providerIdentity = {},
  generatedBy = null,
  generatedAt = null,
  rejection = null,
  editorial = null,
} = {}) {
  const accepted = status === DESIGN_INTENT_STATUS.ACCEPTED;
  return {
    status: typeof status === 'string' ? status : DESIGN_INTENT_STATUS.FAILED,
    // Never stored beside a refusal: an unaccepted draft carries no text at all.
    text: accepted ? asText(text) : null,
    evidence_fingerprints: designIntentEvidenceFingerprints(sourceFingerprints),
    evidence_pack_fingerprint: asText(evidencePackFingerprint),
    input_fingerprint: asText(inputFingerprint),
    geometry_fingerprint: asText(geometryFingerprint),
    // THE PICTURES the words were written from, and which revision of each file:
    // the identity of the selection, never a storage address, so nothing saved here
    // can depend on a link that expires or moves.
    visual_fingerprint: asText(visualFingerprint),
    visual_context: visualContext && typeof visualContext === 'object' ? visualContext : null,
    provider: providerIdentity.provider ?? null,
    model: providerIdentity.model ?? null,
    prompt_version: providerIdentity.promptVersion ?? null,
    contract_version: providerIdentity.contractVersion ?? null,
    validator_fingerprint: providerIdentity.validatorFingerprint ?? null,
    duration_ms: Number.isFinite(providerIdentity.durationMs) ? providerIdentity.durationMs : null,
    generated_at: asText(generatedAt),
    generated_by: asText(generatedBy),
    // ── THE EDITORIAL ACT, where ADI improved this wording ──
    // The words were written when they were written and improved when they were
    // improved: the generation identity above is left exactly as it was, and this
    // states the editorial pass beside it — when, by whom, in which mode, and the
    // wording revision it replaced and the one it saved. Absent, not null, unless
    // there was one, so a record written before this existed is unchanged.
    ...(editorial
      ? {
        editorial: {
          improved_at: asText(editorial.improvedAt),
          improved_by: asText(editorial.improvedBy),
          mode: asText(editorial.mode),
          source_revision: asText(editorial.sourceRevision),
          improved_revision: asText(editorial.improvedRevision),
        },
      }
      : {}),
    rejection: rejection
      ? { code: rejection.code ?? null, detail: rejection.detail ?? null }
      : null,
  };
}

export default buildDesignIntentRecord;