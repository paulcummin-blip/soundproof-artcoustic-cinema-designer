/**
 * proposalGenerationRunner.js (shared)
 * -------------------------------------
 * THE Phase 6 orchestration: one controlled GPT proposal-writing attempt, from
 * the feature flag to the append-only record.
 *
 * The order is the contract, and it is fixed:
 *
 *   1. the feature flag — refused before anything is read or sent;
 *   2. the selection — which versions this proposal covers;
 *   3. the retry target — the attempt a retry points at, when there is one;
 *   4. the saved report evidence — the Phase 1 read path, and the only source;
 *   5. the frozen evidence pack and the Phase 2 writer input, plus the proof that
 *      the input carries no live design state;
 *   6. the provider call (injected — this module holds no client and no key);
 *   7. the Phase 2 validator, against the exact input the writer was given;
 *   8. one appended Phase 3 record, whatever happened.
 *
 * A refusal is a result, not an exception: a switched-off flag, evidence that is
 * missing, stale, incomplete or not current, and a retry whose evidence has moved
 * on all come back as `{ ok: false, code, message }` with nothing written and no
 * provider call made. A provider failure or a rejected draft also never throws —
 * they are recorded, because the record is the audit of what happened.
 *
 * Everything external is injected (the evidence read, the provider call, the
 * clock, the user), so the whole path is exercised in tests without a live
 * project and without a real provider.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { buildProposalEvidence } from '../proposalEvidence/proposalEvidenceBuilder.js';
import { buildWriterInput } from '../proposalWriter/writerInputBuilder.js';
import { assertWriterInputCarriesNoLiveState } from '../proposalWriter/writerPromptBuilder.js';
import { callWriterProvider } from '../proposalWriter/writerProvider.js';
import { validateWriterOutput } from '../proposalWriter/writerOutputValidator.js';
import { GENERATION_STATUS } from './generationStatuses.js';
import { createGenerationHistory } from './proposalGenerationRepository.js';

/**
 * The designer's explicit requests, as the evidence pack reads them. The one
 * thing that can admit an assumed parameter (P8, P15, P21) into a proposal is
 * the designer asking for it — never the evidence, and never the writer.
 */
export function proposalRequestContext(proposal = {}) {
  return {
    clientBrief: [proposal?.client_brief, proposal?.narrative_brief].filter(Boolean).join('\n'),
    dealerNotes: proposal?.metadata?.dealer_notes || '',
  };
}

/** Why a generation attempt was refused before it was made. */
export const WRITER_REFUSAL = Object.freeze({
  FLAG_OFF: 'writer_flag_off',
  NO_SELECTION: 'proposal_has_no_selected_versions',
  RETRY_TARGET_UNKNOWN: 'retry_target_unknown',
  RETRY_EVIDENCE_CHANGED: 'retry_evidence_changed',
  EVIDENCE_UNAVAILABLE: 'evidence_unavailable',
  ALREADY_RECORDED: 'attempt_already_recorded',
});

function refusal(code, message) {
  return { ok: false, code, message, record: null };
}

function refusalStatus(code) {
  switch (code) {
    case WRITER_REFUSAL.FLAG_OFF: return 403;
    case WRITER_REFUSAL.NO_SELECTION: return 400;
    case WRITER_REFUSAL.RETRY_TARGET_UNKNOWN: return 404;
    case WRITER_REFUSAL.RETRY_EVIDENCE_CHANGED: return 409;
    case WRITER_REFUSAL.ALREADY_RECORDED: return 409;
    case WRITER_REFUSAL.EVIDENCE_UNAVAILABLE: return 409;
    default: return 400;
  }
}

/** The HTTP status a refusal is reported with. */
export function writerRefusalStatus(code) {
  return refusalStatus(code);
}

/**
 * Which versions a proposal covers, and the proposal type that follows from it.
 * Read from the saved proposal, never from the browser.
 */
export function proposalCopySelection(proposal = {}) {
  const selected = Array.isArray(proposal.selected_version_ids)
    ? proposal.selected_version_ids.filter((id) => typeof id === 'string' && id.length > 0)
    : [];
  const versionIds = selected.length > 0
    ? selected
    : (typeof proposal.version_id === 'string' && proposal.version_id.length > 0 ? [proposal.version_id] : []);

  return {
    versionIds,
    proposalType: proposal.proposal_type || (versionIds.length >= 2 ? 'comparison' : 'single'),
  };
}

/**
 * Run one controlled attempt.
 *
 * @param {Object} input
 * @param {Object} input.proposal — the saved Proposal record
 * @param {string} input.projectId
 * @param {string} [input.accountId]
 * @param {Array<Object>} [input.existingGenerations] — the proposal's stored records
 * @param {Object} input.flag — resolveGptWriterFlag output
 * @param {Function} input.readEvidence — async ({ versionIds, proposal }) => readProposalReportEvidence output
 * @param {Function} input.invokeLLM — the server-side provider call
 * @param {Object} input.user — the authenticated user ({ full_name, email })
 * @param {string} input.now — ISO timestamp
 * @param {string|null} [input.retryOfGenerationId]
 * @returns {Promise<Object>} a refusal, or the appended attempt's outcome
 */
