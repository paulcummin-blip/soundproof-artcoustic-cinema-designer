/**
 * proposalGenerationRecord.js (shared)
 * -------------------------------------
 * THE Phase 3 generation record: one immutable, auditable record per GPT
 * proposal generation attempt — whether it passed, failed, or never reached the
 * provider at all.
 *
 * The record is the audit trail of an attempt. It carries the frozen evidence
 * pack it was written from, the exact GPT input, the output if one arrived, the
 * validation result and every rejection, the evidence and engineering
 * fingerprints, and who created it and when. A record is never rewritten: a
 * regeneration, a retry, or an attempt against changed evidence is a new record.
 *
 * Immutability is real, not a convention. The record is a JSON snapshot of what
 * happened — cloned, so the caller's objects can never change it, and frozen, so
 * nothing can change it afterwards. A status is never accepted from a caller:
 * validity is read from the validation result, and a record that did not pass
 * validation can never say it did.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import { proposalEvidenceFingerprint } from '../proposalEvidence/proposalEvidenceBuilder.js';
import {
  WRITER_CONTRACT_VERSION,
  WRITER_OUTPUT_SCHEMA_VERSION,
  WRITER_PROMPT_VERSION,
} from '../proposalWriter/writerContractSchema.js';
import { generationEvidenceIdentity } from './generationEvidenceIdentity.js';
import { validatorProvenance } from '../proposalWriter/validatorProvenance.js';
import {
  GENERATION_OUTCOMES,
  GENERATION_STATUS,
  deriveGenerationStatus,
} from './generationStatuses.js';

/** Every field a generation record stores. */
export const GENERATION_RECORD_FIELDS = Object.freeze([
  'generation_id',
  'generation_number',
  'proposal_id',
  'draft_proposal_id',
  'project_id',
  'account_id',
  'proposal_type',
  'selected_version_ids',
  'status',
  'provider',
  'model',
  'prompt_version',
  'schema_version',
  'contract_version',
  'retry_of_generation_id',
  'evidence_pack',
  'evidence_pack_fingerprint',
  'evidence_pack_schema_version',
  'visual_report_snapshot_ids',
  'technical_report_snapshot_ids',
  'evidence_fingerprints',
  'engineering_fingerprints',
  'gpt_input',
  'gpt_input_fingerprint',
  'gpt_output',
  'gpt_output_fingerprint',
  'validation_result',
  'validation_errors',
  'validator_version',
  'validator_rules_fingerprint',
  'validator_source_manifest',
  'writer_rules_fingerprint',
  'deployed_function_revision',
  'provider_error',
  'created_at',
  'created_by',
  'record_fingerprint',
]);

/**
 * A JSON snapshot: what is stored is JSON, and it is a copy. Exported so the
 * Phase 4 edit record is immutable in exactly the same way a generation record
 * is, rather than the rule being restated somewhere else.
 */
export function jsonClone(value) {
  if (value === undefined || value === null) return null;
  return JSON.parse(JSON.stringify(value));
}

export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function requireText(value, message) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(message);
  return value;
}

/**
 * Build one immutable generation record.
 *
 * @param {Object} attempt
 * @param {string} [attempt.proposalId] — the saved proposal, when there is one
 * @param {string} [attempt.draftProposalId] — the draft proposal id, before it is saved
 * @param {string} attempt.projectId
 * @param {string} [attempt.accountId]
 * @param {string} [attempt.proposalType] — defaults from the pack's own mode
 * @param {Array<string>} [attempt.selectedVersionIds] — defaults to the pack's options
 * @param {Object} attempt.pack — the frozen proposal evidence pack
 * @param {Object} attempt.writerInput — the GPT input built from that pack
 * @param {Object|string|null} [attempt.output] — the GPT output, if one arrived
 * @param {Object|null} [attempt.validation] — the writer-contract validation result
 * @param {string|null} [attempt.providerError]
 * @param {string} [attempt.outcome] — 'generated' | 'provider_failed' | 'discarded'
 * @param {string} [attempt.provider]
 * @param {string} [attempt.model]
 * @param {string} [attempt.promptVersion]
 * @param {number} [attempt.schemaVersion]
 * @param {number} [attempt.contractVersion]
 * @param {string} attempt.createdBy
 * @param {string} attempt.createdAt — ISO timestamp
 * @param {number} attempt.generationNumber — this attempt's place in the proposal's chain
 * @param {string} [attempt.generationId] — supplied only to pin a known ID
 * @param {string|null} [attempt.retryOfGenerationId]
 * @returns {Object} the frozen record
 */
