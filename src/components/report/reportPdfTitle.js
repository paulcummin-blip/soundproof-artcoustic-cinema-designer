/**
 * Shared Sound Proof report PDF filename helper.
 *
 * Every export path — the consolidated Project Report, the Current Speaker
 * Design schedule, the Technical Report, a Proposal and any future download
 * button — MUST use this module. Individual report generators must never build
 * their own filenames.
 *
 * Required format:
 *   Sound Proof <Document Type> - <Project Name> - <Version>
 *
 * Examples:
 *   Sound Proof Speaker Design - Barton Solutions - Original Design
 *   Sound Proof Project Report - Barton Solutions - Original Design
 *   Sound Proof Proposal - Barton Solutions - Original Design
 *
 * A filename states the document and the design it documents, and nothing else:
 * the project name and the design version are enough to identify the file. The
 * dealer/account name, the client name and the project reference are deliberately
 * NOT part of it, the product name ("Artcoustic Cinema Designer") is never
 * written, and the document type is stated once — a name never repeats
 * "Sound Proof" or the document type. Callers still pass `details`; the identity
 * those fields carry is used for export logging, never for the name.
 *
 * The design version is ALWAYS stated when a version is supplied: a project can
 * hold several versions and Proposal Centre compares them, so an exported report
 * must say which design it documents. The version is written as the saved name
 * exactly — no version slot marker is ever appended. A blank saved name falls
 * back to "Version <slot>", or "Version 1" when the slot is unknown too. See
 * reportVersionIdentity.js.
 *
 * A proposal document is versioned by the versions it was built from rather than
 * by the report's own design version, supplied as `details.versionNames`: one
 * version states its exact saved name, several state what is being compared —
 * "Comparing Level 4 version and Level 1 version", shortened to "A vs B" when
 * that is too long. A caller that supplies neither states no version.
 *
 * The document type always opens the filename and the project name is always
 * present (falling back to "Untitled Project"), so a name can never state a
 * version with no document and no project to belong to.
 *
 * The browser's "Save as PDF" dialog uses document.title as the default
 * filename and appends the .pdf extension itself, so the title helpers return
 * the name WITHOUT the extension. A real download (an <a download> or a blob)
 * gets the extension from buildReportPdfFilename.
 *
 * Sanitising: characters no filesystem accepts (including slashes) are removed,
 * runs of whitespace are collapsed, leading and trailing separators are
 * trimmed, and any reference to the platform the app is built on ("Base44") is
 * stripped — an exported client filename never names the platform.
 */

import { reportVersionFilenameSegment } from './reportVersionIdentity.js';

const BRAND = "Sound Proof";
const SEPARATOR = " - ";
const FALLBACK_PROJECT = "Untitled Project";

/**
 * The fixed document-type token. Every exported document states which document
 * it is: the consolidated Project Report, the Current Speaker Design schedule,
 * a Proposal, or the internal Technical Report.
 */
export const REPORT_PDF_TYPE = Object.freeze({
  PROJECT_REPORT: "Project Report",
  /** The Current Speaker Design schedule exported beside the Project Report. */
  SPEAKER_DESIGN: "Speaker Design",
  VISUAL: "Visual",
  TECHNICAL: "Technical",
  PROPOSAL: "Proposal",
  SYSTEM_DESIGN_SUMMARY: "System Design Summary",
  SYSTEM_DESIGN_COMPARISON: "System Design Comparison",
});

/** Characters no filesystem accepts — Windows is the strictest of the two. */
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
/** The platform the app is built on is never named in an exported filename. */
const PLATFORM_TOKEN = /\bbase\s*44\b/gi;

/**
 * Sanitise one filename segment.
 *
 * Removes illegal characters (including slashes), strips any platform name,
 * collapses repeated whitespace, and trims separators and spaces from both
 * ends. Hyphens inside a name are kept as readable separators.
 *
 * @param {*} value - the raw value (project, dealer, reference, version name)
 * @param {string} [fallback] - returned when nothing usable survives
 * @returns {string} a filename-safe segment, or the fallback when empty
 */
