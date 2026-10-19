/**
 * proposal-core-section-page-authority.test.mjs
 * --------------------------------------------
 * ACCEPTANCE — the three core sound sections own their pages, a FULL WIDTH
 * photograph is composed at the full content width, a Detail image belongs only
 * where it was recorded to belong, and the Highlights table identifies every
 * result it states.
 *
 * The composition the document composes:
 *
 *   Spatial Resolution, Dynamic Range and Timbre Matching each OPEN a page, with
 *   the hierarchy  heading → complete text → the image below it. None of them
 *   shares the top of a page with the design overview, and none flows into the
 *   next core section.
 *
 *   A FULL WIDTH photograph keeps the full printable content width and its own
 *   proportions. It is never reduced to fit the room left beside the copy.
 *
 *   A Detail photograph sits only with the section its own recorded purpose names.
 *   It is never dropped into a core structure because that page has room.
 *
 *   The Highlights table states the parameter each result came from, beside the
 *   result, one entry per line — and no P-code ever enters the document's prose.
 *
 * Read against the REAL Barton document (test/fixtures/bartonCompositionFixture),
 * the document the packed-page defect was reported on, rendered through the pack
 * itself. The assertions are about the composed markup and the authorities that
 * decide it; a rendered PNG/PDF is what a visual PASS requires.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';

import {
  CORE_SECTION_TYPES,
  composeNarrativeBands,
  isCoreSection,
  isFlowSection,
} from '@/components/proposal/print/narrativeFlowComposition';
import {
  composeSectionSlots,
  planProposalImages,
  resolveCoverAssetId,
} from '@/components/proposal/images/proposalImagePlanner';
import { EDITORIAL_ROLE } from '@/components/proposal/images/proposalImagePlacementAuthority';
import { buildClientSummaryRows } from '@/components/proposal/keyPerformanceHighlightsAuthority';
import ProposalPackDocument from '@/components/proposal/print/ProposalPackDocument';
import ProjectImagesPage from '@/components/proposal/print/ProjectImagesPage';
import {
  BARTON_IMAGES,
  BARTON_SNAPSHOT,
  bartonPackProps,
  bartonSections,
} from '../../test/fixtures/bartonCompositionFixture.mjs';

const PACK = renderToStaticMarkup(React.createElement(ProposalPackDocument, bartonPackProps()));

/** One composed page frame, read from the pack's own markup. */
const frames = () => PACK.split('<section class="proposal-print-section pp-page').slice(1)
  .map((chunk) => `<section class="proposal-print-section pp-page${chunk}`);
const frameFor = (type) => frames().find((frame) => frame.includes(`pp-page--${type}`)) || '';

const DOCUMENT_TYPES = bartonSections().map((section) => section.section_type);

/** The plan the pack composes the Barton selection with. */
const bartonPlan = () => {
  const sections = bartonSections();
  return planProposalImages({
    assets: BARTON_IMAGES,
    sectionSlots: composeSectionSlots({ sections, sectionTypes: DOCUMENT_TYPES }),
    coverAssetId: resolveCoverAssetId({ assets: BARTON_IMAGES, coverImageUrl: BARTON_IMAGES[0].file_url }),
  });
};

/* ── 1. Each core sound section opens its own page ─────────────────────────── */

describe('the three core sound sections each own their page', () => {
  it('opens a sheet of its own in the composition authority', () => {
    expect([...CORE_SECTION_TYPES]).toEqual(['spatial_resolution', 'dynamic_range', 'timbre_matching']);
    CORE_SECTION_TYPES.forEach((type) => {
      expect(isCoreSection(type)).toBe(true);
      // NOT a flow section: a flow section continues on the sheet the section
      // before it opened, so a core sound section can never be composed under
      // another section's copy. A non-flow section always opens its own frame,
      // and therefore its own page.
      expect(isFlowSection(type)).toBe(false);
    });
    // No band holds a core sound section, so none of them can share a sheet.
    composeNarrativeBands(DOCUMENT_TYPES).forEach((band) => {
      band.types.forEach((type) => expect(CORE_SECTION_TYPES.includes(type)).toBe(false));
    });
    // The design overview still flows, and it is the section the core sections
    // would have been squeezed under.
    expect(isFlowSection('system_design_summary')).toBe(true);
  });

  it('composes each one in its own page frame, never under the design overview', () => {
    const summary = frameFor('system_design_summary');
    expect(summary.length).toBeGreaterThan(0);
    // The overview's own blocks are on its own pages — and no core sound section
    // is composed there.
    expect(summary).toContain('Design Summary');
    CORE_SECTION_TYPES.forEach((type) => {
      const frame = frameFor(type);
      expect(frame.length).toBeGreaterThan(0);
      expect(summary.includes(type)).toBe(false);
      expect(frame).toContain(`data-editorial-section="${type}"`);
      // Its own page carries its own heading and none of the overview's copy.
      expect(frame).not.toContain('Why This Specification');
      expect(frame).not.toContain('Design Overview');
      expect(frame).not.toContain('Design Summary');
    });
  });

  it('gives every core page the hierarchy heading → text → assigned image', () => {
    CORE_SECTION_TYPES.forEach((type) => {
      const frame = frameFor(type);
      const heading = frame.indexOf('pp-header__title');
      const copy = frame.indexOf('data-editorial-block="copy"');
      const image = frame.indexOf('<figure class="pp-media');
      expect(heading).toBeGreaterThan(-1);
      // The text follows the heading and the photograph follows the text.
      expect(copy).toBeGreaterThan(heading);
      expect(image).toBeGreaterThan(copy);
      expect(frame).toContain('data-presentation="full_width"');
    });
  });
});