export async function runProposalCopyGeneration({
  proposal = null,
  projectId = null,
  accountId = null,
  existingGenerations = [],
  flag = null,
  readEvidence = null,
  invokeLLM = null,
  user = null,
  now = null,
  retryOfGenerationId = null,
} = {}) {
  // 1. The flag. Nothing is read and nothing is sent while it is off.
  if (flag?.enabled !== true) {
    return refusal(
      WRITER_REFUSAL.FLAG_OFF,
      'The GPT proposal writer is not enabled for this login. No evidence was read and no provider call was made.',
    );
  }

  // 2. The selection, taken from the saved proposal.
  const { versionIds, proposalType } = proposalCopySelection(proposal);
  if (versionIds.length === 0) {
    return refusal(
      WRITER_REFUSAL.NO_SELECTION,
      'This proposal covers no version, so there is no report evidence to write from.',
    );
  }

  const generations = Array.isArray(existingGenerations) ? existingGenerations : [];

  // 3. A retry points at the attempt it retries, within this proposal.
  let retryTarget = null;
  if (retryOfGenerationId) {
    retryTarget = generations.find((record) => record?.generation_id === retryOfGenerationId) || null;
    const sameProposal = retryTarget
      && String(retryTarget.proposal_id || '') === String(proposal?.id || '');
    if (!retryTarget || !sameProposal) {
      return refusal(
        WRITER_REFUSAL.RETRY_TARGET_UNKNOWN,
        'That attempt is not part of this proposal, so there is nothing to retry.',
      );
    }
  }

  // 4. The evidence. The read path refuses missing, stale, incomplete and
  //    not-current reports, and its message names the version and the report.
  if (typeof readEvidence !== 'function') {
    return refusal(WRITER_REFUSAL.EVIDENCE_UNAVAILABLE, 'No report-evidence reader was supplied, so nothing could be written from.');
  }

  let versions = null;
  try {
    versions = await readEvidence({ versionIds, proposal });
  } catch (error) {
    return refusal(
      WRITER_REFUSAL.EVIDENCE_UNAVAILABLE,
      error?.message || 'The saved report evidence could not be read.',
    );
  }

  // 5. The frozen pack, the Phase 2 input, and the proof that the input carries
  //    evidence and contract only.
  let pack = null;
  let writerInput = null;
  try {
    pack = buildProposalEvidence({ versions, generatedAt: now, requestContext: proposalRequestContext(proposal) });
    writerInput = buildWriterInput({ pack });
    assertWriterInputCarriesNoLiveState(writerInput);
  } catch (error) {
    return refusal(
      WRITER_REFUSAL.EVIDENCE_UNAVAILABLE,
      error?.message || 'The frozen evidence pack could not be built.',
    );
  }

  // A retry is made from the same evidence. When the evidence has moved on, this
  // is a new generation rather than a retry of the old one, and saying so is
  // safer than quietly relinking it.
  if (retryTarget && String(retryTarget.evidence_pack_fingerprint || '') !== String(pack.pack_fingerprint || '')) {
    return refusal(
      WRITER_REFUSAL.RETRY_EVIDENCE_CHANGED,
      'The design or its saved reports have changed since that attempt, so it cannot be retried. Generate a new copy instead.',
    );
  }

  // 6. The provider call. A failure comes back as a result.
  const provider = await callWriterProvider({ invokeLLM, input: writerInput, model: flag?.model ?? null });

  // 7. The validator, against the exact input the writer was given. Output that
  //    did not arrive is not validated, and is never called valid.
  const validation = provider.output !== null && provider.output !== undefined
    ? validateWriterOutput({ input: writerInput, output: provider.output })
    : null;

  // 8. One appended record, whatever happened.
  const history = createGenerationHistory({ records: generations });

  let record = null;
  try {
    record = history.append({
      proposalId: proposal?.id ?? null,
      draftProposalId: proposal?.id ? null : (proposal?.draft_proposal_id ?? null),
      projectId: projectId ?? proposal?.project_id ?? null,
      accountId: accountId ?? proposal?.account_id ?? null,
      proposalType,
      selectedVersionIds: versionIds,
      pack,
      writerInput,
      output: provider.output,
      validation,
      providerError: provider.provider_error,
      outcome: provider.provider_error ? 'provider_failed' : 'generated',
      provider: provider.provider,
      model: provider.model,
      createdBy: user?.full_name || user?.email || 'Unknown user',
      createdAt: now,
      retryOfGenerationId: retryTarget?.generation_id ?? null,
    });
  } catch (error) {
    const message = error?.message || 'The attempt could not be recorded.';
    return refusal(
      /already stored/i.test(message) ? WRITER_REFUSAL.ALREADY_RECORDED : WRITER_REFUSAL.EVIDENCE_UNAVAILABLE,
      message,
    );
  }

  return {
    ok: true,
    code: null,
    message: null,
    record,
    generation_id: record.generation_id,
    generation_number: record.generation_number,
    status: record.status,
    valid: record.status === GENERATION_STATUS.VALID_GENERATED,
    validation_errors: record.validation_errors,
    retry_of_generation_id: record.retry_of_generation_id,
    provider: record.provider,
    model: record.model,
    prompt_version: record.prompt_version,
    schema_version: record.schema_version,
    contract_version: record.contract_version,
    evidence_pack_fingerprint: record.evidence_pack_fingerprint,
    duration_ms: provider.duration_ms,
  };
}

export default runProposalCopyGeneration;