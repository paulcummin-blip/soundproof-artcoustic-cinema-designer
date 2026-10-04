/**
 * reportVersionIdentity
 * ---------------------
 * THE single statement of which design version a report belongs to.
 *
 * A project holds several design versions and Proposal Centre compares them, so
 * every report surface — the first-page metadata line, the exported PDF filename
 * and the report source status shown against a version — must name the version
 * the report was generated from. One module states it, so the on-screen first
 * page, the printed first page and the filename can never disagree.
 *
 * The version is resolved from the ProjectVersion the project points at:
 *   name    the designer's version name
 *           → "Version <n>" when only the slot is known
 *           → "Version 1" when nothing at all is known
 *   marker  the slot ("V1"), stated only when the name does not already carry
 *           that number, so a number is never doubled.
 *
 * Pure module: no React, no side effects, no runtime APIs.
 */

/** Stated when nothing at all is known about the design version. */
export const REPORT_VERSION_FALLBACK_NAME = 'Version 1';

/** A version's slot number, or null when it is not known. */
function versionNumber(version) {
  const number = Number(version?.number);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * The version's own name — never blank, so a report always identifies a design.
 *
 * @param {{number?: number, name?: string}|null} [version]
 * @returns {string}
 */
export function reportVersionName(version) {
  const name = typeof version?.name === 'string' ? version.name.trim() : '';
  if (name) return name;
  const number = versionNumber(version);
  return number ? `Version ${number}` : REPORT_VERSION_FALLBACK_NAME;
}

/**
 * `Version: Level 4 version` — the first-page metadata statement.
 *
 * @param {{number?: number, name?: string}|null} [version]
 * @returns {string}
 */
export function reportVersionMetaStatement(version) {
  return `Version: ${reportVersionName(version)}`;
}

/**
 * The version segment of a filename: the version name, with the slot marker
 * appended as "V<n>" only when the name does not already state that number as a
 * standalone number — "Original Design V1", but "Level 4 version" (the name
 * already says 4), while "Twin SUB2-12" still states its slot as V2.
 *
 * @param {{number?: number, name?: string}|null} [version]
 * @returns {string}
 */
export function reportVersionFilenameSegment(version) {
  const name = reportVersionName(version);
  const number = versionNumber(version);
  if (!number) return name;
  const statesSlot = new RegExp(`(^|[^0-9A-Za-z])${number}([^0-9A-Za-z]|$)`).test(name);
  return statesSlot ? name : `${name} V${number}`;
}