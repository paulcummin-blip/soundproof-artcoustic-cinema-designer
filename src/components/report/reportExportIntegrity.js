/**
 * reportExportIntegrity.js
 * ------------------------
 * Pure content-based export integrity validation for the consolidated Project
 * Report PDF.
 *
 * The export button has historically been gated on page presence and render
 * readiness (isometric image, plan drawings, ADI completion). Those checks do
 * not validate the actual engineering EVIDENCE the PDF carries: a PDF can
 * reach the correct page count while its Bass Calculations graphs are empty,
 * its Performance Summary is absent, or its RP22 parameter fields are blank.
 *
 * This module validates the real content requirements from the same authority
 * the report renders from, so an incomplete report can never export. It never
 * fabricates missing results and never substitutes old evidence — it only
 * reports what is present and what is missing.
 *
 * Pure: no React, no fetching, no side effects.
 */

import { validateRequiredParameters } from './reportParameterCompleteness';

/**
 * Validate the export integrity of the consolidated Project Report.
 *
 * @param {object} params
 * @param {object|null} params.publication - the selected engineering publication
 * @param {object|null} params.engineeringSummary - the resolved engineering summary
 * @param {object|null} params.completedBassAuthority - the frozen bass authority
 * @param {object|null} params.p19Graph - the P19 RSP graph (built from bass authority)
 * @param {boolean} [params.showDesignRating] - whether the Design Rating should appear
 * @param {boolean} [params.isometricReportImageReady] - isometric image readiness
 * @param {number} [params.pageCount] - number of composed report pages
 * @returns {{ready: boolean, issues: string[], categories: object}}
 */
export function validateReportExportIntegrity({
  publication = null,
  engineeringSummary = null,
  completedBassAuthority = null,
  p19Graph = null,
  showDesignRating = false,
  isometricReportImageReady = false,
  pageCount = 0,
} = {}) {
  const issues = [];
  const categories = {
    publication: true,
    bassFingerprint: true,
    bassAuthority: true,
    bassGraphs: true,
    p19Graph: true,
    rp22Results: true,
    performanceSummary: true,
    designRating: true,
    isometric: true,
    pages: true,
  };

  // 1. A valid engineering publication is selected.
  if (!publication) {
    issues.push('No engineering publication selected.');
    categories.publication = false;
  }

  // 2. The bass calculation fingerprint matches the publication.
  const publicationBassFp = publication?.provenance?.bass_fingerprint || null;
  const authorityFp = completedBassAuthority?.currentFingerprint || null;
  if (publicationBassFp && authorityFp && publicationBassFp !== authorityFp) {
    issues.push('Bass calculation fingerprint does not match the selected publication.');
    categories.bassFingerprint = false;
  }
  if (publicationBassFp && !authorityFp) {
    issues.push('No restored bass authority for the selected publication.');
    categories.bassFingerprint = false;
  }

  // 3. The bass authority is current and authoritative.
  if (!completedBassAuthority?.authoritative || completedBassAuthority?.authorityStatus !== 'AUTHORITATIVE') {
    issues.push('Bass authority is not current or authoritative' + (completedBassAuthority?.error || completedBassAuthority?.verificationReason ? ': ' + (completedBassAuthority.error || completedBassAuthority.verificationReason) : '.'));
    categories.bassAuthority = false;
  }
  if (!completedBassAuthority?.contract) {
    issues.push('No completed bass contract available.');
    categories.bassAuthority = false;
  }

  // 4. Required bass response graphs contain genuine saved data.
  const gp = completedBassAuthority?.contract?.graphPayload || null;
  const hasRawCurve = Array.isArray(gp?.roomResponseCurve) && gp.roomResponseCurve.length > 0;
  const hasInRoomCurve = Array.isArray(gp?.physicalRawResponseCurve) && gp.physicalRawResponseCurve.length > 0;
  const hasPostEqCurve = Array.isArray(gp?.postEqRspCurve) && gp.postEqRspCurve.length > 0;
  const hasSubCurves = Array.isArray(gp?.sourceCapabilityCurves) && gp.sourceCapabilityCurves.some(c => Array.isArray(c) && c.length > 0);
  if (!hasRawCurve || !hasInRoomCurve || !hasPostEqCurve || !hasSubCurves) {
    issues.push('Required bass response graphs are missing saved curve data.');
    categories.bassGraphs = false;
  }

  // 5. The P19 RSP graph is available.
  if (!p19Graph || !Array.isArray(p19Graph.series) || p19Graph.series.length === 0) {
    issues.push('P19 RSP bass response graph is not available.');
    categories.p19Graph = false;
  }

  // 6. Required RP22 parameters have terminal published evidence. Each
  // parameter is validated at its correct assessment scope (room or seat)
  // against the canonical parameter authority — not display values. Only
  // terminal scored results or explicit legitimate terminal N/A results
  // pass; provisional, incomplete, display-only and insufficient-data N/A
  // results are rejected. P19 is validated against the completed bass
  // authority's RSP-specific result when available.
  const { missing: missingParams } = validateRequiredParameters({
    parameterAuthority: engineeringSummary?.parameterAuthority || {},
    completedBassAuthority,
  });
  if (missingParams.length > 0) {
    issues.push(`RP22 parameter results are missing or incomplete: ${missingParams.map(p => 'P' + p).join(', ')}.`);
    categories.rp22Results = false;
  }

  // 7. Performance Summary is populated.
  const reportCounts = engineeringSummary?.project?.reportCounts || null;
  if (!reportCounts || !reportCounts.roomLevelCounts || typeof reportCounts.roomLevelCounts !== 'object') {
    issues.push('Performance Summary report counts are not populated.');
    categories.performanceSummary = false;
  }

  // 8. System Design Rating appears when enabled and available.
  if (showDesignRating) {
    const rating = engineeringSummary?.project?.rating || engineeringSummary?.designRating?.room || null;
    if (!rating || rating.status === 'NOT_ASSESSED') {
      issues.push('System Design Rating is enabled but not assessed.');
      categories.designRating = false;
    }
  }

  // 9. Isometric Room View image is ready.
  if (!isometricReportImageReady) {
    issues.push('Isometric Room View image is not ready.');
    categories.isometric = false;
  }

  // 10. Pages are composed.
  if (pageCount === 0) {
    issues.push('No report pages composed.');
    categories.pages = false;
  }

  const ready = issues.length === 0;
  return { ready, issues, categories };
}

export default validateReportExportIntegrity;