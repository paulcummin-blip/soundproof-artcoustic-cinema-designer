/**
 * writerComparisonPreview.js (shared)
 * ------------------------------------
 * THE controlled model comparison for the read-only writer preview.
 *
 * It exists for one purpose: to let two EXPLICITLY selected models write from
 * ONE identical frozen writer input, so the only variable in a comparison is the
 * model identifier. It changes nothing about the evidence, the prompt, the
 * contract or the validator — it takes the input `buildWriterInput` already
 * assembled, sends it through the request `buildWriterProviderRequest` already
 * builds, and reads the answer back with the same validator the production path
 * uses.
 *
 * Two rules it holds to absolutely:
 *
 *   1. The model is named. A preview is always sent with an identifier this
 *      module supports, resolved here and written onto the request itself. There
 *      is no path through this module that reaches the gateway with an unstated
 *      model. An identifier it does not support is refused before any call is
 *      made, and NO other model is silently substituted for it.
 *   2. Nothing is written. There is no repository, no entity handle and no
 *      persistence call anywhere in this module: the draft it returns exists in
 *      memory for the caller to read and is discarded with the response.
 *
 * The provider is injected rather than constructed, exactly as the production
 * provider is, so the whole path is exercised in tests with a mock and no live
 * call. A provider failure is a result, never an exception.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import {
  WRITER_DEFAULT_MODEL,
  WRITER_PROVIDER,
  buildWriterProviderRequest,
} from './writerPromptBuilder.js';
import { WRITER_PROMPT_VERSION } from './writerContractSchema.js';
import { validateWriterOutput } from './writerOutputValidator.js';
import { buildClientBriefCoverage } from './writerClientBriefCoverage.js';

/**
 * The only model identifiers a controlled preview may select. Both are verified
 * against the Base44 provider configuration: `gpt_5_mini` is the production
 * writer's own baseline, and `gpt_6_astra` is a supported, more capable gateway
 * model. An identifier that is not on this list is refused rather than passed
 * through, so a typo can never become an unstated gateway default.
 */
export const SUPPORTED_WRITER_MODELS = Object.freeze(['gpt_5_mini', 'gpt_6_astra']);

/** How the model for one preview came to be chosen. */
export const MODEL_SELECTION = Object.freeze({
  /** The caller named the model. */
  EXPLICIT: 'explicit',
  /** The caller named none, so the production baseline is used — stated, never implied. */
  DEFAULT: 'default',
});

/** Why a preview was refused before a provider call was made. */
export const COMPARISON_REFUSAL = Object.freeze({
  UNSUPPORTED_MODEL: 'unsupported_model',
  NO_PROVIDER: 'no_provider',
});

/** The longest provider failure message reported. */
const MAX_ERROR_LENGTH = 500;

/**
 * Resolve the identifier one preview is sent with.
 *
 * @param {string|null} [requested]
 * @returns {{ ok: boolean, requested: string|null, model: string|null,
 *   selection: string|null, reason: string|null }}
 */
export function resolveComparisonModel(requested = null) {
  const text = typeof requested === 'string' ? requested.trim() : '';

  if (text.length === 0) {
    return {
      ok: true,
      requested: null,
      model: WRITER_DEFAULT_MODEL,
      selection: MODEL_SELECTION.DEFAULT,
      reason: null,
    };
  }

  const canonical = SUPPORTED_WRITER_MODELS.find((id) => id === text.toLowerCase());
  if (!canonical) {
    return {
      ok: false,
      requested: text,
      model: null,
      selection: null,
      reason: `Unsupported model "${text}". Supported identifiers: ${SUPPORTED_WRITER_MODELS.join(', ')}. `
        + 'No other model was substituted.',
    };
  }

  return {
    ok: true,
    requested: text,
    model: canonical,
    selection: MODEL_SELECTION.EXPLICIT,
    reason: null,
  };
}

/**
 * What one preview records about the model it used. The identifier the request
 * was sent with is recorded; no actual-model claim is invented, because the
 * gateway returns the draft rather than a model receipt.
 */
