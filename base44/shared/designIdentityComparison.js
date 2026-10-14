/**
 * designIdentityComparison.js  — SERVER MIRROR
 * -------------------------------------------
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
 * Mirrors src/components/report/designIdentityComparison.js for the server, which
 * cannot import the browser module: the derived-identity key list, the stable
 * serializer and the comparison are stated here in the same words, and a test
 * asserts the two agree. The server needs the same verdict because the proposal
 * gate reads the report evidence here — without it the readiness table could read
 * Current while the generation gate refused the same report as stale.
 *
 * Pure: no React, no network, no recalculation, no engineering value.
 */

import { findPublication } from './publishedEngineeringAuthority.js';

/**
 * THE derived display identity of a screen: which display it is PRESENTED as.
 * It is resolved from the design's own physical facts, it is presentation only,
 * and it is therefore never part of a design-identity comparison.
 */
export const DERIVED_DISPLAY_IDENTITY_KEYS = Object.freeze([
  'displayType',
  'display_type',
  'displayLabel',
  'display_label',
  'displayPhrase',
  'display_phrase',
]);

/**
 * A screen's facts with its derived display identity removed, at the screen's own
 * top level only. A declared manual display type is the designer's own choice
 * about a physical display and is left exactly as it stands.
 */
export function withoutDerivedDisplayIdentity(screen) {
  if (!screen || typeof screen !== 'object') return screen ?? null;
  const facts = { ...screen };
  for (const key of DERIVED_DISPLAY_IDENTITY_KEYS) {
    if (key in facts) delete facts[key];
  }
  return facts;
}

/** Order-independent serialization, so two equal facts compare equal. */
export function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const parts = keys.map((key) => JSON.stringify(key) + ':' + stableStringify(value[key]));
    return '{' + parts.join(',') + '}';
  }
  return 'null';
}

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

/** A wording-only move may reuse proposal evidence; a changed Display authority may not. */
export function proposalEvidenceDifferenceIsSafe(savedPublication, currentPublication) {
  if (!engineeringDifferenceIsPresentationOnly(savedPublication, currentPublication)) return false;
  const savedDisplay = frozenDisplayAuthority(savedPublication);
  const currentDisplay = frozenDisplayAuthority(currentPublication);
  if (!savedDisplay || !currentDisplay) return false;
  return stableStringify(savedDisplay) === stableStringify(currentDisplay);
}

/**
 * The verdict for one version, from its own publication history: did the move
 * from `frozenFingerprint` to `currentFingerprint` change only presentation?
 *
 * False when either fingerprint is unstated or when they are equal (nothing
 * moved), and false when either publication is not held by the record — the
 * strict verdict stands rather than an absent comparison excusing a stale report.
 *
 * @param {Object|null} cacheRecord — the version's ProjectAnalysisCache record
 * @param {{frozenFingerprint?: string|null, currentFingerprint?: string|null}} fingerprints
 */
export function engineeringMoveIsPresentationOnly(cacheRecord, {
  frozenFingerprint = null,
  currentFingerprint = null,
} = {}) {
  if (!frozenFingerprint || !currentFingerprint) return false;
  if (frozenFingerprint === currentFingerprint) return false;
  return engineeringDifferenceIsPresentationOnly(
    findPublication(cacheRecord, frozenFingerprint),
    findPublication(cacheRecord, currentFingerprint),
  );
}

/**
 * Proposal-specific reuse verdict. It is stricter than report restoration:
 * client-facing display identity must also agree, otherwise the saved evidence
 * would let old Screen copy survive into a proposal whose authority now says TV.
 */
export function proposalEvidenceMoveIsSafe(cacheRecord, {
  frozenFingerprint = null,
  currentFingerprint = null,
} = {}) {
  if (!frozenFingerprint || !currentFingerprint) return false;
  if (frozenFingerprint === currentFingerprint) return false;
  return proposalEvidenceDifferenceIsSafe(
    findPublication(cacheRecord, frozenFingerprint),
    findPublication(cacheRecord, currentFingerprint),
  );
}

export default engineeringDifferenceIsPresentationOnly;