/**
 * projectReportRegistry.js
 * ------------------------
 * The Project Report's SECTION LABELS — nothing more.
 *
 * ONE CATEGORY MAPPING ONLY
 *   The RP22 category of every parameter comes from `technicalParameterMeta`
 *   (Spatial Resolution P1–P11 · Dynamic Range P12–P16 · Timbre Matching
 *   P17–P21). This module never restates a category name, so a page heading and
 *   a parameter's own category label can never disagree.
 *
 * WHAT THIS MODULE OWNS
 *   — the document's section names
 *   — the heading each section states
 *
 * WHAT IT DELIBERATELY DOES NOT OWN
 *   The document's page order. The consolidated Project Report is an edit of the
 *   existing Visual and Technical Reports: the front section, the Visual Report's
 *   own pages and the Technical Report's own pages are composed by
 *   `useProjectReportPages` in the order those reports already print. No second
 *   registry reorders, splits or re-sections them, and no parameter card is moved
 *   between reports.
 *
 * Pure module: no React, no DOM, no side effects.
 */

import { getCategoryForParam } from '@/components/report/technical/technicalParameterMeta';

/* ── Sections ───────────────────────────────────────────────────────────── */

export const PROJECT_REPORT_SECTION = Object.freeze({
  DESIGN_SUMMARY: 'design-summary',
  SYSTEM_PRODUCTS: 'system-products',
  VIEWING_EXPERIENCE: 'viewing-experience',
  SPATIAL_RESOLUTION: 'spatial-resolution',
  DYNAMIC_RANGE: 'dynamic-range',
  TIMBRE_MATCHING: 'timbre-matching',
  PER_SEAT: 'per-seat',
  ACOUSTIC_TREATMENT: 'acoustic-treatment',
  ABOUT: 'about',
});

/**
 * A section's heading — the category name from `technicalParameterMeta` for the
 * three RP22 categories, and the section's own name otherwise.
 */
export function projectReportSectionHeading(sectionId) {
  switch (sectionId) {
    case PROJECT_REPORT_SECTION.SPATIAL_RESOLUTION:
      return getCategoryForParam(1);
    case PROJECT_REPORT_SECTION.DYNAMIC_RANGE:
      return getCategoryForParam(12);
    case PROJECT_REPORT_SECTION.TIMBRE_MATCHING:
      return getCategoryForParam(17);
    case PROJECT_REPORT_SECTION.DESIGN_SUMMARY:
      return 'Design Summary';
    case PROJECT_REPORT_SECTION.SYSTEM_PRODUCTS:
      return 'System & Products';
    case PROJECT_REPORT_SECTION.VIEWING_EXPERIENCE:
      return 'Viewing Experience';
    case PROJECT_REPORT_SECTION.PER_SEAT:
      return 'Per-Seat Performance';
    case PROJECT_REPORT_SECTION.ACOUSTIC_TREATMENT:
      return 'Acoustic Treatment';
    case PROJECT_REPORT_SECTION.ABOUT:
      return 'About Sound Proof';
    default:
      return null;
  }
}