/**
 * writerProvider.js (shared)
 * --------------------------
 * THE Phase 6 provider call: one controlled call to the platform AI gateway, and
 * every way it can end.
 *
 * The provider is injected, not constructed. A caller passes the app's own
 * server-side integration call and this module builds the request, makes it, and
 * reports what came back — so the shared pipeline never holds a credential, a
 * client, or a way to reach one. There is no API key anywhere in this app: the
 * gateway is authorised by the platform on the server, the browser is never told
 * the provider or the model, and no dealer or user is ever asked to enter a key.
 *
 * A failure is a result here, never an exception: a timeout, a refused request or
 * an empty answer all come back as `provider_error`, which the generation record
 * files as `provider_failed`. Nothing is invented to fill the gap.
 *
 * Pure apart from the injected call: no React, no SDK, no runtime-specific APIs.
 */

import {
  WRITER_DEFAULT_MODEL,
  WRITER_PROVIDER,
  buildWriterProviderRequest,
} from './writerPromptBuilder.js';

/** The longest provider failure message stored on a record. */
const MAX_ERROR_LENGTH = 500;

/** The model one call uses: the flag's override, else the writer's default. */
export function writerModelFor(configModel = null) {
  const override = typeof configModel === 'string' ? configModel.trim() : '';
  return override.length > 0 ? override : WRITER_DEFAULT_MODEL;
}

function cleanError(error) {
  const message = error?.message || error?.toString?.() || 'The provider call failed.';
  return String(message).slice(0, MAX_ERROR_LENGTH);
}

/** The result shape of one provider call, whatever happened. */
function outcome({
  output = null,
  providerError = null,
  model = null,
  durationMs = null,
  attempted = false,
} = {}) {
  return {
    output,
    provider_error: providerError,
    // Null when no provider call was reached, so an attempt that never left the
    // app is never recorded as if it had been made.
    provider: attempted ? WRITER_PROVIDER : null,
    model: attempted ? model : null,
    duration_ms: durationMs,
    received: output !== null,
  };
}

/**
 * Make one provider call.
 *
 * @param {Object} input
 * @param {Function} input.invokeLLM — the caller's own server-side integration call
 * @param {Object} input.input — the Phase 2 writer input
 * @param {string} [input.model] — the flag's model override
 * @returns {Promise<Object>} { output, provider_error, provider, model, duration_ms, received }
 */
export async function callWriterProvider({ invokeLLM, input, model = null } = {}) {
  const resolvedModel = writerModelFor(model);

  if (typeof invokeLLM !== 'function') {
    return outcome({ model: resolvedModel, providerError: 'No writer provider is available in this environment.' });
  }

  let request = null;
  try {
    request = buildWriterProviderRequest({ input, model: resolvedModel });
  } catch (error) {
    return outcome({ model: resolvedModel, providerError: cleanError(error) });
  }

  const startedAt = Date.now();
  try {
    const raw = await invokeLLM(request);
    const duration = Date.now() - startedAt;

    const output = typeof raw === 'string' || (raw !== null && typeof raw === 'object')
      ? raw
      : null;

    if (output === null || (typeof output === 'string' && output.trim().length === 0)) {
      return outcome({
        model: resolvedModel,
        providerError: 'The provider returned no output.',
        durationMs: duration,
        attempted: true,
      });
    }

    return outcome({ output, model: resolvedModel, durationMs: duration, attempted: true });
  } catch (error) {
    // A timeout, a refused request or a transport failure all land here and all
    // become the same honest outcome: the attempt failed and nothing was written.
    return outcome({
      model: resolvedModel,
      providerError: cleanError(error),
      durationMs: Date.now() - startedAt,
      attempted: true,
    });
  }
}

export default callWriterProvider;