export function buildGenerationRecord(attempt = {}) {
  const {
    proposalId = null,
    draftProposalId = null,
    projectId = null,
    accountId = null,
    proposalType = null,
    selectedVersionIds = null,
    pack = null,
    writerInput = null,
    output = null,
    validation = null,
    providerError = null,
    outcome = null,
    provider = null,
    model = null,
    promptVersion = WRITER_PROMPT_VERSION,
    schemaVersion = WRITER_OUTPUT_SCHEMA_VERSION,
    contractVersion = WRITER_CONTRACT_VERSION,
    createdBy = null,
    createdAt = null,
    generationNumber = null,
    generationId = null,
    retryOfGenerationId = null,
  } = attempt;

  // The audit identity. Without these there is nothing to audit.
  if (!proposalId && !draftProposalId) {
    throw new Error('A generation record needs a proposal id or a draft proposal id: an attempt always belongs to one proposal.');
  }
  requireText(projectId, 'A generation record needs the project it was generated for.');
  requireText(createdBy, 'A generation record needs the user who created it.');
  requireText(createdAt, 'A generation record needs the time it was created.');
  if (!Number.isInteger(generationNumber) || generationNumber < 1) {
    throw new Error('A generation record needs its position in the proposal\'s generation chain (a positive integer).');
  }
  if (outcome !== null && !GENERATION_OUTCOMES.includes(outcome)) {
    throw new Error(`Unknown generation outcome "${outcome}". Known outcomes: ${GENERATION_OUTCOMES.join(', ')}.`);
  }
  if (!pack || typeof pack !== 'object') {
    throw new Error('A generation record is filed under the frozen proposal evidence pack it was generated from.');
  }
  if (!writerInput || typeof writerInput !== 'object') {
    throw new Error('A generation record stores the exact GPT input the attempt was made with.');
  }

  // The input must be the one built from this pack, and a validation result
  // must belong to this pack too, or the record would mix two attempts.
  const packFingerprint = pack.pack_fingerprint ?? null;
  const inputPackFingerprint = writerInput?.evidence_pack?.pack_fingerprint ?? null;
  if (String(inputPackFingerprint || '') !== String(packFingerprint || '')) {
    throw new Error('The GPT input was not built from this evidence pack, so the attempt cannot be recorded against it.');
  }
  if (validation && String(validation.pack_fingerprint ?? '') !== String(packFingerprint || '')) {
    throw new Error('The validation result belongs to another evidence pack, so the attempt cannot be recorded against this one.');
  }

  const identity = generationEvidenceIdentity(pack);
  const outputReceived = output !== null && output !== undefined
    && !(typeof output === 'string' && output.trim().length === 0);
  const evidenceReady = true;

  const status = deriveGenerationStatus({
    outcome,
    validation,
    outputReceived,
    providerError,
    evidenceReady,
  });

  if (status === GENERATION_STATUS.VALID_GENERATED && !outputReceived) {
    throw new Error('A valid generation must carry the output that passed validation.');
  }

  const outputFingerprint = outputReceived
    ? proposalEvidenceFingerprint({ output: jsonClone(output) })
    : null;

  const selected = Array.isArray(selectedVersionIds)
    ? selectedVersionIds.filter((id) => id !== null && id !== undefined)
    : (Array.isArray(pack.options) ? pack.options : [])
      .map((option) => option?.version_id)
      .filter((id) => id !== null && id !== undefined);

  const record = {
    generation_id: 'pending',
    generation_number: generationNumber,
    proposal_id: proposalId ?? null,
    draft_proposal_id: draftProposalId ?? null,
    project_id: projectId,
    account_id: accountId ?? null,
    proposal_type: proposalType || (pack.mode === 'comparison' ? 'comparison' : 'single'),
    selected_version_ids: selected.map(String),
    status,
    provider: provider ?? null,
    model: model ?? null,
    prompt_version: promptVersion ?? null,
    schema_version: schemaVersion ?? null,
    contract_version: contractVersion ?? null,
    retry_of_generation_id: retryOfGenerationId ?? null,
    evidence_pack: jsonClone(pack),
    evidence_pack_fingerprint: packFingerprint,
    evidence_pack_schema_version: identity.evidence_pack_schema_version,
    visual_report_snapshot_ids: jsonClone(identity.visual_report_snapshot_ids),
    technical_report_snapshot_ids: jsonClone(identity.technical_report_snapshot_ids),
    evidence_fingerprints: jsonClone(identity.evidence_fingerprints),
    engineering_fingerprints: jsonClone(identity.engineering_fingerprints),
    gpt_input: jsonClone(writerInput),
    gpt_input_fingerprint: writerInput.input_fingerprint ?? null,
    gpt_output: jsonClone(output),
    gpt_output_fingerprint: outputFingerprint,
    validation_result: jsonClone(validation),
    validation_errors: jsonClone(validation?.violations) || [],
    // The validation's identity wins, never the current module's identity for an older result.
    ...jsonClone(validation?.validator_version ? {
      validator_version: validation.validator_version,
      validator_rules_fingerprint: validation.validator_rules_fingerprint,
      validator_source_manifest: validation.validator_source_manifest,
      writer_rules_fingerprint: validation.writer_rules_fingerprint,
      deployed_function_revision: validation.deployed_function_revision ?? null,
    } : validatorProvenance(writerInput)),
    provider_error: providerError ?? null,
    created_at: createdAt,
    created_by: createdBy,
    record_fingerprint: null,
  };

  // The ID is derived from the attempt itself — its proposal, its evidence, its
  // input, its output, its status, what it retries and when it was made. The
  // chain position is deliberately not part of it: the same attempt submitted
  // twice has to hash to the same ID, so a double submit is refused as a
  // duplicate rather than filed as a second attempt.
  const identityForId = {
    proposal_id: record.proposal_id,
    draft_proposal_id: record.draft_proposal_id,
    project_id: record.project_id,
    retry_of_generation_id: record.retry_of_generation_id,
    evidence_pack_fingerprint: record.evidence_pack_fingerprint,
    gpt_input_fingerprint: record.gpt_input_fingerprint,
    gpt_output_fingerprint: record.gpt_output_fingerprint,
    provider_error: record.provider_error,
    status: record.status,
    created_at: record.created_at,
  };
  record.generation_id = generationId || `gen_${proposalEvidenceFingerprint(identityForId)}`;
  record.record_fingerprint = proposalEvidenceFingerprint(record);

  return deepFreeze(record);
}

export default buildGenerationRecord;