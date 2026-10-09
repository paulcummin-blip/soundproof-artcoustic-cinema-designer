/**
 * projectReportRegistry.js
 * ------------------------
 * THE composition authority for the consolidated Project Report — the one
 * document that states the whole engineering design (RP23 viewing geometry,
 * RP22 P1–P21, the detailed bass evidence, the per-seat results, treatment,
 * products and drawings) in one coherent engineering order.
 *
 * ONE CATEGORY MAPPING ONLY
 *   The RP22 category of every parameter comes from `technicalParameterMeta`
 *   (Spatial Resolution P1–P11 · Dynamic Range P12–P16 · Timbre Matching
 *   P17–P21). This module never restates a category name, so a page heading and
 *   a parameter's own category label can never disagree, and there is no second
 *   Project Report category map to keep in step.
 *
 * WHAT THIS MODULE OWNS
 *   — the document's sections and the order they print in
 *   — which section each page belongs to, and the heading that section prints
 *     (with "— Continued" on every page after the first of that section — the
 *     suffix is applied HERE and only here, so no page can state it twice)
 *   — the P1–P21 inclusion rule: every parameter has an explicit row in its
 *     category's index table, so no parameter can silently disappear even when
 *     it carries no drawing of its own
 *
 * Nothing here computes, grades or re-derives an engineering value: parameter
 * rows are read through the report's own canonical evidence reader.
 *
 * Pure module: no React, no DOM, no side effects.
 */

import {
  getCategoryForParam,
  getHumanTitleForParam,
} from '@/components/report/technical/technicalParameterMeta';
import { readReportParameter } from '@/components/report/reportParameterEvidence';

/* ── Sections ───────────────────────────────────────────────────────────── */

export const PROJECT_REPORT_SECTION = Object.freeze({
  COVER: 'cover',
  DESIGN_STORY: 'design-story',
  SYSTEM_PRODUCTS: 'system-products',
  DESIGN_OVERVIEW: 'design-overview',
  VIEWING_EXPERIENCE: 'viewing-experience',
  VIEWING_GEOMETRY: 'viewing-geometry',
  PERFORMANCE_OVERVIEW: 'performance-overview',
  SPATIAL_RESOLUTION: 'spatial-resolution',
  DYNAMIC_RANGE: 'dynamic-range',
  TIMBRE_MATCHING: 'timbre-matching',
  PER_SEAT: 'per-seat',
  ACOUSTIC_TREATMENT: 'acoustic-treatment',
  ENGINEERING_DRAWINGS: 'engineering-drawings',
  METHOD: 'method-assumptions',
});

/**
 * The three RP22 category headings are stated in capitals: they name a CEDIA
 * assessment area, they are the document's own category headings, and they are
 * exactly what a continuation page repeats ("SPATIAL RESOLUTION — CONTINUED").
 * The category NAME still comes from `technicalParameterMeta`, so this only
 * chooses the casing of a label that is already canonical.
 */
const categoryHeading = (paramId) => String(getCategoryForParam(paramId) || '').toUpperCase();

/**
 * The consolidated report's own structure, in print order.
 *
 * The three RP22 categories read their heading from `technicalParameterMeta`
 * (via the canonical parameter category), so the order below and the category
 * labels can never drift apart.
 */
export const PROJECT_REPORT_SECTIONS = Object.freeze([
  { id: PROJECT_REPORT_SECTION.COVER, ordinal: '01', label: 'Cover' },
  { id: PROJECT_REPORT_SECTION.DESIGN_STORY, ordinal: '02', label: 'Design Story' },
  // The specified system is stated third, immediately after the design story,
  // so the products are brought forward instead of trailing the document.
  { id: PROJECT_REPORT_SECTION.SYSTEM_PRODUCTS, ordinal: '03', label: 'Systems / Products Selected' },
  { id: PROJECT_REPORT_SECTION.DESIGN_OVERVIEW, ordinal: '04', label: 'Design Overview' },
  { id: PROJECT_REPORT_SECTION.VIEWING_EXPERIENCE, ordinal: '05', label: 'Viewing Experience' },
  { id: PROJECT_REPORT_SECTION.VIEWING_GEOMETRY, ordinal: '06', label: 'Viewing Geometry' },
  { id: PROJECT_REPORT_SECTION.PERFORMANCE_OVERVIEW, ordinal: '07', label: 'Performance Overview' },
  { id: PROJECT_REPORT_SECTION.SPATIAL_RESOLUTION, ordinal: '08', label: categoryHeading(1) },
  { id: PROJECT_REPORT_SECTION.DYNAMIC_RANGE, ordinal: '09', label: categoryHeading(12) },
  { id: PROJECT_REPORT_SECTION.TIMBRE_MATCHING, ordinal: '10', label: categoryHeading(17) },
  { id: PROJECT_REPORT_SECTION.PER_SEAT, ordinal: '11', label: 'Per-Seat Performance' },
  { id: PROJECT_REPORT_SECTION.ACOUSTIC_TREATMENT, ordinal: '12', label: 'Acoustic Treatment' },
  { id: PROJECT_REPORT_SECTION.ENGINEERING_DRAWINGS, ordinal: '13', label: 'Engineering Drawings' },
  { id: PROJECT_REPORT_SECTION.METHOD, ordinal: '14', label: 'Method / Assumptions' },
]);

