/**
 * designIdentityComparison
 * ------------------------
 * ONE question, answered from two publications of one project version: did the
 * DESIGN change, or only the way it is presented?
 *
 * The engineering fingerprint is a version's design identity, and a design's
 * derived display identity is presentation (see displayTypeAuthority). A report
 * frozen before that rule — or frozen against a publication written while a
 * derived field was still part of the hash — carries a fingerprint the version's
 * pointer has since moved past WITHOUT the design changing. This module
 * recognises exactly that case, from the two publications' own frozen physical
 * facts, so an unchanged design is never reported as out of date.
 *
 * Deliberately conservative: it answers true ONLY when both publications state
 * their frozen report facts and those facts are equal once the derived display
 * identity is removed. A publication that states no frozen facts, or any
 * physical difference at all, answers false — the strict verdict then stands and
 * the report is treated as needing an update.
 *
 * Pure: no React, no network, no recalculation, no engineering value.
 */

import { withoutDerivedDisplayIdentity } from '@/components/models/screen/displayTypeAuthority';
import { stableStringify } from '@/components/proposal/engineeringAuthority/engineeringFingerprint';

/**
 * The physical design facts a publication froze, with the screen's derived
 * display identity removed. Null when the publication states none, in which case
 * no comparison is possible and the strict verdict must stand.
 */
export function frozenDesignFacts(publication) {
  const project = publication?.report_snapshot?.report_project;
  if (!project || typeof project !== 'object' || Array.isArray(project)) return null;
  if (Object.keys(project).length === 0) return null;
  const screen = project.report_screen;
  if (!screen || typeof screen !== 'object' || Array.isArray(screen)) return project;
  return { ...project, report_screen: withoutDerivedDisplayIdentity(screen) };
}

/** Whether two publications state the same physical design. */
export function samePhysicalDesign(savedPublication, currentPublication) {
  const saved = frozenDesignFacts(savedPublication);
  const current = frozenDesignFacts(currentPublication);
  if (!saved || !current) return false;
  return stableStringify(saved) === stableStringify(current);
}

/**
 * Whether the version's move from a saved publication to its current publication
 * was presentation only. False whenever either side cannot be compared.
 */
export function engineeringDifferenceIsPresentationOnly(savedPublication, currentPublication) {
  if (!savedPublication || !currentPublication) return false;
  return samePhysicalDesign(savedPublication, currentPublication);
}

export default engineeringDifferenceIsPresentationOnly;