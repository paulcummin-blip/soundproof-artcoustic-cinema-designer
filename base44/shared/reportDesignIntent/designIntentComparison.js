/**
 * designIntentComparison.js (shared)
 * ----------------------------------
 * THE READ-ONLY, CONTROLLED COMPARISON of the Project Report Design Intent written
 * with and without the Project Library's own images.
 *
 * It is not a second writer. It runs the ONE existing production attempt,
 * runReportDesignIntent, twice against the same frozen evidence:
 *
 *   A. engineering only   — the visual reader returns nothing
 *   B. engineering + images — the visual reader returns the real selection
 *
 * Everything else is the same object the production writer uses: the Design Intent
 * input builder, the frozen evidence pack, the ADI interpretation, the writing
 * authority, the prompt version, the Astra model the flag resolves to, the output
 * contract and the engineering validator. The ONLY intentional difference between
 * the two runs is the visual context. The complete writer-input fingerprints
 * therefore differ (the visual block is part of the input), and the ENGINEERING
 * evidence-pack fingerprint is proven identical.
 *
 * When the visual context is empty there is nothing to compare: B would be a
 * byte-identical request to A, so no second model call is made and the result says
 * so. That is the text-only control.
 *
 * READ-ONLY BY CONSTRUCTION. This module imports no entity, no SDK and no write
 * primitive. It is handed an `invokeLLM` and a `readEvidence` and nothing else; the
 * caller decides what those can reach. It never returns the images' addresses.
 *
 * Pure apart from the injected calls: no React, no SDK, no runtime-specific APIs.
 */

import { runReportDesignIntent } from './reportDesignIntentRunner.js';
import { visualContextIdentity, visualContextSources } from './reportVisualContext.js';

/** The conditions of the two runs, named once so a result can state them. */
export const COMPARISON_RUN = Object.freeze({
  TEXT_ONLY: 'text_only',
  WITH_IMAGES: 'with_images',
});

/** Why the images run was not made. */
export const COMPARISON_SKIP = Object.freeze({
  NO_VISUAL_CONTEXT: 'no_eligible_images_text_only_control',
});