const SECTION_ORDER = PROJECT_REPORT_SECTIONS.map((section) => section.id);
const SECTION_BY_ID = Object.freeze(
  Object.fromEntries(PROJECT_REPORT_SECTIONS.map((section) => [section.id, section])),
);

export function projectReportSection(sectionId) {
  return SECTION_BY_ID[sectionId] || null;
}

/** The heading one section prints, before any continuation suffix. */
export function projectReportSectionHeading(sectionId) {
  return SECTION_BY_ID[sectionId]?.label || null;
}

/**
 * The continuation suffix a section's later pages state — applied exactly once.
 *
 * Stated in capitals, matching the category headings it follows: a page of
 * "SPATIAL RESOLUTION" that continues says exactly "SPATIAL RESOLUTION —
 * CONTINUED". This is the only place the suffix text is decided, and this module
 * is the only place it is applied, so no page can state it twice.
 */
export const CONTINUATION_SUFFIX_LABEL = ' — CONTINUED';
const CONTINUATION_SUFFIX = /\s*—\s*Continued\s*$/i;

/* ── Parameters ─────────────────────────────────────────────────────────── */

/** Every RP22 parameter the Project Report must state, P1–P21. */
export const PROJECT_REPORT_PARAMETER_IDS = Object.freeze(
  Array.from({ length: 21 }, (_, index) => index + 1),
);

/**
 * The parameter index tables — one per RP22 category, in canonical order.
 * Each table states EVERY parameter of its category, so a parameter that has no
 * drawing page of its own is still explicitly assessed in the report.
 */
export const PARAMETER_INDEX_SECTIONS = Object.freeze([
  Object.freeze({
    id: 'spatial-resolution-index',
    section: PROJECT_REPORT_SECTION.SPATIAL_RESOLUTION,
    parameterIds: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  }),
  Object.freeze({
    id: 'dynamic-range-index',
    section: PROJECT_REPORT_SECTION.DYNAMIC_RANGE,
    parameterIds: Object.freeze([12, 13, 14, 15, 16]),
  }),
  Object.freeze({
    id: 'timbre-matching-index',
    section: PROJECT_REPORT_SECTION.TIMBRE_MATCHING,
    parameterIds: Object.freeze([17, 18, 19, 20, 21]),
  }),
]);

/**
 * One row per parameter, read through the report's own evidence reader. No
 * value or level is altered, and an unassessed parameter states "—" rather
 * than a manufactured grade.
 */
export function buildParameterIndexRows(engineeringSummary, parameterIds = PROJECT_REPORT_PARAMETER_IDS) {
  return parameterIds.map((id) => {
    const read = readReportParameter(engineeringSummary, id) || {};
    return {
      id,
      key: `P${id}`,
      category: getCategoryForParam(id),
      title: getHumanTitleForParam(id),
      level: read.level ?? '—',
      value: read.value ?? '—',
      scope: read.scope ?? null,
    };
  });
}

/**
 * The three parameter index pages as plain descriptors. The caller renders the
 * rows into a component; the descriptor itself stays serialisable, so the saved
 * report snapshot carries exactly what the report showed.
 */
export function buildParameterIndexPages(engineeringSummary) {
  return PARAMETER_INDEX_SECTIONS.map(({ id, section, parameterIds }) => ({
    id,
    section,
    parameterIds: [...parameterIds],
    category: getCategoryForParam(parameterIds[0]),
    rows: buildParameterIndexRows(engineeringSummary, parameterIds),
    printData: {
      type: 'parameter-index',
      parameterIds: [...parameterIds],
      category: getCategoryForParam(parameterIds[0]),
      rows: buildParameterIndexRows(engineeringSummary, parameterIds),
    },
  }));
}

