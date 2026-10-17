/**
 * reportDesignIntentGenerationReport.js (shared)
 * ----------------------------------------------
 * THE PURE GENERATION RESULT of one Project Report Design Intent attempt.
 *
 * It turns the writer's own raw attempt into the one object every caller reads: the
 * generated text and its word count, the prompt version AND the content fingerprint
 * of the prompt the writer was actually called with, the contract and input
 * identities, the validation result, the evidence the attempt used and the evidence
 * it was deliberately kept from.
 *
 * IT TOUCHES NO ENTITY. There is no client, no read and no write in this module —
 * it is handed objects that were already read and returns a description of them. It
 * is therefore safe on any path, including one that must be incapable of writing,
 * and it is why the preview can report the full generation result without holding a
 * write-capable client of its own.
 *
 * Nothing here is chosen or recomputed: every value is read from the attempt, the
 * writer input the writer was given, or the frozen pack. The preview reports the
 * production evidence selection rather than a second opinion about it.
 *
 * Pure: no entities, no React, no SDK, no runtime-specific APIs.
 */

import { buildWriterPrompt } from '../proposalWriter/writerPromptBuilder.js';
import { WRITER_PROMPT_VERSION } from '../proposalWriter/writerContractSchema.js';
import { proposalEvidenceFingerprint } from '../proposalEvidence/proposalEvidenceBuilder.js';
import { wordCount } from '../proposalWriter/writerVocabulary.js';

// ONE word count across the whole writer path: the shared vocabulary's own, never a
// second implementation that could disagree with the validator's.
export { wordCount };

/** At most this many entries of any one evidence list are returned. */
const LIST_CAP = 60;

/**
 * THE PROMPT THE WRITER WAS GIVEN, AND ITS CONTENT IDENTITY.
 *
 * The fingerprint is taken here, from the exact writer input the provider received,
 * with the same content authority the pack and the input use — so a preview's prompt
 * fingerprint is by construction the CURRENT one: a fingerprint of the prompt built
 * now from the current contract and the current Design Intent brief, never a value
 * read back from a saved record.
 */
export function designIntentPromptIdentity(writerInput = null) {
  const version = writerInput?.prompt_version || null;

  let fingerprint = null;
  try {
    if (writerInput) {
      fingerprint = proposalEvidenceFingerprint({ prompt: buildWriterPrompt({ input: writerInput }) });
    }
  } catch (error) {
    fingerprint = null;
  }

  return {
    version,
    current: WRITER_PROMPT_VERSION,
    // A match means the input the writer was given carries the prompt version this
    // build of the app defines, so the attempt ran under the current prompt.
    matches_current: version !== null && version === WRITER_PROMPT_VERSION,
    fingerprint,
  };
}

/** THE EVIDENCE THE ATTEMPT USED, read from the pack and the frozen report it was built from. */
export function designIntentEvidenceUsed({ pack = null, writerInput = null, snapshot = null } = {}) {
  const option = (pack?.options || [])[0] || null;
  const basis = pack?.evidence_basis || {};

  const stories = (option?.strength_stories || []).map((story) => ({
    story_id: story?.story_id ?? null,
    title: story?.title ?? null,
    category: story?.category ?? null,
    level: story?.level ?? null,
    scope: story?.scope ?? null,
  }));

  return {
    source: 'saved Project Report evidence',
    snapshot_id: snapshot?.id || null,
    mode: pack?.mode ?? null,
    pack_schema_version: pack?.schema_version ?? null,
    pack_fingerprint: pack?.pack_fingerprint ?? null,
    report_snapshot_ids: basis.report_snapshot_ids || [],
    report_fingerprints: basis.fingerprints || [],
    selected_stories: stories,
    selected_story_count: stories.length,
    pillars: (option?.client_story_pillars || []).map((pillar) => ({
      pillar: pillar?.pillar ?? null,
      label: pillar?.label ?? null,
    })),
    design_rationale: option?.design_rationale ?? null,
    allowed_claim_count: (pack?.allowed_claims || []).length,
    // The scoping the writer was given, so a reader can see the attempt wrote the one
    // section it was asked for.
    sections_in_scope: (writerInput?.section_requirements || []).map((section) => section?.section ?? null),
    design_scope: writerInput?.design_intent_scope?.section ?? null,
    word_limit: writerInput?.word_limits?.decision_summary ?? null,
    adi_interpretation_supplied: writerInput?.design_interpretation?.available === true,
  };
}

