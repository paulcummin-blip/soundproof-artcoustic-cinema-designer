/**
 * projectOwnershipRead.js
 * -----------------------
 * Reading a project's own ownership identity, for the issued-document storage
 * path. One read, by id, of the one field that decides which account a stored
 * document belongs to.
 *
 * The access rules on Project decide what may be read: a designer reads the
 * project they own, and an admin reads an admin-owned project. Nothing here
 * widens or narrows that — it reads the record as the signed-in user.
 */

import { base44 } from '@/api/base44Client';

/**
 * @param {string} projectId
 * @returns {Promise<Object|null>} the project's identity fields, or null
 */
export async function readProjectOwnership(projectId) {
  const page = await base44.entities.Project.filter(
    { id: projectId },
    { limit: 1, fields: ['account_id'] },
  );
  const items = Array.isArray(page) ? page : (page?.items || []);
  return items[0] || null;
}

export default readProjectOwnership;