/* ── Technical evidence per page ────────────────────────────────────────── */

/**
 * The technical evidence each page states — which of P1–P21 the page is the
 * detailed evidence for.
 *
 * The visual evidence and its technical evidence are stated on the SAME report
 * page: the page's printData carries these ids, and the print composition
 * renders the full parameter cards directly after the page's own visual
 * composition. A reader never has to hold a drawing in mind while hunting for
 * its card, and no parameter is left without one.
 *
 * Every parameter P1–P21 appears exactly once: P3, P8 and P11 carry no drawing
 * page of their own, so they are stated on the Spatial Resolution overview
 * beside the category's navigation table; P15 and P16 on the Dynamic Range
 * overview; P18 and P21 on the Timbre Matching overview; every other parameter
 * on its own detail page.
 */
export const PROJECT_REPORT_TECHNICAL_EVIDENCE = Object.freeze({
  'p2-system-architecture': Object.freeze([2]),
  'seating-position': Object.freeze([1]),
  'p5-spatial-resolution': Object.freeze([5]),
  'p7-front-wides': Object.freeze([7]),
  'p9-spatial-resolution': Object.freeze([9]),
  'best-listening-area': Object.freeze([4, 6, 10]),
  'spatial-resolution-index': Object.freeze([3, 8, 11]),
  'dynamic-range-index': Object.freeze([15, 16]),
  'front-soundstage-dynamic-range': Object.freeze([12]),
  'non-screen-dynamic-range': Object.freeze([13]),
  'bass-capability': Object.freeze([14]),
  'timbre-matching-index': Object.freeze([18, 21]),
  'timbre-consistency': Object.freeze([17]),
  'p19-rsp': Object.freeze([19]),
  'bass-response': Object.freeze([20]),
});

/** The parameters one page is the detailed evidence for. */
export function technicalEvidenceForPage(pageId) {
  const ids = PROJECT_REPORT_TECHNICAL_EVIDENCE[String(pageId || '')];
  return Array.isArray(ids) ? [...ids] : [];
}

/**
 * Which of P1–P21 the technical evidence states, and whether any parameter is
 * stated twice. Both are acceptance failures: a parameter with no card has lost
 * its technical evidence, and a parameter with two has been duplicated.
 */
export function projectReportTechnicalEvidenceCoverage() {
  const counts = new Map();
  for (const ids of Object.values(PROJECT_REPORT_TECHNICAL_EVIDENCE)) {
    for (const id of ids) counts.set(Number(id), (counts.get(Number(id)) || 0) + 1);
  }
  const missingIds = PROJECT_REPORT_PARAMETER_IDS.filter((id) => !counts.has(id));
  const duplicatedIds = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((a, b) => a - b);
  return {
    missingIds,
    duplicatedIds,
    complete: missingIds.length === 0 && duplicatedIds.length === 0,
    expectedCount: PROJECT_REPORT_PARAMETER_IDS.length,
    statedCount: counts.size,
  };
}

/* ── Page → section ─────────────────────────────────────────────────────── */

/**
 * Which section each page belongs to, and the parameters it is the detailed
 * page for. The section is the document structure; the category a heading
 * prints comes from `technicalParameterMeta` through `parameterIds`.
 */