/** THE EVIDENCE THE ATTEMPT WAS KEPT FROM: the pack's own deterministic record of what it left out. */
export function designIntentEvidenceExcluded({ pack = null } = {}) {
  const option = (pack?.options || [])[0] || null;

  const omitted = (option?.omitted_stories || []).slice(0, LIST_CAP).map((story) => ({
    story_id: story?.story_id ?? null,
    title: story?.title ?? null,
    level: story?.level ?? null,
    reason: story?.reason ?? story?.omitted_reason ?? null,
  }));

  const blocked = (pack?.blocked_claims || []).slice(0, LIST_CAP).map((block) => ({
    block_id: block?.block_id ?? null,
    area: block?.area ?? null,
    reason: block?.reason ?? null,
    prohibited: block?.prohibited ?? null,
  }));

  return {
    omitted_stories: omitted,
    omitted_story_count: (option?.omitted_stories || []).length,
    blocked_claims: blocked,
    blocked_claim_count: (pack?.blocked_claims || []).length,
    supporting_results: pack?.supporting_results ?? null,
    truncated: (option?.omitted_stories || []).length > LIST_CAP
      || (pack?.blocked_claims || []).length > LIST_CAP,
  };
}

/**
 * THE ONE GENERATION RESULT.
 *
 * @param {Object} input
 * @param {Object} input.attempt — the writer's own result (accepted or refused)
 * @param {Object} [input.writerInput] — the exact writer input the provider was given
 * @param {Object} [input.pack] — the frozen evidence pack it was built from
 * @param {Object} [input.snapshot] — the saved Project Report the narrative belongs to
 * @returns {Object} text, word count, prompt fingerprint, contract identity,
 *   validation result, evidence used and evidence excluded
 */
export function buildDesignIntentGenerationReport({
  attempt = null,
  writerInput = null,
  pack = null,
  snapshot = null,
} = {}) {
  const accepted = attempt?.ok === true;

  return {
    status: accepted ? 'accepted' : 'refused',
    text: accepted ? (attempt.text ?? null) : null,
    word_count: accepted ? wordCount(attempt.text) : 0,

    reason: accepted ? null : (attempt?.reason ?? null),
    detail: accepted ? null : (attempt?.detail ?? null),
    validation_result: attempt?.validation ?? null,
    validation_errors: attempt?.validation_errors || [],
    // The draft the validator refused. Evidence of what happened, never copy, and
    // never saved anywhere by the caller that reports it.
    refused_draft: accepted ? null : (attempt?.draft ?? null),

    prompt: designIntentPromptIdentity(writerInput),
    contract_version: writerInput?.contract_version ?? attempt?.contract_version ?? null,
    input_fingerprint: writerInput?.input_fingerprint
      ?? attempt?.input_fingerprint
      ?? attempt?.record?.input_fingerprint
      ?? null,
    evidence_pack_fingerprint: pack?.pack_fingerprint ?? attempt?.evidence_pack_fingerprint ?? null,
    geometry_fingerprint: attempt?.geometry_fingerprint ?? null,
    visual_fingerprint: attempt?.visual_fingerprint ?? null,

    provider: attempt?.provider ?? attempt?.provider_identity?.provider ?? null,
    model: attempt?.model ?? attempt?.provider_identity?.model ?? null,
    duration_ms: attempt?.duration_ms ?? attempt?.provider_identity?.durationMs ?? null,

    evidence_used: designIntentEvidenceUsed({ pack, writerInput, snapshot }),
    evidence_excluded: designIntentEvidenceExcluded({ pack }),
  };
}

export default buildDesignIntentGenerationReport;