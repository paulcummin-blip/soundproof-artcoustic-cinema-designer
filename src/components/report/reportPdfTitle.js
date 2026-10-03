/**
 * Shared Sound Proof report PDF filename helper.
 *
 * Every report export path — the Visual Report, the Technical Report and any
 * future report or download button — MUST use this module. Individual report
 * generators must never build their own filenames.
 *
 * Required format:
 *   Sound Proof - Artcoustic Cinema Designer - <Report Type>[ - <Dealer>] - <Project Name>[ - <Project Reference>][ - v<N> <Version Name>]
 *
 * Examples:
 *   Sound Proof - Artcoustic Cinema Designer - Visual - Ribble AV - Lords Hall - LH-001
 *   Sound Proof - Artcoustic Cinema Designer - Technical - Richer Sounds Nottingham - Clarke - RSN-CLARKE
 *
 * The dealer and the project reference are optional: when they are not
 * available the segment is omitted entirely rather than filled with a
 * placeholder. "Visual" or "Technical" is ALWAYS present, and the project name
 * is always present (falling back to "Untitled Project").
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

const BRAND = "Sound Proof";
const PRODUCT = "Artcoustic Cinema Designer";
const SEPARATOR = " - ";
const FALLBACK_PROJECT = "Untitled Project";

/** The fixed report-type token. "Visual" / "Technical" must always be present. */
export const REPORT_PDF_TYPE = Object.freeze({
  VISUAL: "Visual",
  TECHNICAL: "Technical",
  PROPOSAL: "Proposal",
  SYSTEM_DESIGN_SUMMARY: "System Design Summary",
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
 * The version segment for a filename, e.g. "v2 Twin SUB2-12".
 *
 * Appended only when the designer saved a named version: the baseline V1
 * "Current Design" is the default, not a saved design, so it is not stated.
 *
 * @param {{ number: number, name: string } | null | undefined} version
 * @returns {string} "" or the version segment
 */
function buildVersionSegment(version) {
  if (!version) return "";
  const safeName = sanitiseVersionName(version.name);
  if (!safeName || safeName === "Current Design") return "";
  const numPart = Number.isFinite(version.number) ? `v${version.number} ` : "";
  return `${numPart}${safeName}`.trim();
}

/**
 * Build the standardised Sound Proof report filename (without the extension).
 *
 * @param {string} reportType - "Visual", "Technical", "Proposal", …
 * @param {string} projectName - the project's name
 * @param {{ number: number, name: string } | null | undefined} [version] - optional saved version
 * @param {{ dealerName?: string, projectReference?: string } | null} [details] - optional segments
 * @returns {string} filename title (no .pdf extension)
 */
export function buildReportFilename(reportType, projectName, version, details = {}) {
  const type = sanitiseFilenameSegment(reportType, "");
  const segments = [BRAND, PRODUCT];
  if (type) segments.push(type);

  const dealer = sanitiseFilenameSegment(details?.dealerName, "");
  if (dealer) segments.push(dealer);

  segments.push(sanitiseProjectName(projectName));

  const reference = sanitiseFilenameSegment(details?.projectReference, "");
  if (reference) segments.push(reference);

  const versionSegment = buildVersionSegment(version);
  if (versionSegment) segments.push(versionSegment);

  return segments.join(SEPARATOR);
}

/**
 * The same filename WITH the .pdf extension, for a real download (an <a download>
 * attribute or a generated blob). The print dialog adds the extension itself,
 * so this is only for paths that name a file directly.
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
 * Technical Report filename. Delegates to buildReportFilename.
 */
export function buildTechnicalReportTitle(projectName, version, details = {}) {
  return buildReportFilename(REPORT_PDF_TYPE.TECHNICAL, projectName, version, details);
}