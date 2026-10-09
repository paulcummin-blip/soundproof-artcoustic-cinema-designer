/**
 * designRatingSectionCompleteness.js
 * ----------------------------------
 * Maps the ONE canonical engineering completeness authority onto the four
 * Design Rating sections (Spatial Resolution, Dynamic Range, Timbre Matching,
 * Screen / Viewing Geometry), so the section's own result pills can show
 * whether that section is fully calculated.
 *
 * Authority: assessEngineeringReportCompleteness() — the same strict, read-only
 * terminal contract that gates reports, proposals and publication. A section is
 * complete when every RP22 parameter it contains is terminal (scored, or
 * genuinely not applicable) for every project seat, and RP23/screen is terminal
 * where the published authority includes it.
 *
 * Completeness is NEVER inferred from a displayed level, from the Design
 * Performance Index, or from the presence of a numeric value: this module reads
 * the terminal-state authority and nothing else. It calculates nothing, changes
 * no score, and is read-only.
 *
 * Pure: no React, no UI, no side effects.
 */

import { assessEngineeringReportCompleteness } from "@/components/engineering/engineeringReportCompleteness";
import { designRatingSectionForParameterKey } from "./designRatingPresentation";

/** The four Design Rating sections, in presentation order. */
export const DESIGN_RATING_SECTIONS = Object.freeze([
  "Spatial Resolution",
  "Dynamic Range",
  "Timbre Matching",
  "Screen / Viewing Geometry",
]);

/**
 * Section completion state for one published engineering summary.
 *
 * @param {Object|null} engineeringSummary — the published Engineering Summary
 *   (the same object the Design Rating card reads its floors and DPIs from).
 * @returns {{
 *   available: boolean,
 *   complete: boolean,
 *   sections: Object<string, { complete: boolean, incompleteParameterKeys: string[] }>,
 *   reason: string|null,
 * }}
 */
export function assessDesignRatingSectionCompleteness(engineeringSummary) {
  const authority = engineeringSummary?.parameterAuthority;
  const available = !!authority && typeof authority === "object" && Object.keys(authority).length > 0;

  const sections = {};
  for (const label of DESIGN_RATING_SECTIONS) {
    sections[label] = { complete: true, incompleteParameterKeys: [] };
  }

  // Fail neutral: with no published parameter authority there is no state to
  // read, so no section is marked incomplete and no outline is invented.
  if (!available) {
    return { available: false, complete: false, sections, reason: null };
  }

  const terminal = assessEngineeringReportCompleteness(engineeringSummary);

  // Both buckets are non-terminal: a parameter with no terminal result at all,
  // and a seat-scoped parameter with at least one seat still not terminal.
  const incompleteKeys = [
    ...(terminal.missingParameterKeys || []),
    ...(terminal.incompleteSeatParameterKeys || []),
  ];

  for (const key of incompleteKeys) {
    const label = designRatingSectionForParameterKey(key);
    const section = label ? sections[label] : null;
    if (!section) continue;
    section.complete = false;
    if (!section.incompleteParameterKeys.includes(key)) {
      section.incompleteParameterKeys.push(key);
    }
  }

  return {
    available: true,
    complete: terminal.complete === true,
    sections,
    reason: terminal.reason || null,
  };
}

/**
 * Whether ONE Design Rating section is complete for this summary.
 * @param {Object|null} engineeringSummary
 * @param {string} sectionLabel — one of DESIGN_RATING_SECTIONS
 * @returns {boolean}
 */
export function isDesignRatingSectionComplete(engineeringSummary, sectionLabel) {
  const assessment = assessDesignRatingSectionCompleteness(engineeringSummary);
  return assessment.sections[sectionLabel]?.complete === true;
}