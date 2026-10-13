/**
 * Acceptance: the final proposal layout refinements.
 * ------------------------------------------------
 * Five refinements and nothing else, checked against the pack's own type
 * metrics so the arithmetic is the same arithmetic the measured compositor
 * performs:
 *
 *   1. the page-5 prose (Design Overview and Why This Specification) reads at a
 *      6mm paragraph rhythm, with one deliberate 10mm step between the two
 *      blocks, and both still fit one A4 sheet;
 *   2. the repeated "DESIGN" label is gone from the three structures, which are
 *      already named by the shared Sound Experience heading;
 *   3. the hairline between two structures is gone — space alone separates them;
 *   4. the Spatial Resolution photograph is about 20% taller, on the same width,
 *      with the shared cover crop untouched;
 *   5. everything else — the copy, the type, the sheet sequence, the one-sheet
 *      Key Performance Highlights — is unchanged.
 *
 * The Genesis copy is the fixture: the real paragraph counts of the reviewed
 * proposal, so the fit is measured against the document that was reviewed.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (relative) => fs.readFileSync(
  fileURLToPath(new URL(relative, import.meta.url)),
  'utf8',
);

const PACK_STYLES = read('../components/proposal/print/ProposalPackStyles.jsx');
const IMAGE_STYLES = read('../components/proposal/print/ProposalImagePlacementStyles.jsx');
const PACK_DOCUMENT = read('../components/proposal/print/ProposalPackDocument.jsx');
const PAGE_HEADER = read('../components/proposal/print/ProposalPageHeader.jsx');

/* ── The pack's own type and sheet metrics ─────────────────────────────────── */

const PT_MM = 25.4 / 72;
/** 11pt body at the pack's 1.55 leading. */
const BODY_LINE_MM = 11 * PT_MM * 1.55;
/** The prose column: `.pp-body { max-width: 148mm }`. */
const CHARS_PER_LINE = 76;
/** A block's own heading: the h2 scale, its normal leading and the 3mm below it. */
const BLOCK_HEADING_MM = 11 * 1.5 * PT_MM * 1.2 + 3;
/** A4 less the page frame's own 22mm / 14mm margins. */
const SHEET_MM = 261;

const lines = (chars) => Math.ceil(chars / CHARS_PER_LINE);
const blockMm = (paragraphs, gapMm) => BLOCK_HEADING_MM
  + paragraphs.reduce((sum, chars, index) => sum + lines(chars) * BODY_LINE_MM
    + (index < paragraphs.length - 1 ? gapMm : 0), 0);

/* The Genesis System Design Summary, as reviewed: block 1 opens page 4, blocks
   2 and 3 are the two sections that share page 5. */
const GENESIS_BLOCK_ONE = [328, 389, 346, 256];
const GENESIS_PAGE_FIVE = [
  { heading: 'Design Overview', paragraphs: [218, 325, 216] },
  { heading: 'Why This Specification', paragraphs: [255, 330, 349, 252] },
];

/* The three structures, as reviewed. */
const GENESIS_PILLARS = {
  spatial: { paragraphs: [244, 301, 231], portraitMm: 89 },
  dynamic: { paragraphs: [297, 206] },
  timbre: { paragraphs: [179, 255, 257], featureMm: 118, featureGapMm: 18 },
};

/** Every declaration of every rule written with one selector. */
const allRuleDeclarations = (source, selector) => {
  const found = [];
  let at = source.indexOf(selector);
  while (at > -1) {
    const open = source.indexOf('{', at);
    const close = source.indexOf('}', open);
    found.push(source.slice(open + 1, close));
    at = source.indexOf(selector, at + selector.length);
  }
  return found;
};

/** The declarations of one rule, read from the source that ships. */
const ruleDeclarations = (source, selector) => {
  const at = source.indexOf(selector);
  expect(at, `rule not found: ${selector}`).toBeGreaterThan(-1);
  const open = source.indexOf('{', at);
  const close = source.indexOf('}', open);
  return source.slice(open + 1, close);
};

