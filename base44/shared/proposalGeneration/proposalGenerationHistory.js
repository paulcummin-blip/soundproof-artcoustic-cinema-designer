/**
 * proposalGenerationHistory.js (shared)
 * --------------------------------------
 * THE Phase 3 audit retrieval: every question asked of a proposal's generation
 * history, answered from the records themselves.
 *
 * These helpers read records and change nothing. They work equally on records
 * held in memory and on the rows the `ProposalGeneration` entity returns, because
 * the entity stores the record's own fields.
 *
 * Two things are derived at read time rather than written:
 *
 *   - `superseded`: a valid generation is superseded once a newer valid
 *     generation exists for the same proposal. An append-only record can never be
 *     edited to say so, so it is derived here, exactly as issued documents derive
 *     it;
 *   - the issue gate: only a `valid_generated` generation that has not been
 *     superseded may be issued, exported, completed or sent.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

import {
  GENERATION_GATE_REASON,
  GENERATION_STATUS,
  generationGate,
} from './generationStatuses.js';

/** The statuses that mean an attempt failed and a human should look at it. */
export const GENERATION_REVIEW_STATUSES = Object.freeze([
  GENERATION_STATUS.NEEDS_HUMAN_REVIEW,
  GENERATION_STATUS.VALIDATION_FAILED,
  GENERATION_STATUS.PROVIDER_FAILED,
]);

/** Every record in a list, skipping anything that is not one. */
function asRecords(records) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => record && typeof record === 'object' && record.generation_id);
}

/** The proposal keys a record belongs to: a saved proposal, a draft, or both. */
export function proposalKeysOf(record) {
  return [record?.proposal_id, record?.draft_proposal_id]
    .filter((key) => typeof key === 'string' && key.length > 0);
}

/** The proposal selector a helper was given, as a list of ids to match. */
function wantedKeys(selector) {
  if (typeof selector === 'string') return [selector];
  if (Array.isArray(selector)) return selector.filter(Boolean).map(String);
  const object = selector && typeof selector === 'object' ? selector : {};
  return [object.proposalId, object.draftProposalId].filter(Boolean).map(String);
}

/** Oldest first: by creation time, then by place in the chain. */
function byRecency(a, b) {
  const at = String(a?.created_at || '');
  const bt = String(b?.created_at || '');
  if (at !== bt) return at < bt ? -1 : 1;
  return (Number(a?.generation_number) || 0) - (Number(b?.generation_number) || 0);
}

/** One generation by its ID. */
export function generationById(records, generationId) {
  if (!generationId) return null;
  return asRecords(records).find((record) => record.generation_id === generationId) || null;
}

/**
 * Every generation of a proposal: all its generation versions, oldest first.
 * Accepts a proposal id, or `{ proposalId, draftProposalId }`.
 */
export function generationsForProposal(records, selector) {
  const wanted = wantedKeys(selector);
  if (wanted.length === 0) return [];
  return asRecords(records)
    .filter((record) => proposalKeysOf(record).some((key) => wanted.includes(key)))
    .sort(byRecency);
}

/** All generation versions of a proposal, in chain order (oldest first). */
export function generationVersions(records, selector) {
  return generationsForProposal(records, selector);
}

/**
 * Whether a generation was replaced by a newer valid generation for the same
 * proposal. Derived, never stored.
 */
export function isSuperseded(record, records = []) {
  if (!record || record.status !== GENERATION_STATUS.VALID_GENERATED) return false;
  const number = Number(record.generation_number) || 0;
  return generationsForProposal(records, proposalKeysOf(record))
    .some((other) => other.generation_id !== record.generation_id
      && other.status === GENERATION_STATUS.VALID_GENERATED
      && (Number(other.generation_number) || 0) > number);
}

/** A record's status as it stands now: what was written, or `superseded`. */
export function generationStatusOf(record, records = []) {
  if (!record) return null;
  return isSuperseded(record, records) ? GENERATION_STATUS.SUPERSEDED : record.status;
}

/** The newest record that passed validation, and only that one. */
export function latestValidGeneration(records, selector = null) {
  const candidates = (selector === null ? asRecords(records) : generationsForProposal(records, selector))
    .filter((record) => record.status === GENERATION_STATUS.VALID_GENERATED);
  return candidates.length === 0 ? null : candidates.sort(byRecency)[candidates.length - 1];
}

/**
 * The failed attempts a human should review, newest first: an output that broke
 * a claim, figure, level or product rule, an output that was not the contract's
 * shape, and an attempt the provider never returned. A discarded attempt is not
 * here — nothing was produced, so there is nothing to review.
 */
export function generationsNeedingReview(records, selector = null) {
  const candidates = (selector === null ? asRecords(records) : generationsForProposal(records, selector))
    .filter((record) => GENERATION_REVIEW_STATUSES.includes(record.status));
  return candidates.sort(byRecency).reverse();
}

/** The frozen evidence pack a generation was made from. */
export function evidencePackForGeneration(records, generationId) {
  const record = generationById(records, generationId);
  return record ? (record.evidence_pack ?? null) : null;
}

/**
 * Whether the evidence has moved on since a generation was made. When it has,
 * the existing generation stays as the historical record it is, and a new pack
 * means a new generation record.
 */
export function generationEvidenceChanged(record, pack) {
  if (!record) return false;
  return String(record.evidence_pack_fingerprint ?? '') !== String(pack?.pack_fingerprint ?? '');
}

/**
 * Rule 6 at the point of use: may this generation be issued, exported, completed
 * or sent? Only a valid generation that has not been superseded may.
 *
 * @returns {{ generation_id, issuable: boolean, status: string|null, reason: string, record: Object|null }}
 */
export function generationIssueGate(records, generationId) {
  const record = generationById(records, generationId);
  if (!record) {
    return {
      generation_id: generationId ?? null,
      issuable: false,
      status: null,
      reason: GENERATION_GATE_REASON.NOT_FOUND,
      record: null,
    };
  }
  const status = generationStatusOf(record, records);
  return { generation_id: record.generation_id, ...generationGate({ status }), record };
}