/* ── 2. FULL WIDTH is the full printable content width ─────────────────────── */

describe('a FULL WIDTH photograph is composed at the full content width', () => {
  it('keeps the source proportions: width 100%, height auto, no fixed height', () => {
    const frame = frameFor('spatial_resolution');
    const imageStart = frame.indexOf('<img');
    const imageTag = frame.slice(imageStart, frame.indexOf('>', imageStart) + 1);
    expect(imageTag.length).toBeGreaterThan(0);
    expect(imageTag).toContain('width:100%');
    expect(imageTag).toContain('height:auto');
    expect(imageTag).toContain('object-fit:contain');
    // No fixed height the composition could have written onto it, and no crop.
    expect(imageTag).not.toMatch(/height:\s*\d+(\.\d+)?mm/);
    expect(imageTag).not.toContain('object-fit:cover');
  });

  it('gives the core pages their own landscapes rather than sharing one between them', () => {
    const plan = bartonPlan();
    const landscapes = plan.placements.filter(
      (placement) => placement.editorial_role === EDITORIAL_ROLE.LANDSCAPE_FEATURE,
    );
    CORE_SECTION_TYPES.forEach((type) => {
      const section = bartonSections().find((entry) => entry.section_type === type);
      const here = landscapes.filter((placement) => placement.section_id === section.id);
      expect(here.length).toBe(1);
      expect(here[0].image_presentation).toBe('full_width');
    });
    // Four landscapes — the design overview and the three core sound sections —
    // and the closing photograph that closes the design.
    expect(landscapes.length).toBe(4);
    expect(plan.placements.filter(
      (placement) => placement.editorial_role === EDITORIAL_ROLE.CLOSING_FEATURE,
    ).length).toBe(1);
  });
});

/* ── 3. A Detail image belongs only to its recorded target ─────────────────── */

describe('a Detail image sits only with the section it was recorded for', () => {
  it('keeps the Product detail photograph out of the core sound sections', () => {
    const plan = bartonPlan();
    const detail = plan.placements.filter(
      (placement) => placement.source_asset_id === 'barton-image-q6-3',
    );
    expect(detail.length).toBe(1);
    // Never a core structure: the page it lands on is the section its own
    // recorded purpose names (Product detail → the products / summary account).
    const coreSectionIds = bartonSections()
      .filter((section) => CORE_SECTION_TYPES.includes(section.section_type))
      .map((section) => section.id);
    expect(coreSectionIds.includes(detail[0].section_id)).toBe(false);
    expect(detail[0].image_presentation).toBe('detail');
    expect(detail[0].image_purpose).toBe('product_detail');

    const summary = bartonSections().find((section) => section.section_type === 'system_design_summary');
    expect(detail[0].section_id).toBe(summary.id);
    // And the plan is still a valid document: nothing is dropped.
    const sources = new Set(plan.placements.map((placement) => placement.source_asset_id));
    expect(sources.size).toBe(BARTON_IMAGES.length);
    expect(plan.galleryImages.length).toBe(0);
  });

  it('sends a Detail image to a core structure when that is what it records', () => {
    const timbre = bartonSections().find((section) => section.section_type === 'timbre_matching');
    const assets = [
      ...BARTON_IMAGES.filter((asset) => asset.slot !== 'image_5'),
      {
        ...BARTON_IMAGES.find((asset) => asset.slot === 'image_5'),
        // The same photograph, recorded as an interior detail: its purpose names
        // Timbre Matching, so that is where it belongs.
        image_purpose: 'interior_detail',
      },
    ];
    const sections = bartonSections();
    const plan = planProposalImages({
      assets,
      sectionSlots: composeSectionSlots({ sections, sectionTypes: DOCUMENT_TYPES }),
      coverAssetId: resolveCoverAssetId({ assets, coverImageUrl: assets[0].file_url }),
    });
    const detail = plan.placements.find((placement) => placement.source_asset_id === 'barton-image-q6-3');
    expect(detail.section_id).toBe(timbre.id);
    expect(detail.editorial_role).toBe(EDITORIAL_ROLE.PORTRAIT_EDITORIAL);
  });
});