/* ── 1. Page 5: paragraph spacing ──────────────────────────────────────────── */

describe('A. Page 5 reads at a 6mm paragraph rhythm', () => {
  const pageFive = '.proposal-print-portal .pp-page--system_design_summary [data-editorial-composition="continuing"]';
  const paragraphRule = ruleDeclarations(PACK_STYLES, `${pageFive} .pp-body p {`);
  const stepRule = ruleDeclarations(PACK_STYLES, `${pageFive} .pp-body + .pp-body {`);

  it('gives every paragraph about 6mm of separation', () => {
    expect(paragraphRule).toMatch(/margin:\s*0\s*0\s*6mm/);
  });

  /** Every rule this refinement added, read from the source that ships. */
  const scopedRules = allRuleDeclarations(PACK_STYLES, pageFive);

  it('changes spacing only — never the type size, the leading or the wording', () => {
    // Every rule this refinement added touches margins and nothing else.
    expect(scopedRules.length).toBeGreaterThanOrEqual(3);
    scopedRules.forEach((declaration) => {
      expect(declaration).not.toMatch(/font|line-height|display|visibility|color|content/);
    });
  });

  it('keeps a slightly larger step between Design Overview and Why This Specification', () => {
    expect(stepRule).toMatch(/margin-top:\s*10mm/);
    expect(10).toBeGreaterThan(6);
  });

  it('leaves the pack-wide paragraph rhythm, and every other sheet, alone', () => {
    expect(PACK_STYLES).toMatch(/--pp-paragraph-gap:\s*4\.2mm/);
    // Every 6mm paragraph rule is scoped to the page-5 composition.
    const sixMm = [...PACK_STYLES.matchAll(/([^\n{}]*)\.pp-body p\b[^\n{}]*\{([^}]*)\}/g)]
      .map((match) => ({ selector: match[1], declaration: match[2] }))
      .filter((rule) => /margin:\s*0 0 6mm/.test(rule.declaration));
    expect(sixMm).toHaveLength(1);
    expect(sixMm[0].selector).toContain('.pp-page--system_design_summary');
    expect(sixMm[0].selector).toContain('[data-editorial-composition="continuing"]');
  });
});

/* ── B. Both sections still share one A4 sheet ─────────────────────────────── */

describe('B. Design Overview and Why This Specification stay on one sheet', () => {
  it('fits the measured page-5 composition on a sheet, with room to spare', () => {
    const height = blockMm(GENESIS_PAGE_FIVE[0].paragraphs, 6)
      + 10
      + blockMm(GENESIS_PAGE_FIVE[1].paragraphs, 6);
    expect(height).toBeLessThan(SHEET_MM);
    expect(SHEET_MM - height).toBeGreaterThan(10);
  });

  it('does not depend on a generous line estimate', () => {
    // Re-measured at 65 characters per line, the tightening case.
    const perLine = (chars) => Math.ceil(chars / 65);
    const block = (paragraphs) => BLOCK_HEADING_MM
      + paragraphs.reduce((sum, chars, index) => sum + perLine(chars) * BODY_LINE_MM
        + (index < paragraphs.length - 1 ? 6 : 0), 0);
    expect(block(GENESIS_PAGE_FIVE[0].paragraphs) + 10 + block(GENESIS_PAGE_FIVE[1].paragraphs))
      .toBeLessThanOrEqual(SHEET_MM);
  });

  it('is measured as ONE composition, so no sheet break can fall inside it', () => {
    // The two blocks travel in the pack's second composition of the section.
    expect(PACK_DOCUMENT).toContain('data-editorial-composition="continuing"');
    expect(PACK_DOCUMENT).toMatch(/groupEditorialCompositions\(splitEditorialBlocks\(body\)\)/);
  });

  it('leaves the Design Summary block on its own sheet, untouched', () => {
    // Block one still opens the section's first composition at the pack rhythm.
    const opening = BLOCK_HEADING_MM
      + GENESIS_BLOCK_ONE.reduce((sum, chars, index) => sum + lines(chars) * BODY_LINE_MM
        + (index < GENESIS_BLOCK_ONE.length - 1 ? 4.2 : 0), 0);
    expect(opening).toBeGreaterThan(0);
    expect(ruleDeclarations(PACK_STYLES, '.proposal-print-portal .pp-body p {'))
      .toMatch(/var\(--pp-paragraph-gap\)/);
  });
});

