// stableIdGenerator.js
// Deterministic subwoofer instance ID generator.
// Extracted from subwooferInstanceMigration.js as a Node-compatible .js
// helper so that V2 modules (and Node tests) can import it without pulling
// in @/ aliases. subwooferInstanceMigration.js re-exports this for existing
// consumers.

/**
 * Generate a unique stable subwoofer instance ID.
 *
 * @param {Set<string>|null} existingIds - set of already-used IDs (mutated)
 * @param {string} [group] - optional group prefix (e.g. "front", "rear")
 * @returns {string} unique ID like "sub-1" or "sub-front-1"
 */
export function generateStableId(existingIds, group) {
  const prefix = group ? `sub-${group}-` : "sub-";
  let n = 1;
  while (true) {
    const id = `${prefix}${n}`;
    if (!existingIds || !existingIds.has(id)) {
      if (existingIds) existingIds.add(id);
      return id;
    }
    n++;
  }
}