export function sanitiseFilenameSegment(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const cleaned = String(value)
    .replace(PLATFORM_TOKEN, " ")
    .replace(ILLEGAL_FILENAME_CHARS, " ")
    // En/em dashes read as separators in a filename, so they become hyphens.
    .replace(/[\u2013\u2014]/g, "-")
    // Possessive apostrophes read poorly in a shared filename, so they drop:
    // "Lord's Hall" exports as "Lords Hall".
    .replace(/[\u2018\u2019']/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[-\s]+/, "")
    .replace(/[-\s]+$/, "")
    .trim();
  return cleaned || fallback;
}

/** Sanitise a project name for use in a filename. */
export function sanitiseProjectName(name) {
  return sanitiseFilenameSegment(name, FALLBACK_PROJECT);
}

/** Sanitise a version name for use in a filename. */
export function sanitiseVersionName(name) {
  return sanitiseFilenameSegment(name, "");
}

/**
 * The version segment for a filename: the saved version name stated exactly,
 * e.g. "Level 4 version" or "Original Design".
 *
 * Always stated when a version is supplied — see reportVersionIdentity.js for
 * the name and fallback rules. A caller that states no version at all states
 * none.
 *
 * @param {{ number: number, name: string } | null | undefined} version
 * @returns {string} "" or the version segment
 */
function buildVersionSegment(version) {
  if (!version) return "";
  return sanitiseFilenameSegment(reportVersionFilenameSegment(version), "");
}

/**
 * Add one sanitised segment to the filename.
 *
 * An empty value adds nothing, and a value identical to the segment before it
 * is written once: the same figure entered as both the client name and the
 * project reference ("34 AR") appears as one segment, never "… - 34 AR - 34 AR".
 *
 * @param {string[]} segments - the filename segments being built, mutated
 * @param {*} value - the raw value for this segment
 */
function appendSegment(segments, value) {
  const segment = sanitiseFilenameSegment(value, "");
  if (!segment) return;
  const previous = segments[segments.length - 1];
  if (previous && previous.toLowerCase() === segment.toLowerCase()) return;
  segments.push(segment);
}

/**
 * Build the standardised Sound Proof report filename (without the extension):
 *
 *   Sound Proof <Document Type> - <Project Name> - <Version>
 *
 * The dealer name, client name and project reference carried in `details` are
 * deliberately not written — see the module header. `details.versionSegment`
 * stands in for the design version of a document built from several versions.
 *
 * @param {string} reportType - "Project Report", "Speaker Design", "Proposal", …
 * @param {string} projectName - the project's name
 * @param {{ number: number, name: string } | null | undefined} [version] - the design version this report documents
 * @param {{ dealerName?: string, clientName?: string, projectReference?: string, versionSegment?: string } | null} [details] - caller context (identity is never written into the name)
 * @returns {string} filename title (no .pdf extension)
 */
export function buildReportFilename(reportType, projectName, version, details = {}) {
  const type = sanitiseFilenameSegment(reportType, "");
  const segments = [type ? `${BRAND} ${type}` : BRAND];

  appendSegment(segments, sanitiseProjectName(projectName));
  appendSegment(segments, buildVersionSegment(version));
  // A proposal document states the design versions it was built from, in place of
  // the report's own single design version. See buildProposalVersionSegment.
  appendSegment(segments, details?.versionSegment);

  return segments.join(SEPARATOR);
}

/**
 * The same filename WITH the .pdf extension, for a real download (an <a download>
 * attribute or a generated blob). The print dialog adds the extension itself,
 * so this is only for paths that name a file directly — and it is the same name
 * the Project Library stores, so a stored document is listed under exactly the
 * filename it was downloaded as.
 *
 * @returns {string} filename ending in ".pdf"
 */
export function buildReportPdfFilename(reportType, projectName, version, details = {}) {
  return `${buildReportFilename(reportType, projectName, version, details)}.pdf`;
}

/**
 * Visual Report filename. Delegates to buildReportFilename.
 */
export function buildVisualReportTitle(projectName, version, details = {}) {
  return buildReportFilename(REPORT_PDF_TYPE.VISUAL, projectName, version, details);
}

/**
 * The consolidated Project Report filename. Delegates to buildReportFilename
 * with the Project Report token, so the exported file is named after the
 * document the designer opened rather than an internal report name.
 */
export function buildProjectReportTitle(projectName, version, details = {}) {
  return buildReportFilename(REPORT_PDF_TYPE.PROJECT_REPORT, projectName, version, details);
}

/**
 * Technical Report filename. Delegates to buildReportFilename.
 */
export function buildTechnicalReportTitle(projectName, version, details = {}) {
  return buildReportFilename(REPORT_PDF_TYPE.TECHNICAL, projectName, version, details);
}

/**
 * The report-type token for a Proposal record's `proposal_type`, so every
 * client design report names the document it actually is:
 *   system_summary → System Design Summary
 *   comparison     → System Design Comparison
 *   single (legacy) → Proposal
 */
export function proposalReportTypeToken(proposalType) {
  if (proposalType === "system_summary") return REPORT_PDF_TYPE.SYSTEM_DESIGN_SUMMARY;
  if (proposalType === "comparison") return REPORT_PDF_TYPE.SYSTEM_DESIGN_COMPARISON;
  return REPORT_PDF_TYPE.PROPOSAL;
}

/** The longest a comparison segment may be before it shortens to "A vs B". */
export const COMPARISON_SEGMENT_MAX_LENGTH = 64;

/** The version names as filename-safe, non-empty segments, in selection order. */
function normaliseVersionNames(names) {
  return (Array.isArray(names) ? names : [names])
    .map((name) => sanitiseVersionName(name))
    .filter(Boolean);
}

/**
 * The version segment of a proposal document's filename.
 *
 *   one version   "Level 4 version"
 *   two or more   "Comparing Level 4 version and Level 1 version"
 *                 "Comparing A vs B" when the full form would be too long
 *
 * @param {string[]} versionNames - the saved names of the versions selected
 * @returns {string} "" when no name is known
 */
export function buildProposalVersionSegment(versionNames) {
  const names = normaliseVersionNames(versionNames);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];

  const full = names.length === 2
    ? `Comparing ${names[0]} and ${names[1]}`
    : `Comparing ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  if (full.length <= COMPARISON_SEGMENT_MAX_LENGTH) return full;

  return `Comparing ${names.join(" vs ")}`;
}

/**
 * Proposal / System Design report filename. Delegates to buildReportFilename
 * with the report type token for the proposal's own type, stating the exact
 * saved names of the versions the document was built from.
 *
 * @param {string} projectName
 * @param {string} proposalType - single | comparison | system_summary
 * @param {{dealerName?, clientName?, projectReference?, versionNames?: string[]}} [details]
 */
export function buildProposalReportTitle(projectName, proposalType, details = {}) {
  const names = normaliseVersionNames(details?.versionNames);
  return buildReportFilename(proposalReportTypeToken(proposalType), projectName, null, {
    ...details,
    versionSegment: names.length > 0 ? buildProposalVersionSegment(names) : "",
  });
}