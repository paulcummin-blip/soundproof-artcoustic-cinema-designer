import { buildOptionGuidance } from './writerOptionGuidance.js';

/**
 * readProjectOptionGuidance.js (shared)
 * -------------------------------------
 * The designer's own seating or layout alternatives for one project, read from
 * the images they marked as options and handed to the approved writer as a BRIEF.
 *
 * The notes a designer writes on those images explain what each option is and
 * what the choice rests on. They are written for the designer, not for the
 * client: the writer turns them into its own client-facing prose, the approved
 * validator checks that prose, and no note is ever printed.
 *
 * The records the images are read from are the project's ProposalAsset records —
 * the same records the Proposal Editor's option pages are composed from, so the
 * brief the writer reads and the page it is printed on can never describe
 * different alternatives.
 *
 * Reads and derives only: writes nothing, calculates nothing.
 *
 * @param {Object} entities — an SDK entity client (base44.entities)
 * @param {string} projectId
 * @returns {Promise<Object|null>} buildOptionGuidance output, or null when the
 *   project states no alternatives
 */
export async function readProjectOptionGuidance(entities, projectId, versionIds = []) {
  if (!projectId) return null;
  const assets = [];
  let cursor;
  do {
    const result = await entities.ProposalAsset.filter({ project_id: projectId }, { limit: 50, cursor });
    assets.push(...(Array.isArray(result) ? result : (result?.items || [])));
    cursor = result?.has_more ? result.next_cursor : null;
  } while (cursor);
  return buildOptionGuidance(assets.filter(asset => asset.scope !== 'version' || versionIds.includes(asset.version_id)));
}

export default readProjectOptionGuidance;