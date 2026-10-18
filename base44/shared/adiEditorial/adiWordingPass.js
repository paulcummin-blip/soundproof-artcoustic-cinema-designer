/**
 * adiWordingPass.js (shared)
 * --------------------------
 * ONE ADI EDITORIAL PASS, and every way it can end.
 *
 * The order is the contract, and it is short because nothing here is a new
 * pipeline: the writer's own switch, one provider call with the editorial prompt,
 * the copy as it comes back, the meaning-conservation gate, and then the surface's
 * OWN validator — the writer's output validator for a report narrative, the
 * narrative grounding rules for a proposal section. A proposed rewrite is accepted
 * only when it passes every one of them.
 *
 * A refusal is a RESULT, never an exception: a rewrite that changed the supported
 * meaning comes back refused with the copy untouched, so the designer keeps the
 * wording that was already there. Nothing is written by this module — it reads, it
 * proposes, and it reports.
 *
 * Everything external is injected, so the whole path is exercised in tests without
 * a live project and without a real provider.
 *
 * Pure apart from the injected calls: no React, no SDK, no runtime-specific APIs.
 */

import { writerModelFor } from '../proposalWriter/writerProvider.js';
import { checkWordingConservation } from './adiWordingConservation.js';
import { looksLikeHtml } from './adiEditorialStandard.js';

/** What became of one editorial pass. */
export const ADI_WORDING_OUTCOME = Object.freeze({
  /** The wording was improved and passed every gate. */
  IMPROVED: 'improved',
  /** The copy already read well: nothing was changed. */
  UNCHANGED: 'unchanged',
  /** The proposed rewrite changed the supported meaning: the original stands. */
  REJECTED: 'rejected',
  /** The provider could not be reached, or returned nothing. */
  PROVIDER_FAILED: 'provider_failed',
  /** The writer's own switch is off for this login: no provider call was made. */
  FLAG_OFF: 'writer_flag_off',
  /** There is no copy to improve. */
  NOTHING_TO_IMPROVE: 'nothing_to_improve',
});

/** The longest provider failure recorded. */
const MAX_ERROR_LENGTH = 500;

/** The text a provider returned, whatever shape it arrived in. */
function providerText(raw) {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    if (typeof raw.content === 'string') return raw.content;
    if (typeof raw.text === 'string') return raw.text;
    if (typeof raw.output === 'string') return raw.output;
  }
  return '';
}

/**
 * The copy as it should be applied: a returned code fence, a leading label or a
 * wrapper element is taken off, and nothing else is touched. The wording itself
 * is never rewritten here.
 */
export function cleanAdiCopy(raw, { html = false } = {}) {
  let text = String(raw || '').trim();
  text = text.replace(/^```(?:html|json|text)?\s*/i, '').replace(/```$/, '').trim();
  // A leading label the model may add ("Improved wording:") is never part of the copy.
  text = text.replace(/^(?:improved|rewritten|revised)\s+(?:wording|copy|text|version)\s*[:\-]\s*/i, '').trim();
  if (html) {
    text = text
      .replace(/^\s*<html[^>]*>/i, '')
      .replace(/<\/html>\s*$/i, '')
      .replace(/<body[^>]*>/i, '')
      .replace(/<\/body>/i, '')
      .trim();
  }
  return text.length > 0 ? text : null;
}

/**
 * Run one editorial pass.
 *
 * @param {Object} input
 * @param {Object|null} input.flag — resolveGptWriterFlag output: the writer's switch
 * @param {Function} input.invokeLLM — the server-side provider call
 * @param {string} input.prompt — buildAdiEditorialPrompt output
 * @param {string} input.original — the copy as it stands
 * @param {string} [input.mode] — 'section' or 'selection'
 * @param {Function} [input.validate] — the surface's own validator, called with the
 *   proposed copy and returning `{ ok, violations }`. The report narrative passes
 *   the writer's output validator here; a proposal section passes its narrative
 *   grounding. A validator that reports anything refuses the rewrite.
 * @returns {Promise<Object>} the outcome, the proposed copy where one is accepted,
 *   and the reasons where one is refused
 */
export async function runAdiWordingPass({
  flag = null,
  invokeLLM = null,
  prompt = '',
  original = '',
  mode = 'section',
  validate = null,
} = {}) {
  const asResult = (outcome, extra = {}) => ({
    outcome,
    mode,
    original,
    text: null,
    kept_original: outcome !== ADI_WORDING_OUTCOME.IMPROVED,
    violations: [],
    provider: { model: null, duration_ms: null },
    ...extra,
  });

  // The controlled writer's switch, where the caller is inside it. A caller that
  // supplies no flag is not gated by it — the proposal section actions never have
  // been — and it says so by passing nothing.
  if (flag && flag.enabled !== true) {
    return asResult(ADI_WORDING_OUTCOME.FLAG_OFF, {
      detail: 'The writer is not switched on for this login, so no provider call was made.',
    });
  }

  if (typeof invokeLLM !== 'function' || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return asResult(ADI_WORDING_OUTCOME.PROVIDER_FAILED, { detail: 'No editorial provider is available.' });
  }

  // The copy to improve. An empty one is not an editorial problem.
  if (!looksLikeHtml(original) && String(original || '').trim().length === 0) {
    return asResult(ADI_WORDING_OUTCOME.NOTHING_TO_IMPROVE, { detail: 'The section carries no copy yet.' });
  }

  const model = writerModelFor(flag?.model ?? null);
  const startedAt = Date.now();
  let raw = null;
  try {
    raw = await invokeLLM({ prompt, model });
  } catch (error) {
    const detail = String(error?.message || 'The editorial provider call failed.').slice(0, MAX_ERROR_LENGTH);
    return asResult(ADI_WORDING_OUTCOME.PROVIDER_FAILED, {
      detail,
      provider: { model, duration_ms: Date.now() - startedAt },
    });
  }

  const provider = { model, duration_ms: Date.now() - startedAt };
  const proposed = cleanAdiCopy(providerText(raw), { html: looksLikeHtml(original) });
  if (!proposed) {
    return asResult(ADI_WORDING_OUTCOME.PROVIDER_FAILED, {
      detail: 'The provider returned no copy.',
      provider,
    });
  }

  // NOTHING TO CHANGE is a result the designer is told plainly, and nothing
  // is written: re-saving identical wording would churn an approval for nothing.
  if (checkWordingConservation({ original, improved: proposed }).ok
    && String(proposed).replace(/\s+/g, ' ').trim()
      === String(original).replace(/\s+/g, ' ').trim()) {
    return asResult(ADI_WORDING_OUTCOME.UNCHANGED, { provider });
  }

  // ── THE MEANING GATE: the same facts, and no more than the same facts ──
  const conservation = checkWordingConservation({ original, improved: proposed });
  if (!conservation.ok) {
    return asResult(ADI_WORDING_OUTCOME.REJECTED, {
      text: null,
      violations: conservation.violations,
      provider,
    });
  }

  // ── THE SURFACE'S OWN VALIDATOR, run again on the improved wording ──
  if (typeof validate === 'function') {
    let checked = null;
    try {
      checked = await validate(proposed);
    } catch (error) {
      checked = { ok: false, violations: [{ code: 'validator_failed', detail: String(error?.message || '') }] };
    }
    if (checked?.ok !== true) {
      return asResult(ADI_WORDING_OUTCOME.REJECTED, {
        text: null,
        violations: Array.isArray(checked?.violations) ? checked.violations : [],
        provider,
      });
    }
  }

  return asResult(ADI_WORDING_OUTCOME.IMPROVED, { text: proposed, provider });
}

export default runAdiWordingPass;