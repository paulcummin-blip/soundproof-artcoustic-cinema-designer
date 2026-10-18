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
 * ONE CORRECTION ATTEMPT, AND NO MORE. When the first candidate is refused, ADI is
 * not simply stopped: the exact violations it was refused for go straight back to
 * the pass, with the copy they were read against and the brief it was given, and it
 * is asked to repair its own wording once. The corrected candidate is read by
 * exactly the same gates, in the same order, with no rule relaxed — so a correction
 * can only ever be accepted on merit. Two candidates in total: there is no further
 * loop, and the validator stays the final authority.
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
import { ADI_REJECTION_STAGE, buildAdiRejectionDiagnostics } from './adiRejectionDiagnostics.js';
import { checkAdiEditorialQuality, looksLikeHtml } from './adiEditorialStandard.js';
import { buildAdiCorrectionPrompt } from './adiEditorialPrompt.js';

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
 * THE MOST CANDIDATES ONE PASS MAY ASK FOR. Two, and no more: the first, and the
 * single correction it is allowed after a refusal.
 */
export const ADI_MAX_CANDIDATES = 2;

/**
 * Read one candidate against the two gates, in the order that decides it: the
 * meaning-conservation gate, and then the surface's OWN validator. A corrected
 * candidate goes through this same function, so nothing is relaxed for it.
 *
 * @returns {Promise<null|{stage: string, violations: Array}>} null when it passes
 */
async function refusalFor({ original, proposed, validate, validateStage }) {
  // The editorial smell test is read alongside the authority gates so the one
  // permitted correction receives every exact defect already present in this
  // candidate. Meaning remains the deciding stage whenever meaning is wrong.
  const quality = checkAdiEditorialQuality(proposed);

  // ── THE MEANING GATE: the same facts, and no more than the same facts ──
  const conservation = checkWordingConservation({ original, improved: proposed });
  if (!conservation.ok) {
    return {
      stage: ADI_REJECTION_STAGE.MEANING_CONSERVATION,
      violations: [
        ...conservation.violations,
        ...(quality.ok ? [] : quality.violations),
      ],
    };
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
      return {
        stage: validateStage,
        violations: [
          ...(Array.isArray(checked?.violations) ? checked.violations : []),
          ...(quality.ok ? [] : quality.violations),
        ],
      };
    }
  }

  // ── THE FINAL EDITORIAL SMELL TEST ──
  // A candidate can preserve every engineering fact and still retain wording the
  // client-copy audit has already identified as filler or unsupported inference.
  // Name the exact phrase so the existing one-correction path can remove it.
  if (!quality.ok) {
    return {
      stage: ADI_REJECTION_STAGE.EDITORIAL_QUALITY,
      violations: quality.violations,
    };
  }

  return null;
}

/**
 * Run one editorial pass.
 *
 * ONE CANDIDATE, THEN ONE CORRECTION. The first candidate is read against both
 * gates. If it is refused, the exact violations are handed back to the provider
 * with the copy they were read from, and ONE corrected candidate is asked for and
 * read against those same gates. Two candidates in total; when the corrected one is
 * refused as well, the original copy stands and the refusal is reported.
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
 * @param {string} [input.validateStage] — the stage a refusal by that validator is
 *   read under, for the diagnostic alone. It names the validator; it never decides
 *   anything.
 * @returns {Promise<Object>} the outcome, the proposed copy where one is accepted,
 *   how many candidates it took, and the reasons where one is refused
 */
export async function runAdiWordingPass({
  flag = null,
  invokeLLM = null,
  prompt = '',
  original = '',
  mode = 'section',
  validate = null,
  validateStage = ADI_REJECTION_STAGE.ORIGINAL_SURFACE_VALIDATOR,
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
  const html = looksLikeHtml(original);
  const flat = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const providerOf = () => ({ model, duration_ms: Date.now() - startedAt });

  let callPrompt = prompt;
  let refusal = null;
  let attempts = 0;

  while (attempts < ADI_MAX_CANDIDATES) {
    attempts += 1;

    let raw = null;
    try {
      raw = await invokeLLM({ prompt: callPrompt, model });
    } catch (error) {
      return asResult(ADI_WORDING_OUTCOME.PROVIDER_FAILED, {
        detail: String(error?.message || 'The editorial provider call failed.').slice(0, MAX_ERROR_LENGTH),
        provider: providerOf(),
        attempts,
      });
    }

    const proposed = cleanAdiCopy(providerText(raw), { html });
    if (!proposed) {
      return asResult(ADI_WORDING_OUTCOME.PROVIDER_FAILED, {
        detail: 'The provider returned no copy.',
        provider: providerOf(),
        attempts,
      });
    }

    // NOTHING TO CHANGE is a result the designer is told plainly, and nothing is
    // written: re-saving identical wording would churn an approval for nothing. On
    // a correction attempt the same thing means the correction has given up, so the
    // refusal that asked for it stands.
    const unchanged = checkWordingConservation({ original, improved: proposed }).ok
      && flat(proposed) === flat(original);
    const refused = await refusalFor({ original, proposed, validate, validateStage });
    if (!refused && unchanged) {
      if (attempts === 1) {
        return asResult(ADI_WORDING_OUTCOME.UNCHANGED, { provider: providerOf(), attempts });
      }
      break;
    }

    if (!refused) {
      return asResult(ADI_WORDING_OUTCOME.IMPROVED, {
        text: proposed,
        provider: providerOf(),
        attempts,
        corrected: attempts > 1,
      });
    }

    refusal = { proposed, stage: refused.stage, violations: refused.violations };

    // ── THE ONE CORRECTION ──
    // The exact violations, the copy they were read from and the brief that
    // produced the refused copy go straight back to the same pass, which is asked
    // to repair its own wording once. Nothing about the gates changes: the
    // corrected candidate is read by refusalFor above, exactly as the first was.
    if (attempts < ADI_MAX_CANDIDATES) {
      callPrompt = buildAdiCorrectionPrompt({
        basePrompt: prompt,
        original,
        refused: proposed,
        stage: refused.stage,
        violations: refused.violations,
      });
    }
  }

  // ── BOTH CANDIDATES REFUSED: the original copy stands, and nothing is written ──
  return asResult(ADI_WORDING_OUTCOME.REJECTED, {
    text: null,
    violations: refusal ? refusal.violations : [],
    // THE REFUSAL, READABLE: the copy that was refused, the stage that refused it,
    // and every fact each violation was read from. Returned in the response and
    // stored nowhere — a refusal writes nothing.
    diagnostics: buildAdiRejectionDiagnostics({
      originalText: original,
      proposedText: refusal ? refusal.proposed : null,
      stage: refusal ? refusal.stage : null,
      violations: refusal ? refusal.violations : [],
    }),
    provider: providerOf(),
    attempts,
    corrected: false,
  });
}

export default runAdiWordingPass;