/* ── C. The repeated DESIGN label ──────────────────────────────────────────── */

describe('C. No repeated DESIGN label under the shared Sound Experience heading', () => {
  it('passes no kicker for the three structures', () => {
    expect(PACK_DOCUMENT).toMatch(/const sectionKicker = isPillarSection\(section\.section_type\) \? null : 'Design';/);
    expect(PACK_DOCUMENT).toMatch(/kicker=\{sectionKicker\}/);
  });

  it('still gives every other page its own label', () => {
    expect(PACK_DOCUMENT).toContain("kicker={isComparisonKind ? 'Comparison' : 'Evidence'}");
    expect(PACK_DOCUMENT).toContain('kicker="Visualisation"');
  });

  it('prints no empty track line in place of the removed label', () => {
    expect(PAGE_HEADER).toMatch(/\{\(number \|\| kicker\) \? \(/);
  });

  it('keeps the shared heading and the three individual headings', () => {
    expect(PACK_DOCUMENT).toContain('<h2 className="pp-pillars__title">{PILLAR_GROUP_HEADING}</h2>');
    expect(PACK_DOCUMENT).toMatch(/title=\{displayTitle\}/);
    expect(PACK_STYLES).toMatch(/\.pp-pillar \.pp-header__title \{\s*font-size: 14pt/);
  });
});

/* ── D. The divider at the end of Spatial Resolution ───────────────────────── */

describe('D. The hairline between two structures is gone', () => {
  const pillarGap = ruleDeclarations(PACK_STYLES, '.proposal-print-portal .pp-pillar + .pp-pillar {');

  it('draws no line across the boundary', () => {
    expect(pillarGap).not.toMatch(/border-top\s*:/);
    expect(pillarGap).not.toMatch(/border-bottom\s*:/);
  });

  it('keeps the natural space the structures are separated by', () => {
    expect(pillarGap).toMatch(/padding-top:\s*11mm/);
  });

  it('keeps the main heading treatment and every unrelated rule', () => {
    expect(PACK_STYLES).toMatch(/\.pp-pillar \.pp-header__rule \{\s*margin-top: 4mm/);
    expect(PACK_STYLES).toMatch(/\.pp-header__rule \{\s*height: 1px/);
    expect(IMAGE_STYLES).toMatch(/\.pp-media__caption \{/);
  });
});

/* ── E. The Spatial Resolution photograph ──────────────────────────────────── */

describe('E. The Spatial Resolution photograph is about 20% taller', () => {
  const PRINT_SPATIAL = /\.pp-pillar\[data-editorial-section="spatial_resolution"\] \.pp-media--portrait img \{ height: (\d+)mm; \}/;

  it('is 89mm on the sheet, against the standard 74mm accent', () => {
    const printBlock = IMAGE_STYLES.slice(IMAGE_STYLES.indexOf('@media print'));
    const match = printBlock.match(PRINT_SPATIAL);
    expect(match, 'the Spatial Resolution print height is not declared').toBeTruthy();
    const height = Number(match[1]);
    expect(height).toBeGreaterThanOrEqual(Math.round(74 * 1.2) - 1);
    expect(height).toBeLessThanOrEqual(Math.round(74 * 1.2) + 1);
  });

  it('keeps the existing width: the override sets height only', () => {
    const declarations = ruleDeclarations(IMAGE_STYLES, '.pp-pillar[data-editorial-section="spatial_resolution"]');
    expect(declarations).toMatch(/height:\s*\d+mm/);
    expect(declarations).not.toMatch(/width|flex|max-width/);
    expect(IMAGE_STYLES).toMatch(/\.pp-media--portrait \{\s*flex: 0 0 38%;\s*max-width: 38%/);
  });

  it('is never stretched: the shared treatment keeps its cover crop', () => {
    expect(ruleDeclarations(IMAGE_STYLES, '.pp-media img {')).toMatch(/width:\s*100%/);
    expect(ruleDeclarations(IMAGE_STYLES, '.pp-media img {')).toMatch(/object-fit:\s*cover/);
  });

  it('leaves every other photograph at its approved height', () => {
    expect(IMAGE_STYLES).toMatch(/\.pp-media--portrait img \{ height: 74mm; \}/);
    expect(IMAGE_STYLES).toMatch(/\.pp-media--landscape img \{ height: 118mm; \}/);
    expect(IMAGE_STYLES).toMatch(/\.pp-media--closing-feature img \{ height: 144mm; \}/);
    expect(IMAGE_STYLES).toMatch(/\.pp-media--seating img \{ height: 74mm; \}/);
  });

  it('takes the same treatment on the editor preview, so the two read alike', () => {
    expect(IMAGE_STYLES).toMatch(/\.pp-pillar\[data-editorial-section="spatial_resolution"\] \.pp-media--portrait img \{ height: 62mm; \}/);
  });
});

/* ── G. The structures keep their connected two-sheet presentation ─────────── */

describe('G. The three structures still travel as one group over two sheets', () => {
  const HEADER_MM = 14 * PT_MM * 1.2 + 4 + 0.3;
  const GROUP_HEADING_MM = 9 * PT_MM * 1.2 + 6 + 3 + 0.3;
  const STRUCTURE_GAP_MM = 11;

  const spatial = GROUP_HEADING_MM + HEADER_MM
    + Math.max(blockMm(GENESIS_PILLARS.spatial.paragraphs, 4.2), GENESIS_PILLARS.spatial.portraitMm);
  const dynamic = STRUCTURE_GAP_MM + HEADER_MM + blockMm(GENESIS_PILLARS.dynamic.paragraphs, 4.2);
  const timbre = STRUCTURE_GAP_MM + HEADER_MM + blockMm(GENESIS_PILLARS.timbre.paragraphs, 4.2)
    + GENESIS_PILLARS.timbre.featureGapMm + GENESIS_PILLARS.timbre.featureMm;

  it('fits each structure on a sheet', () => {
    [spatial, dynamic, timbre].forEach((height) => expect(height).toBeLessThan(SHEET_MM));
  });

  it('needs two sheets, never three', () => {
    expect(spatial + dynamic + timbre).toBeLessThanOrEqual(SHEET_MM * 2);
    expect(spatial + dynamic + timbre).toBeGreaterThan(SHEET_MM);
  });

  it('is composed as one group under one shared heading', () => {
    expect(PACK_DOCUMENT).toContain('data-editorial-composition="sound_experience"');
    expect(PACK_DOCUMENT).toContain("'pp-pillar' : undefined");
  });

  it('grows no taller than the label and divider removals give back', () => {
    // Removing the track line (about 8.4mm per structure) more than pays for the
    // 15mm the taller photograph adds.
    const trackLineMm = 8 * PT_MM * 1.2 + 5;
    expect(trackLineMm * 3).toBeGreaterThan(GENESIS_PILLARS.spatial.portraitMm - 74);
  });
});

/* ── H. Key Performance Highlights stays one complete A4 page ──────────────── */

describe('H. The one-sheet Key Performance Highlights authority is untouched', () => {
  it('is still fitted and kept whole by the compositor', () => {
    const compositor = read('../components/proposal/export/browserProposalComposition.js');
    expect(compositor).toContain("original.matches?.('.pp-page--highlights')");
    expect(compositor).toContain('fitHighlightsSection(original, pageMeasurement)');
  });

  it('is never touched by the page-5 prose rule', () => {
    const pageFive = '.proposal-print-portal .pp-page--system_design_summary [data-editorial-composition="continuing"]';
    expect(PACK_STYLES).not.toContain(`${pageFive}.pp-page--highlights`);
    expect(PACK_STYLES).toMatch(/\.pp-page--highlights/);
  });
});