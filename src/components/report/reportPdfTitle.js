/**
 * Report PDF filename utilities.
 *
 * The browser's "Save as PDF" dialog uses document.title as the default
 * filename. These helpers produce consistent Sound Proof-branded titles
 * for the Visual and Technical report exports.
 *
 * Only characters that are invalid in filenames on Windows/macOS are
 * removed. Spaces, hyphens, letters, and numbers are preserved.
 */

function sanitiseProjectName(name) {
  if (!name) return "Untitled Project";
  const cleaned = String(name)
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Untitled Project";
}

export function buildVisualReportTitle(projectName) {
  return `Sound Proof Visual - Artcoustic Cinema Designer - ${sanitiseProjectName(projectName)}`;
}

export function buildTechnicalReportTitle(projectName) {
  return `Sound Proof Technical - Artcoustic Cinema Designer - ${sanitiseProjectName(projectName)}`;
}