/**
 * issuedDocumentOwnership.js
 * --------------------------
 * The owning account an issued document is stored under, taken from the
 * canonical project ownership authority.
 *
 * ONE RULE
 *   The account is the parent PROJECT's own `account_id` — the account the
 *   project belongs to. It is read from the project record itself, so a stored
 *   document is always filed under the ownership the project already has.
 *
 * WHAT IT NEVER DOES
 *   - It never invents an account id, and never fabricates one from a name,
 *     a territory or anything else.
 *   - It never substitutes the authenticated user's id for an account id.
 *   - It never moves a project to another dealer's account.
 *   An admin-owned or internal project has no owning account, and that is
 *   reported as "none": the record is then stored without the field, under the
 *   entity's own permission model.
 *
 * Pure by design: the project read is injected by the caller, so this rule can be
 * checked on its own and nothing here reaches the network by accident.
 */

import { normaliseAccountId } from './issuedDocumentRowPayload';

/**
 * Resolve the account an issued document belongs to.
 *
 * @param {Object} parameters
 * @param {string} parameters.projectId  the project the document was issued for
 * @param {string|null} [parameters.accountId] the account the export already states
 * @param {Function|null} [parameters.readProject] the project read (id → project)
 * @returns {Promise<string|null>} the owning account id, or null when the
 *          project has none
 */
export async function resolveIssuedDocumentAccountId({
  projectId,
  accountId = null,
  readProject = null,
} = {}) {
  const supplied = normaliseAccountId(accountId);
  if (supplied) return supplied;
  if (!projectId || typeof readProject !== 'function') return null;

  try {
    const project = await readProject(projectId);
    return normaliseAccountId(project?.account_id);
  } catch {
    // A project that cannot be read states no owning account. The document is
    // still stored; nothing is invented to fill the gap.
    return null;
  }
}

export default resolveIssuedDocumentAccountId;