const PAGE_STRUCTURE = Object.freeze({
  'project-report-cover': { section: PROJECT_REPORT_SECTION.COVER },
  // 02 — the design story: the project's own opening statement, the supported
  // strengths and the ADI summary.
  highlights: { section: PROJECT_REPORT_SECTION.DESIGN_STORY },
  'adi-design-summary': { section: PROJECT_REPORT_SECTION.DESIGN_STORY },
  // 03 — the specified system, stated as a specification page.
  'products-selected': { section: PROJECT_REPORT_SECTION.SYSTEM_PRODUCTS },
  // 04–05 — the design overview drawings (plan + front elevation, then the two
  // side elevations). Registered here so the drawing pages compose under their
  // own section when they are added; no heading is ever invented for them.
  'design-overview-plan-front': { section: PROJECT_REPORT_SECTION.DESIGN_OVERVIEW },
  'design-overview-elevations': { section: PROJECT_REPORT_SECTION.DESIGN_OVERVIEW },
  // 06 — RP23 viewing experience.
  'screen-seating': { section: PROJECT_REPORT_SECTION.VIEWING_EXPERIENCE },
  // 07 — sightlines and viewing geometry.
  sightlines: { section: PROJECT_REPORT_SECTION.VIEWING_GEOMETRY },
  'viewing-geometry': { section: PROJECT_REPORT_SECTION.VIEWING_GEOMETRY },
  // 08 — the performance overview and its scorecard.
  'performance-overview': { section: PROJECT_REPORT_SECTION.PERFORMANCE_OVERVIEW },
  // 09–14 — SPATIAL RESOLUTION (P1–P11): P2 architecture, P1 listener distance,
  // P5 spacing, P7 wides, P9 overheads, P4/P6/P10 across the seats.
  'p2-system-architecture': { section: PROJECT_REPORT_SECTION.SPATIAL_RESOLUTION, parameterIds: [2] },
  'seating-position': { section: PROJECT_REPORT_SECTION.SPATIAL_RESOLUTION, parameterIds: [1] },
  p5: { section: PROJECT_REPORT_SECTION.SPATIAL_RESOLUTION, parameterIds: [5] },
  'p7-front-wides': { section: PROJECT_REPORT_SECTION.SPATIAL_RESOLUTION, parameterIds: [7] },
  p9: { section: PROJECT_REPORT_SECTION.SPATIAL_RESOLUTION, parameterIds: [9] },
  'best-listening-area': { section: PROJECT_REPORT_SECTION.SPATIAL_RESOLUTION, parameterIds: [4, 6, 10] },
  // 15–17 — DYNAMIC RANGE (P12–P16): P12 screen, P13 non-screen, P14 output,
  // P15 assumed noise floor, P16 seat evidence. P16 stays in Dynamic Range.
  'front-soundstage-dynamic-range': { section: PROJECT_REPORT_SECTION.DYNAMIC_RANGE, parameterIds: [12] },
  'non-screen-dynamic-range': { section: PROJECT_REPORT_SECTION.DYNAMIC_RANGE, parameterIds: [13] },
  'bass-capability': { section: PROJECT_REPORT_SECTION.DYNAMIC_RANGE, parameterIds: [14] },
  // 18–22 — TIMBRE MATCHING (P17–P21): P17 consistency, P18 extension, P19
  // response at the RSP, P20 seat-to-seat consistency, P21 early reflections.
  //
  // The detailed bass evidence — the P19 RSP response and the primary-seat
  // response curves — prints inside this section as supporting evidence for
  // P19/P20. It is not a fourth RP22 category, so it never states a heading or
  // an ordinal of its own.
  'timbre-consistency': { section: PROJECT_REPORT_SECTION.TIMBRE_MATCHING, parameterIds: [17] },
  'p16-p17-comparison': { section: PROJECT_REPORT_SECTION.TIMBRE_MATCHING, parameterIds: [16, 17] },
  'p19-rsp': { section: PROJECT_REPORT_SECTION.TIMBRE_MATCHING, parameterIds: [19] },
  'primary-seat-bass-curves': { section: PROJECT_REPORT_SECTION.TIMBRE_MATCHING, parameterIds: [19, 20] },
  'bass-response': { section: PROJECT_REPORT_SECTION.TIMBRE_MATCHING, parameterIds: [20] },
  // 23–28 — per-seat results, treatment, the engineering drawings and the
  // closing method page.
  'per-seat-performance': { section: PROJECT_REPORT_SECTION.PER_SEAT },
  'acoustic-treatment': { section: PROJECT_REPORT_SECTION.ACOUSTIC_TREATMENT },
  'dimensioned-speaker-plan': { section: PROJECT_REPORT_SECTION.ENGINEERING_DRAWINGS },
  'installation-schedule': { section: PROJECT_REPORT_SECTION.ENGINEERING_DRAWINGS },
  'screen-wall-detail': { section: PROJECT_REPORT_SECTION.ENGINEERING_DRAWINGS },
  'method-assumptions': { section: PROJECT_REPORT_SECTION.METHOD },
  'about-sound-proof': { section: PROJECT_REPORT_SECTION.METHOD },
});

/** A page's own structure entry, or null when its type is not registered. */
export function pageStructure(type) {
  return PAGE_STRUCTURE[String(type || '')] || null;
}

/** The parameters a page is the detailed page for (index tables declare their own). */
export function pageParameterIds(page) {
  if (Array.isArray(page?.parameterIds) && page.parameterIds.length > 0) return page.parameterIds;
  const structure = pageStructure(page?.printData?.type);
  return structure?.parameterIds ? [...structure.parameterIds] : [];
}

