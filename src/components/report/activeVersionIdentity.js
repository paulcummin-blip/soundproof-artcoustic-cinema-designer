/**
 * activeVersionIdentity
 * ---------------------
 * The saved identity of the project's ACTIVE design version — the exact name
 * the designer wrote in the project's version selector.
 *
 * A report states the version it documents on its front page and in its exported
 * filename, and both read this one name. It is never a slot number written as a
 * label: the name comes from the stored ProjectVersion record, so a version the
 * designer called "Level 4 version" is never reported as "Version 1" or "V4".
 *
 * Both report pages resolve it the same way, on BOTH load routes — the fast route
 * used when the Room Designer hands the project across in-session, and the full
 * fetch/hydrate route used on a cold load. Stating it only on the cold route is
 * what left an in-session export naming a generic version.
 *
 * A name that cannot be read is left absent rather than guessed: the report then
 * states no version instead of a wrong one.
 */

import { readProjectVersionRecord } from '@/components/state/projectReadCache';

/** Stated when the project has no active version pointer. */
export const NO_VERSION_IDENTITY = Object.freeze({ versionId: null, number: null, name: null });

/**
 * ONE version's id, slot number and exact saved name — whichever version a
 * report was asked for, not only the project's active one. Read from the
 * ProjectVersion record itself, so a version the designer called "Level 4
 * version" is never reported as "Version 1" or "V4".
 *
 * @param {string|null} versionId
 * @returns {Promise<{versionId: string|null, number: number|null, name: string|null}>}
 */
export async function readVersionIdentity(versionId) {
  const id = versionId || null;
  if (!id) return { ...NO_VERSION_IDENTITY };

  try {
    const version = await readProjectVersionRecord(id);
    const name = typeof version?.version_name === 'string' ? version.version_name.trim() : '';
    return {
      versionId: id,
      number: typeof version?.version_number === 'number' ? version.version_number : null,
      name: name || null,
    };
  } catch (error) {
    // The version name is a label, not a calculation: an unreadable record
    // leaves it unstated, so the report never names a version it could not read.
    console.warn('[activeVersionIdentity] version name unavailable:', error?.message || error);
    return { versionId: id, number: null, name: null };
  }
}

/**
 * The active version's id, slot number and exact saved name.
 *
 * @param {{active_version_id?: string}|null} project - the Project record
 * @returns {Promise<{versionId: string|null, number: number|null, name: string|null}>}
 */
export async function readActiveVersionIdentity(project) {
  return readVersionIdentity(project?.active_version_id || null);
}