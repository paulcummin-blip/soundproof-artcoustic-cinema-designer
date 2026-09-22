/**
 * Shared Sound Proof report PDF filename helper.
 *
 * Every PDF export path MUST use buildReportFilename so that exported
 * filenames are consistent across all report types — now and in the future.
 * Individual report generators must never build their own filenames.
 *
 * Required format:
 *   Sound Proof <Report Type> - Artcoustic Cinema Designer - <Project Name>[ - v<Version Number> <Version Name>].pdf
 *
 * The browser's "Save as PDF" dialog uses document.title as the default
 * filename and appends the .pdf extension automatically, so the helpers
 * return the title WITHOUT the .pdf extension.
 *
 * Invalid filename characters (Windows/macOS) are replaced with spaces.
 */

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;

function sanitise(value, fallback) {
  if (!value) return fallback;
  const cleaned = String(value)
    .replace(INVALID_FILENAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

/**
 * Sanitise a project name for use in a filename.
 * @param {string} name
 * @returns {string} safe filename-safe project name
 */
export function sanitiseProjectName(name) {
  return sanitise(name, "Untitled Project");
}

/**
 * Sanitise a version name for use in a filename.
 * @param {string} name
 * @returns {string} safe filename-safe version name
 */
export function sanitiseVersionName(name) {
  return sanitise(name, "");
}

/**
 * Build the version suffix for a filename.
 *
 * The suffix is appended only when the designer has saved a named version
 * with a non-default name. The baseline V1 "Current Design" is not appended
 * because it is the default, not a saved design version.
 *
 * @param {{ number: number, name: string } | null | undefined} version
 * @returns {string} "" or " - v2 Twin SUB2-12"
 */
function buildVersionSuffix(version) {
  if (!version) return "";
  const { number, name } = version;
  const safeName = sanitiseVersionName(name);
  // Only append when the version has a meaningful (non-default) name.
  // "Current Design" is the default V1 baseline — not a saved version.
  if (!safeName || safeName === "Current Design") return "";
  const numPart = Number.isFinite(number) ? `v${number} ` : "";
  return ` - ${numPart}${safeName}`;
}

/**
 * Build a standardised Sound Proof report filename (title).
 *
 * @param {string} reportType - e.g. "Visual", "Technical", "Client Summary", "Design Comparison"
 * @param {string} projectName - current project name
 * @param {{ number: number, name: string } | null | undefined} [version] - optional saved version
 * @returns {string} filename title (without .pdf extension)
 */
export function buildReportFilename(reportType, projectName, version) {
  const safeProject = sanitiseProjectName(projectName);
  const versionSuffix = buildVersionSuffix(version);
  return `Sound Proof ${reportType} - Artcoustic Cinema Designer - ${safeProject}${versionSuffix}`;
}

/**
 * Visual Report filename helper. Delegates to buildReportFilename.
 * @param {string} projectName
 * @param {{ number: number, name: string } | null | undefined} [version]
 * @returns {string}
 */
export function buildVisualReportTitle(projectName, version) {
  return buildReportFilename("Visual", projectName, version);
}

/**
 * Technical Report filename helper. Delegates to buildReportFilename.
 * @param {string} projectName
 * @param {{ number: number, name: string } | null | undefined} [version]
 * @returns {string}
 */
export function buildTechnicalReportTitle(projectName, version) {
  return buildReportFilename("Technical", projectName, version);
}