/**
 * The section a page belongs to. An index table states its own section (it is
 * the category's opening statement), every other page reads the structure map.
 */
export function sectionForPage(page) {
  if (page?.section) return page.section;
  const structure = pageStructure(page?.printData?.type);
  return structure?.section || null;
}

/**
 * The heading a page prints.
 *
 * A parameter-driven page prints its canonical category (from
 * `technicalParameterMeta`, through its parameters — never a local string); the
 * other sections print their own section label. Every page after the first of a
 * section states that it continues: heading and first content block stay
 * together, so a continuation heading is never orphaned at the foot of a page.
 *
 * THE ONLY PLACE THE CONTINUATION SUFFIX IS APPLIED. Nothing downstream appends
 * it again (the report stylesheet used to, which is what produced a doubled
 * "— CONTINUED — CONTINUED"), and a base heading that already carries the suffix
 * is never given a second one.
 */
export function headingForPage(page, { continued = false } = {}) {
  const section = sectionForPage(page);
  if (!section) return null;
  const base = projectReportSectionHeading(section);
  if (!base || section === PROJECT_REPORT_SECTION.COVER) return null;
  if (!continued || CONTINUATION_SUFFIX.test(base)) return base;
  return `${base}${CONTINUATION_SUFFIX_LABEL}`;
}

/* ── Ordering ───────────────────────────────────────────────────────────── */

function sectionRank(sectionId) {
  const index = SECTION_ORDER.indexOf(sectionId);
  return index === -1 ? SECTION_ORDER.length : index;
}

/**
 * The Project Report's own page order.
 *
 * Sections print in the document's canonical order; within a section the
 * incoming order is preserved, so the caller keeps control of which parameter
 * page follows which. Pages whose type is unregistered keep their relative
 * position at the end of the report rather than being dropped.
 */
export function orderProjectReportPages(pages = []) {
  const list = Array.isArray(pages) ? pages.filter(Boolean) : [];
  const indexed = list.map((page, index) => ({ page, index }));
  indexed.sort((a, b) => {
    const rank = sectionRank(sectionForPage(a.page)) - sectionRank(sectionForPage(b.page));
    return rank !== 0 ? rank : a.index - b.index;
  });

  const seenSections = new Set();
  return indexed.map(({ page }) => {
    const section = sectionForPage(page);
    const firstOfSection = !seenSections.has(section);
    seenSections.add(section);
    const sectionHeading = headingForPage(page, { continued: !firstOfSection });
    return {
      ...page,
      section,
      sectionOrdinal: SECTION_BY_ID[section]?.ordinal || null,
      sectionFirst: firstOfSection,
      sectionHeading,
      printData: {
        ...(page.printData || {}),
        section,
        sectionHeading,
        sectionFirst: firstOfSection,
        sectionContinued: !firstOfSection,
      },
    };
  });
}

/**
 * Which of P1–P21 this page list states.
 *
 * `declared` is every parameter an index table or a detail page covers;
 * `missing` is the acceptance failure the report must never ship with.
 */
export function projectReportParameterCoverage(pages = []) {
  const declared = new Set();
  for (const page of (Array.isArray(pages) ? pages : [])) {
    const ids = Array.isArray(page?.printData?.parameterIds)
      ? page.printData.parameterIds
      : pageParameterIds(page);
    for (const id of ids) declared.add(Number(id));
  }
  const declaredIds = [...declared].filter((id) => Number.isFinite(id)).sort((a, b) => a - b);
  const missingIds = PROJECT_REPORT_PARAMETER_IDS.filter((id) => !declared.has(id));
  return {
    declaredIds,
    missingIds,
    complete: missingIds.length === 0,
    expectedCount: PROJECT_REPORT_PARAMETER_IDS.length,
    declaredCount: declaredIds.length,
  };
}

/** One line per parameter, in report order, for diagnostics and tests. */
export function projectReportCategoryTable() {
  return PROJECT_REPORT_PARAMETER_IDS.map((id) => ({
    id,
    key: `P${id}`,
    category: getCategoryForParam(id),
    title: getHumanTitleForParam(id),
    section: id <= 11
      ? PROJECT_REPORT_SECTION.SPATIAL_RESOLUTION
      : id <= 16
        ? PROJECT_REPORT_SECTION.DYNAMIC_RANGE
        : PROJECT_REPORT_SECTION.TIMBRE_MATCHING,
  }));
}