export function buildModelAudit({
  input = null,
  pack = null,
  selection = null,
  providerCalled = false,
  durationMs = null,
} = {}) {
  return {
    requested_model: selection?.requested ?? null,
    resolved_model: selection?.model ?? null,
    model_selection: selection?.selection ?? null,
    actual_model: null,
    model_verification: 'unavailable_from_gateway',
    provider: providerCalled ? WRITER_PROVIDER : null,
    prompt_version: WRITER_PROMPT_VERSION,
    contract_version: input?.contract_version ?? null,
    input_fingerprint: input?.input_fingerprint ?? null,
    pack_fingerprint: pack?.pack_fingerprint ?? input?.evidence_pack?.pack_fingerprint ?? null,
    duration_ms: durationMs,
    usage: null,
    cost: 'UNKNOWN',
  };
}

/** One refusal, in the shape every path here reports. */
function refusal({ code, message, input, pack, selection, durationMs = null }) {
  return {
    ok: false,
    code,
    message,
    provider_called: false,
    provider_error: null,
    output: null,
    validation: null,
    client_brief_coverage: null,
    model_audit: buildModelAudit({ input, pack, selection, providerCalled: false, durationMs }),
  };
}

/**
 * Run one read-only preview against an explicitly selected model.
 *
 * The input is sent whole and unmodified: two runs over one input differ in the
 * model identifier and nothing else. The input is never mutated, and the same
 * validator the production path uses reads the answer back.
 *
 * @param {Object} args
 * @param {Object} args.input — buildWriterInput output (the frozen writer input)
 * @param {Object} [args.pack] — the frozen pack that input was built from
 * @param {string|null} [args.requestedModel] — the explicitly selected identifier
 * @param {Function} args.invokeLLM — the injected provider call
 * @returns {Promise<Object>} the draft, its validation, the brief coverage and the audit
 */
export async function runWriterModelPreview({
  input = null,
  pack = null,
  requestedModel = null,
  invokeLLM = null,
} = {}) {
  const selection = resolveComparisonModel(requestedModel);

  // The model is named before anything else: an identifier this writer does not
  // support is refused here, with no provider call and no substitute.
  if (!selection.ok) {
    return refusal({
      code: COMPARISON_REFUSAL.UNSUPPORTED_MODEL,
      message: selection.reason,
      input,
      pack,
      selection,
    });
  }

  if (typeof invokeLLM !== 'function') {
    return refusal({
      code: COMPARISON_REFUSAL.NO_PROVIDER,
      message: 'No writer provider is available, so no draft was requested.',
      input,
      pack,
      selection,
    });
  }

  // The selected identifier is written onto the request itself. This is the one
  // place a preview's model is decided, and it is always an explicit identifier.
  const request = buildWriterProviderRequest({ input, model: selection.model });

  const startedAt = Date.now();
  let raw = null;
  let providerError = null;

  try {
    raw = await invokeLLM(request);
  } catch (error) {
    providerError = String(error?.message || error || 'The provider call failed.').slice(0, MAX_ERROR_LENGTH);
  }

  const durationMs = Date.now() - startedAt;

  if (providerError === null
    && (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim().length === 0))) {
    providerError = 'The provider returned no output.';
  }

  const output = providerError === null ? raw : null;
  const validation = output === null ? null : validateWriterOutput({ input, output });

  // What the draft did with the designer's own brief, item by item — read from
  // the draft's own sections, exactly as the production path reads them.
  const clientBriefCoverage = buildClientBriefCoverage({
    brief: input?.editorial_brief,
    pack,
    sections: output?.sections || [],
  });

  return {
    ok: providerError === null,
    code: providerError === null ? null : 'provider_failed',
    message: providerError,
    provider_called: true,
    provider_error: providerError,
    output,
    validation,
    client_brief_coverage: clientBriefCoverage,
    model_audit: buildModelAudit({ input, pack, selection, providerCalled: true, durationMs }),
  };
}

export default runWriterModelPreview;