/* ── 4. The Highlights table identifies every result ──────────────────────── */

describe('the Highlights table states the parameter each result belongs to', () => {
  const rows = buildClientSummaryRows(BARTON_SNAPSHOT);
  const resultOf = (key) => rows.find((row) => row.key === key)?.result;

  it('states P2, P12/P13/P14, P16/P17 and P18/P19/P20, one result per line', () => {
    expect(resultOf('client_system_spatial')).toBe('9.3.6\nP2 L4 \u00b7 15 speakers');
    expect(resultOf('client_dynamic'))
      .toBe('P12 L4 \u00b7 110 dBC\nP13 L3 \u00b7 102 dBC (FW)\nP14 L3 \u00b7 115 dBC');
    expect(resultOf('client_timbre')).toBe('P16 L4 \u00b7 \u00b10.5 dB\nP17 L4 \u00b7 \u22641.5 dB window');
    expect(resultOf('client_bass')).toBe('P18 L2 \u00b7 22 Hz\nP19 L4 \u00b7 \u00b10 dB\nP20 L1 \u00b7 \u00b19 dB');
  });

  it('prints them in the Highlights page of the document', () => {
    const page = frameFor('highlights');
    expect(page.length).toBeGreaterThan(0);
    [
      'P2 L4 \u00b7 15 speakers',
      'P12 L4 \u00b7 110 dBC',
      'P13 L3 \u00b7 102 dBC (FW)',
      'P14 L3 \u00b7 115 dBC',
      'P16 L4 \u00b7 \u00b10.5 dB',
      'P17 L4 \u00b7 \u22641.5 dB window',
      'P18 L2 \u00b7 22 Hz',
      'P19 L4 \u00b7 \u00b10 dB',
      'P20 L1 \u00b7 \u00b19 dB',
    ].forEach((line) => expect(page).toContain(line));
    // The stacked lines are rendered as lines, not collapsed into one run.
    expect(page).toContain('whitespace-pre-line');
  });

  it('adds no P-code to the document\'s prose', () => {
    ['system_design_summary', 'spatial_resolution', 'dynamic_range', 'timbre_matching', 'overall_design']
      .forEach((type) => expect(frameFor(type)).not.toMatch(/\bP\d+\b/));
  });
});

/* ── 5. An image-only continuation page needs no heading ──────────────────── */

describe('an image-only continuation page is composed without a heading', () => {
  it('renders the photographs alone, with no heading, when none was asked for', () => {
    const page = renderToStaticMarkup(React.createElement(ProjectImagesPage, {
      number: '11',
      title: '',
      images: [
        { id: 'g1', file_url: 'https://example.test/g1.jpg', caption: '' },
        { id: 'g2', file_url: 'https://example.test/g2.jpg', caption: '' },
      ],
      preserveNatural: true,
    }));
    expect(page).toContain('pp-page--images');
    expect(page).toContain('https://example.test/g1.jpg');
    expect(page).toContain('https://example.test/g2.jpg');
    // No editorial heading is invented for it: no header, and no portfolio label.
    expect(page).not.toContain('pp-header');
    expect(page).not.toContain('Project Images');
    expect(page).not.toContain('Gallery');
    expect(page).not.toContain('Additional Images');
  });

  it('composes the photographs the narrative could not hold on that page, and no other', () => {
    // The pack hands the remainder to the image pages with NO title, so the
    // continuation carries imagery alone.
    const pack = readFileSync(
      new URL('../components/proposal/print/ProposalPackDocument.jsx', import.meta.url),
      'utf8',
    );
    expect(pack).toMatch(/pushUnplacedImages\(''/);
    expect(pack).not.toMatch(/pushUnplacedImages\('(Project Images|Gallery|Additional Images)'/);
  });
});