/**
 * proposalGenerationEntity.js (shared)
 * -------------------------------------
 * How a generation record is stored: the entity it goes into, and the payload it
 * is written as.
 *
 * The entity stores the record's own fields, so a row read back is a record and
 * the history helpers read it unchanged — there is no second shape and no
 * mapping to keep in step. `account_id` is added on the way in because the entity
 * uses it for access control.
 *
 * The entity is append-only: its schema refuses updates and deletes, so the only
 * write is a create. Nothing here calls the SDK — a caller (a backend function, or
 * the app on the user's own session) performs the create.
 *
 * Pure: no React, no SDK, no runtime-specific APIs.
 */

/** The entity generation attempts are stored in. */
export const GENERATION_ENTITY = 'ProposalGeneration';

/**
 * The payload one generation record is created as.
 *
 * @param {Object} input
 * @param {Object} input.record — a buildGenerationRecord record
 * @param {string} [input.accountId] — the account the record belongs to
 * @returns {Object} the payload to create
 */
export function generationEntityPayload({ record = null, accountId = null } = {}) {
  if (!record || typeof record !== 'object' || !record.generation_id) {
    throw new Error('A generation record is required: the entity stores the record\'s own fields.');
  }

  const payload = JSON.parse(JSON.stringify(record));
  payload.account_id = accountId ?? record.account_id ?? null;
  return payload;
}

export default generationEntityPayload;