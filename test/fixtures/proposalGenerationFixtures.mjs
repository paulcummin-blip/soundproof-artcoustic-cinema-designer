/**
 * proposalGenerationFixtures.mjs (test fixture)
 * ----------------------------------------------
 * The generation attempts the Phase 3 history tests append: a valid one, one that
 * broke a figure, one that was not the contract's shape, one the provider never
 * returned, and one made against changed evidence.
 *
 * Each attempt is built from the real frozen evidence pack (Phase 1), the real
 * GPT input (Phase 2) and the real validator, so what is stored is exactly what
 * the pipeline produces. No GPT call is made and no entity is written: the
 * history under test is held in memory.
 */

import { buildProposalEvidence } from '../../base44/shared/proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../../base44/shared/proposalWriter/writerInputBuilder.js';
import { validateWriterOutput } from '../../base44/shared/proposalWriter/writerOutputValidator.js';
import {
  EVIDENCE_AT,
  LEVELS_FOUR,
  LEVELS_ONE,
  VALUES_FOUR,
  VALUES_ONE,
  option,
  twoOptions,
} from './proposalEvidenceFixtures.mjs';
import { amend, validDraft } from './proposalWriterFixtures.mjs';

export const PROPOSAL_ID = 'proposal-1';
export const PROJECT_ID = 'project';
export const ACCOUNT_ID = 'account-1';
export const CREATED_BY = 'designer@example.com';
export const PROVIDER = 'base44';
export const MODEL = 'gpt-5';

export const AT_FIRST = '2026-10-06T10:00:00.000Z';
export const AT_RETRY = '2026-10-06T10:05:00.000Z';
export const AT_LATER = '2026-10-06T10:15:00.000Z';

/** The frozen pack and the GPT input built from it. */
export function evidenceFor(versions = twoOptions(), generatedAt = EVIDENCE_AT) {
  const pack = buildProposalEvidence({ versions, generatedAt });
  return { pack, input: buildWriterInput({ pack }) };
}

/** The same two designs with one recorded figure moved: the evidence has changed. */
export function changedVersions() {
  return [
    option('a', { levels: LEVELS_ONE, values: VALUES_ONE, subwoofers: 'SUB3-12 x 2' }),
    option('b', { levels: LEVELS_FOUR, values: { ...VALUES_FOUR, 12: '118 dBC' }, subwoofers: 'SUB4-12 x 2' }),
  ];
}

/**
 * One attempt, in the shape the history stores it.
 *
 * @param {Object} [input]
 * @param {Array<Object>} [input.versions] — the report evidence to build a pack from
 * @param {Object} [input.pack] — a pack to use instead (so a test can hold it)
 * @param {Function} [input.draft] — (input) => the output to store; defaults to a compliant draft
 * @param {Object|string|null} [input.output] — an explicit output; null for none
 * @param {Object|null} [input.validation] — an explicit validation result
 * @param {string} [input.providerError]
 * @param {string} [input.outcome]
 * @param {string} [input.at] — when the attempt was made
 * @param {number} [input.generationNumber] — pin a place in the chain; otherwise the store assigns it
 * @param {string} [input.generationId] — pin an ID
 * @param {string} [input.retryOfGenerationId]
 * @param {Object} [input.overrides] — anything else to override on the attempt
 */
export function attempt({
  versions = twoOptions(),
  pack = null,
  draft = null,
  output = undefined,
  validation = undefined,
  providerError = null,
  outcome = 'generated',
  at = AT_FIRST,
  generationNumber = undefined,
  generationId = null,
  retryOfGenerationId = null,
  overrides = {},
} = {}) {
  const resolvedPack = pack || buildProposalEvidence({ versions, generatedAt: EVIDENCE_AT });
  const input = buildWriterInput({ pack: resolvedPack });

  const resolvedOutput = output === undefined
    ? (draft === null ? validDraft(input) : draft(input))
    : output;

  const resolvedValidation = validation === undefined
    ? (resolvedOutput === null ? null : validateWriterOutput({ input, output: resolvedOutput }))
    : validation;

  return {
    proposalId: PROPOSAL_ID,
    projectId: PROJECT_ID,
    accountId: ACCOUNT_ID,
    proposalType: 'comparison',
    createdBy: CREATED_BY,
    provider: PROVIDER,
    model: MODEL,
    pack: resolvedPack,
    writerInput: input,
    output: resolvedOutput,
    validation: resolvedValidation,
    providerError,
    outcome,
    createdAt: at,
    generationNumber,
    generationId,
    retryOfGenerationId,
    ...overrides,
  };
}

/** An attempt whose output states a figure the reports do not. */
export function invalidClaimAttempt(options = {}) {
  return attempt({
    draft: (input) => amend(input, {
      section: 'key_performance_highlights',
      sentence: 'P12 now delivers 121 dBC.',
    }),
    ...options,
  });
}

/** An attempt whose output was not the shape the contract defines. */
export function invalidShapeAttempt(options = {}) {
  return attempt({
    draft: (input) => {
      const draft = validDraft(input);
      draft.sections = draft.sections.filter((entry) => entry.section !== 'appendix_notes');
      return draft;
    },
    ...options,
  });
}

/** An attempt the provider never returned output for. */
export function providerFailureAttempt(options = {}) {
  return attempt({
    output: null,
    validation: null,
    providerError: 'The provider returned no output (gateway timeout).',
    outcome: 'provider_failed',
    ...options,
  });
}

/** An attempt the designer abandoned before anything was produced. */
export function discardedAttempt(options = {}) {
  return attempt({
    output: null,
    validation: null,
    outcome: 'discarded',
    ...options,
  });
}