/** Whole words in a passage, for the editorial length check. */
export function wordCount(text) {
  return typeof text === 'string' ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

/** One run's outcome, reduced to what a reviewer reads. Never an address. */
function summarise(run, attempt, visual) {
  return {
    run,
    ok: attempt?.ok === true,
    reason: attempt?.reason ?? null,
    detail: attempt?.detail ?? null,
    text: attempt?.ok === true ? attempt.text : null,
    word_count: attempt?.ok === true ? wordCount(attempt.text) : 0,
    model: attempt?.model ?? attempt?.provider_identity?.model ?? null,
    prompt_version: attempt?.prompt_version ?? attempt?.provider_identity?.promptVersion ?? null,
    contract_version: attempt?.contract_version ?? attempt?.provider_identity?.contractVersion ?? null,
    duration_ms: attempt?.duration_ms ?? attempt?.provider_identity?.durationMs ?? null,
    evidence_pack_fingerprint: attempt?.evidence_pack_fingerprint ?? null,
    input_fingerprint: attempt?.input_fingerprint ?? null,
    images_attached: run === COMPARISON_RUN.WITH_IMAGES ? visualContextSources(visual).length : 0,
    visual_fingerprint: run === COMPARISON_RUN.WITH_IMAGES ? (attempt?.visual_fingerprint ?? null) : null,
    // The validator's own refusals, for a refused draft: the rule, never a rewrite.
    validation_errors: attempt?.ok === true ? [] : (attempt?.validation_errors || []),
    // What a refused draft actually said, so a refusal is read rather than assumed.
    refused_draft: attempt?.ok === true ? null : (attempt?.draft ?? null),
  };
}

/**
 * Run the controlled comparison for ONE project and version.
 *
 * @param {Object} input
 * @param {Object} input.flag — the writer's resolved flag (model included)
 * @param {Array<string>} input.versionIds
 * @param {Function} input.readEvidence — async ({ versionIds }) => frozen evidence
 * @param {Function} input.invokeLLM — the injected provider call
 * @param {Function} input.readVisualContext — async () => the real image selection
 * @param {Function} [input.readGeometryContext] — the same geometry for both runs
 * @param {Object} [input.project]
 * @param {Object} [input.engineeringSnapshot]
 * @param {Object} [input.sourceFingerprints]
 * @param {string} [input.now]
 * @param {Function} [input.validate] — injected for tests; the shared validator otherwise
 * @returns {Promise<Object>} the two runs and the proof of what differed
 */
export async function runDesignIntentVisualComparison({
  flag,
  versionIds,
  readEvidence,
  invokeLLM,
  readVisualContext,
  readGeometryContext = null,
  project = null,
  engineeringSnapshot = null,
  sourceFingerprints = null,
  now = null,
  validate = undefined,
} = {}) {
  // The visual selection is read ONCE, so both the decision to run B and the images
  // B is shown come from one read and can never disagree.
  let visual = null;
  try {
    visual = typeof readVisualContext === 'function' ? await readVisualContext() : null;
  } catch (error) {
    visual = null;
  }
  const hasVisual = visual?.available === true && visualContextSources(visual).length > 0;

  // The two attempts differ in exactly one input: the visual reader.
  const common = {
    flag,
    versionIds,
    readEvidence,
    invokeLLM,
    readGeometryContext,
    project,
    engineeringSnapshot,
    sourceFingerprints,
    now,
    ...(validate ? { validate } : {}),
  };

  const textOnly = await runReportDesignIntent({ ...common, readVisualContext: async () => null });
  const textOnlySummary = summarise(COMPARISON_RUN.TEXT_ONLY, textOnly, null);

  // THE TEXT-ONLY CONTROL: nothing to attach means B would repeat A byte for byte,
  // so no second model call is made.
  if (!hasVisual) {
    return {
      text_only: textOnlySummary,
      with_images: null,
      skipped: COMPARISON_SKIP.NO_VISUAL_CONTEXT,
      visual_reason: visual?.reason ?? 'no_visual_context',
      model_calls: 1,
      proof: proofOf(textOnlySummary, null),
    };
  }

  const withImages = await runReportDesignIntent({ ...common, readVisualContext: async () => visual });
  const withImagesSummary = summarise(COMPARISON_RUN.WITH_IMAGES, withImages, visual);

  return {
    text_only: textOnlySummary,
    with_images: withImagesSummary,
    skipped: null,
    visual_reason: null,
    // The identity of what the pictures were: id, file, role, purpose, caption. Never an address.
    visual_identity: visualContextIdentity(visual),
    model_calls: 2,
    proof: proofOf(textOnlySummary, withImagesSummary),
  };
}

/**
 * The proof the comparison was controlled. The ENGINEERING evidence fingerprint must
 * be identical; the complete input fingerprints are expected to differ, because the
 * visual block is part of the input and is the only intentional difference.
 */
function proofOf(textOnly, withImages) {
  if (!withImages) {
    return {
      evidence_pack_fingerprint: textOnly.evidence_pack_fingerprint,
      evidence_fingerprint_identical: null,
      input_fingerprints_differ: null,
      same_model: null,
      same_prompt_version: null,
      same_contract_version: null,
    };
  }
  return {
    evidence_pack_fingerprint: textOnly.evidence_pack_fingerprint,
    evidence_fingerprint_identical: textOnly.evidence_pack_fingerprint !== null
      && textOnly.evidence_pack_fingerprint === withImages.evidence_pack_fingerprint,
    input_fingerprints_differ: textOnly.input_fingerprint !== withImages.input_fingerprint,
    same_model: textOnly.model !== null && textOnly.model === withImages.model,
    same_prompt_version: textOnly.prompt_version !== null && textOnly.prompt_version === withImages.prompt_version,
    same_contract_version: textOnly.contract_version !== null
      && textOnly.contract_version === withImages.contract_version,
  };
}

export default runDesignIntentVisualComparison;