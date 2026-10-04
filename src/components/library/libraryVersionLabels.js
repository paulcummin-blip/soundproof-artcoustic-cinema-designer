/**
 * libraryVersionLabels.js
 * -----------------------
 * The exact saved version name, everywhere the Library names a version.
 *
 * A version's name is the name the designer saved on the ProjectVersion record.
 * Nothing here invents a name: an unreadable version leaves the field blank
 * rather than showing a wrong one.
 *
 * Pure: no reads, no writes.
 */

import { documentVersionIds } from './librarySourceStatus';

/** id → the exact saved version name. */
export function buildVersionNameMap(versions = []) {
  const map = new Map();
  (Array.isArray(versions) ? versions : []).forEach((version) => {
    if (version?.id && version.version_name) map.set(version.id, version.version_name);
  });
  return map;
}

export function versionNameOf(version) {
  return version?.version_name || null;
}

/**
 * The version sentence for one issued document or live report.
 * One version → its exact saved name. Several → "Comparing A version and B version".
 */
export function describeDocumentVersions(record, versionNameById = new Map()) {
  const ids = documentVersionIds(record);
  if (ids.length === 0) return null;

  const names = ids.map((id) => versionNameById.get(id) || null);
  if (names.length === 1) return names[0];
  if (names.some((name) => !name)) return null;

  const withWord = names.map((name) => `${name} version`);
  if (withWord.length === 2) return `Comparing ${withWord[0]} and ${withWord[1]}`;
  return `Comparing ${withWord.slice(0, -1).join(', ')} and ${withWord[withWord.length - 1]}`;
}