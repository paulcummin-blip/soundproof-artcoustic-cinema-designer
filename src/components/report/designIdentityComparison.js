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
import { stableStringify, stripLegacySubwooferUiMetadata } from '@/components/proposal/engineeringAuthority/engineeringFingerprint';

/**
 * Project identity and commercial metadata that live on a frozen report_project
 * but are NOT physical design facts: who the project is for and how it is priced.
 * A spelling correction to the client name, a price-mode toggle or a
 * difficulty-multiplier change must never invalidate an engineering document,
 * because none of these changes the design the document was issued against.
 * Mirrored with base44/shared/designIdentityComparison.js (a parity test agrees).
 */
export const PROJECT_IDENTITY_METADATA_KEYS = Object.freeze([
  'client_name',
  'name',
  'project_reference',
  'version_name',
  'project_id',
  'version_id',
  'price_mode',
  'show_prices',
  'difficulty_multiplier',
]);

export function stripProjectIdentityMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const removed = new Set(PROJECT_IDENTITY_METADATA_KEYS);
  const facts = {};
  for (const [key, v] of Object.entries(value)) {
    if (!removed.has(key)) facts[key] = v;
  }
  return facts;
}

/**
 * The physical design facts a publication froze, with the screen's derived
 * display identity removed. Null when the publication states none, in which case
 * no comparison is possible and the strict verdict must stand.
 */
export function frozenDesignFacts(publication) {
  const raw = publication?.report_snapshot?.report_project;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (Object.keys(raw).length === 0) return null;
  // Legacy subwoofer UI metadata (placementMode/isManual) is inert once
  // subwooferInstances exist and is excluded so an equivalent design compares
  // equal — see stripLegacySubwooferUiMetadata. Project identity and commercial
  // metadata (client name, price mode, difficulty multiplier, …) are likewise
  // excluded: a spelling correction or a pricing change is not a design change
  // and must never invalidate an engineering document — see
  // stripProjectIdentityMetadata.
  const project = stripProjectIdentityMetadata(stripLegacySubwooferUiMetadata(raw));
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

/** The client-facing display identity one publication actually stated. */
export function frozenDisplayAuthority(publication) {
  const screen = publication?.report_snapshot?.report_project?.report_screen;
  if (!screen || typeof screen !== 'object' || Array.isArray(screen)) return null;
  const value = (camel, snake) => {
    const raw = screen[camel] ?? screen[snake];
    return raw == null ? null : String(raw).trim().toLowerCase();
  };
  const identity = {
    type: value('displayType', 'display_type'),
    label: value('displayLabel', 'display_label'),
    phrase: value('displayPhrase', 'display_phrase'),
  };
  return Object.values(identity).some(Boolean) ? identity : null;
}

/**
 * Proposal evidence may survive a wording-only publication move, but not a move
 * that changes what the client is told the display is. In that case the saved
 * Project Report must be regenerated so its frozen evidence states the current
 * Display authority before the proposal writer can consume it.
 */
export function proposalEvidenceDifferenceIsSafe(savedPublication, currentPublication) {
  if (!engineeringDifferenceIsPresentationOnly(savedPublication, currentPublication)) return false;
  const savedDisplay = frozenDisplayAuthority(savedPublication);
  const currentDisplay = frozenDisplayAuthority(currentPublication);
  if (!savedDisplay || !currentDisplay) return false;
  return stableStringify(savedDisplay) === stableStringify(currentDisplay);
}

export default engineeringDifferenceIsPresentationOnly;