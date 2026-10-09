/**
 * project-report-registry.test.mjs
 * --------------------------------
 * The consolidated Project Report's composition authority, against the approved
 * page registry.
 *
 * What is asserted here is the DOCUMENT'S STRUCTURE and its preservation rule —
 * never a design value:
 *
 *   - the sections, in the audited print order, with the specified system
 *     brought forward to the third page;
 *   - the three RP22 category headings, taken from the one canonical category
 *     source and stated in capitals;
 *   - the continuation heading, stated exactly once and never doubled;
 *   - no fourth RP22 category — the detailed bass evidence prints under Timbre
 *     Matching;
 *   - every parameter P1–P21 keeping exactly one full technical card.
 */

import { describe, it, expect } from 'vitest';

import {
  CONTINUATION_SUFFIX_LABEL,
  PROJECT_REPORT_SECTION,
  PROJECT_REPORT_SECTIONS,
  headingForPage,
  orderProjectReportPages,
  projectReportCategoryTable,
  projectReportSectionHeading,
  projectReportTechnicalEvidenceCoverage,
  sectionForPage,
  technicalEvidenceForPage,
} from '@/components/report/projectReport/projectReportRegistry';
import { getCategoryForParam } from '@/components/report/technical/technicalParameterMeta';

const S = PROJECT_REPORT_SECTION;
const page = (type, id = type) => ({ id, printData: { type } });

describe('project report registry', () => {
  it('states the audited sections, in the audited order', () => {
    expect(PROJECT_REPORT_SECTIONS.map((section) => section.id)).toEqual([
      S.COVER,
      S.DESIGN_STORY,
      S.SYSTEM_PRODUCTS,
      S.DESIGN_OVERVIEW,
      S.VIEWING_EXPERIENCE,
      S.VIEWING_GEOMETRY,
      S.PERFORMANCE_OVERVIEW,
      S.SPATIAL_RESOLUTION,
      S.DYNAMIC_RANGE,
      S.TIMBRE_MATCHING,
      S.PER_SEAT,
      S.ACOUSTIC_TREATMENT,
      S.ENGINEERING_DRAWINGS,
      S.METHOD,
    ]);
    expect(PROJECT_REPORT_SECTIONS.map((section) => section.ordinal)).toEqual([
      '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14',
    ]);
  });

  it('brings the specified system forward to the third section', () => {
    expect(PROJECT_REPORT_SECTIONS[2].id).toBe(S.SYSTEM_PRODUCTS);
    // And the document prints in that order, whatever order the pages were
    // assembled in.
    const ordered = orderProjectReportPages([
      page('products-selected'),
      page('project-report-cover'),
      page('highlights'),
      page('p5', 'p5-spatial-resolution'),
    ]);
    expect(ordered.map((entry) => entry.id)).toEqual([
      'project-report-cover',
      'highlights',
      'products-selected',
      'p5-spatial-resolution',
    ]);
  });

  it('states the three category headings from the one canonical source, in capitals', () => {
    expect(projectReportSectionHeading(S.SPATIAL_RESOLUTION)).toBe(getCategoryForParam(1).toUpperCase());
    expect(projectReportSectionHeading(S.DYNAMIC_RANGE)).toBe(getCategoryForParam(12).toUpperCase());
    expect(projectReportSectionHeading(S.TIMBRE_MATCHING)).toBe(getCategoryForParam(17).toUpperCase());
    expect(projectReportSectionHeading(S.SPATIAL_RESOLUTION)).toBe('SPATIAL RESOLUTION');
    expect(projectReportSectionHeading(S.DYNAMIC_RANGE)).toBe('DYNAMIC RANGE');
    expect(projectReportSectionHeading(S.TIMBRE_MATCHING)).toBe('TIMBRE MATCHING');
    expect(headingForPage(page('project-report-cover'), { continued: false })).toBe(null);
  });

  it('states a continuation heading once, and never doubled', () => {
    const spatial = page('p5', 'p5-spatial-resolution');
    expect(headingForPage(spatial, { continued: false })).toBe('SPATIAL RESOLUTION');
    expect(headingForPage(spatial, { continued: true })).toBe(`SPATIAL RESOLUTION${CONTINUATION_SUFFIX_LABEL}`);
    expect(headingForPage(spatial, { continued: true })).toBe('SPATIAL RESOLUTION — CONTINUED');
    expect(headingForPage(spatial, { continued: true }).includes('CONTINUED — CONTINUED')).toBe(false);

    const ordered = orderProjectReportPages([
      page('seating-position'),
      page('p5', 'p5-spatial-resolution'),
      page('p9', 'p9-spatial-resolution'),
    ]);
    expect(ordered.map((entry) => entry.printData.sectionHeading)).toEqual([
      'SPATIAL RESOLUTION',
      'SPATIAL RESOLUTION — CONTINUED',
      'SPATIAL RESOLUTION — CONTINUED',
    ]);
    expect(ordered.map((entry) => entry.printData.sectionFirst)).toEqual([true, false, false]);
  });

  it('has no fourth RP22 category: the bass evidence prints under Timbre Matching', () => {
    expect(sectionForPage(page('p19-rsp'))).toBe(S.TIMBRE_MATCHING);
    expect(sectionForPage(page('primary-seat-bass-curves'))).toBe(S.TIMBRE_MATCHING);
    expect(sectionForPage(page('bass-response'))).toBe(S.TIMBRE_MATCHING);
    expect(PROJECT_REPORT_SECTIONS.some((section) => /bass evidence/i.test(section.label))).toBe(false);
    expect(PROJECT_REPORT_SECTION.BASS_EVIDENCE).toBe(undefined);
  });

  it('keeps exactly one full technical card for every parameter P1–P21', () => {
    const coverage = projectReportTechnicalEvidenceCoverage();
    expect(coverage.missingIds).toEqual([]);
    expect(coverage.duplicatedIds).toEqual([]);
    expect(coverage.statedCount).toBe(21);
    expect(coverage.complete).toBe(true);

    // The parameters with no drawing page of their own are stated on their
    // category's overview; P19 and P20 on their own detail pages.
    expect(technicalEvidenceForPage('spatial-resolution-index')).toEqual([3, 8, 11]);
    expect(technicalEvidenceForPage('dynamic-range-index')).toEqual([15, 16]);
    expect(technicalEvidenceForPage('timbre-matching-index')).toEqual([18, 21]);
    expect(technicalEvidenceForPage('p19-rsp')).toEqual([19]);
    expect(technicalEvidenceForPage('bass-response')).toEqual([20]);
    expect(technicalEvidenceForPage('best-listening-area')).toEqual([4, 6, 10]);
    expect(technicalEvidenceForPage('not-a-registered-page')).toEqual([]);
  });

  it('maps P1–P11 / P12–P16 / P17–P21 from the one category source', () => {
    const table = projectReportCategoryTable();
    expect(table.length).toBe(21);
    for (const row of table) {
      const expected = row.id <= 11
        ? S.SPATIAL_RESOLUTION
        : row.id <= 16
          ? S.DYNAMIC_RANGE
          : S.TIMBRE_MATCHING;
      expect(row.section).toBe(expected);
      expect(row.category).toBe(getCategoryForParam(row.id));
    }
  });
});