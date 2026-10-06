/**
 * proposalGenerationRepository.js (shared)
 * -----------------------------------------
 * THE Phase 3 append-only store for proposal generation attempts.
 *
 * It has one write path — `append` — and no way at all to change or remove a
 * record it already holds. A retry, a regeneration, or an attempt against
 * changed evidence each append a new linked record; nothing is ever rewritten.
 *
 * The store holds records in memory and delegates every question to the history
 * helpers, so an in-memory history and a history read back from the
 * `ProposalGeneration` entity answer identically. The entity itself refuses
 * updates and deletes (its schema sets both to false), so the two layers agree.
 *
 * Pure: no React, no SDK, no runtime-specific APIs. Nothing here calls GPT and
 * nothing here touches a Proposal record.
 */

import {
  evidencePackForGeneration,
  generationById,
  generationIssueGate,
  generationVersions,
  generationsForProposal,
  generationsNeedingReview,
  latestValidGeneration,
  proposalKeysOf,
} from './proposalGenerationHistory.js';
import { buildGenerationRecord } from './proposalGenerationRecord.js';

/**
 * Create a generation history.
 *
 * @param {Object} [input]
 * @param {Array<Object>} [input.records] — records already stored (e.g. read back
 *   from the entity), which this history continues to append to
 * @returns {Object} the store: append, and the audit queries
 */
export function createGenerationHistory({ records = [] } = {}) {
  const written = [];
  for (const record of Array.isArray(records) ? records : []) {
    if (record && typeof record === 'object' && record.generation_id) written.push(record);
  }

  const selectorFor = (attempt) => ({
    proposalId: attempt?.proposalId ?? null,
    draftProposalId: attempt?.draftProposalId ?? null,
  });

  return {
    /**
     * Append one attempt. The record it returns is frozen and is the only record
     * of that attempt there will ever be.
     *
     * @throws when the attempt belongs to no proposal, when a retry does not
     *   point at a real attempt of the same proposal made from the same evidence,
     *   or when the record it would create is already stored
     */
    append(attempt = {}) {
      const keys = proposalKeysOf({
        proposal_id: attempt.proposalId ?? null,
        draft_proposal_id: attempt.draftProposalId ?? null,
      });
      if (keys.length === 0) {
        throw new Error(
          'A generation attempt belongs to a proposal: pass its proposalId, or a draftProposalId before the proposal is saved.',
        );
      }

      const existing = generationsForProposal(written, selectorFor(attempt));
      const number = Number.isInteger(attempt.generationNumber)
        ? attempt.generationNumber
        : existing.reduce((highest, record) => Math.max(highest, Number(record.generation_number) || 0), 0) + 1;

      // A retry reuses the same evidence pack, and it points at the attempt it
      // retries. Different evidence is not a retry: it is a new generation.
      if (attempt.retryOfGenerationId) {
        const target = generationById(written, attempt.retryOfGenerationId);
        if (!target) {
          throw new Error(
            `A retry points at the generation it retries: ${attempt.retryOfGenerationId} is not in this history.`,
          );
        }
        if (!proposalKeysOf(target).some((key) => keys.includes(key))) {
          throw new Error('A retry stays within one proposal: the generation it points at belongs to another proposal.');
        }
        if (String(target.evidence_pack_fingerprint ?? '') !== String(attempt.pack?.pack_fingerprint ?? '')) {
          throw new Error(
            'A retry is made from the same evidence pack: this attempt carries a different pack, so it is a new generation rather than a retry of the old one.',
          );
        }
      }

      if (attempt.generationId && generationById(written, attempt.generationId)) {
        throw new Error(
          `Generation ${attempt.generationId} is already stored. A generation record is never overwritten: a regeneration creates a new record.`,
        );
      }

      const record = buildGenerationRecord({ ...attempt, generationNumber: number });

      if (generationById(written, record.generation_id)) {
        throw new Error(
          `Generation ${record.generation_id} is already stored. A generation record is never overwritten: a regeneration creates a new record.`,
        );
      }

      written.push(record);
      return record;
    },

    /** Every record appended so far, oldest first. */
    records() {
      return [...written];
    },

    /** One generation by ID. */
    byId(generationId) {
      return generationById(written, generationId);
    },

    /** Every generation version of a proposal, oldest first. */
    versions(selector) {
      return generationVersions(written, selector);
    },

    /** The newest valid generation only. */
    latestValid(selector) {
      return latestValidGeneration(written, selector);
    },

    /** The failed attempts that need review, newest first. */
    needsReview(selector) {
      return generationsNeedingReview(written, selector);
    },

    /** The frozen evidence pack a generation was made from. */
    packFor(generationId) {
      return evidencePackForGeneration(written, generationId);
    },

    /** Whether a generation may be issued, exported, completed or sent. */
    issueGate(generationId) {
      return generationIssueGate(written, generationId);
    },
  };
}

export default createGenerationHistory;