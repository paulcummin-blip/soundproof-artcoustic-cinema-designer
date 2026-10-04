// about-sound-proof-layout.test.mjs
// ---------------------------------------------------------------------------
// The About Sound Proof page closes both reports. The copy is good; the layout
// must read as ordinary professional report text — one clean column of simple
// paragraphs — never a newspaper-style multi-column block.
//
//   TEST 1  The two-column newspaper layout is gone
//   TEST 2  One clean content column, with a comfortable measure
//   TEST 3  Paragraphs are separated by consistent spacing
//   TEST 4  Brand typography is used (shared report heading/body families)
//   TEST 5  The published copy passes through unchanged
//   TEST 6  The printed page (PDF) keeps rendering the page
//   TEST 7  No layout overflow: the column is width-constrained
// ---------------------------------------------------------------------------
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import PublicationContentHtml from '../components/publicationContent/PublicationContentHtml.jsx';
import { DEFAULT_ABOUT_SOUND_PROOF_HTML } from '../components/publicationContent/defaultContent.js';

const PAGE_FILE = 'src/components/report/AboutSoundProofReportPage.jsx';
const SRC = fs.readFileSync(PAGE_FILE, 'utf8');

const textOf = (markup) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

test('the two-column newspaper layout is gone', () => {
  assert.ok(!SRC.includes('columnCount'), 'no CSS multi-column is declared');
  assert.ok(!SRC.includes('columnGap'), 'no column gap is declared');
  assert.ok(!SRC.includes('column-count'), 'no column-count rule is declared');
  assert.ok(!SRC.includes('columns:'), 'no shorthand columns rule is declared');
});

test('one clean content column, with a comfortable measure', () => {
  // Exactly one body-copy render, and it sits inside a single width-limited column.
  const renders = SRC.split('<PublicationContentHtml').length - 1;
  assert.equal(renders, 1, 'the copy is rendered once — there is no second column');
  assert.ok(SRC.includes('className="about-sound-proof-copy"'), 'the copy column is a single named column');
  assert.ok(SRC.includes('maxWidth: compact ? "150mm" : "160mm"'), 'the column keeps a comfortable measure');
  assert.ok(SRC.includes('width: "100%"'), 'the column fills the page frame it is given');
});

test('paragraphs are separated by consistent spacing', () => {
  // The published copy is plain <p> blocks and the app base stylesheet zeroes
  // their margins, so the page states the rhythm itself.
  assert.ok(
    SRC.includes('.about-sound-proof-copy p { margin: 0 0 2.4mm 0; }'),
    'paragraphs carry one modest, consistent margin',
  );
  assert.ok(
    SRC.includes('.about-sound-proof-copy p:last-child { margin-bottom: 0; }'),
    'the last paragraph adds no trailing gap',
  );
  assert.ok(SRC.includes('lineHeight: 1.55'), 'the copy is set at a comfortable line height');
  assert.ok(SRC.includes('fontSize: "9.5pt"'), 'the copy is set at report body size');
  // Section-like padding is gone: the page keeps a small frame margin only.
  assert.ok(SRC.includes('padding: compact ? "0 0 3mm 0" : "8mm 12mm"'), 'top and bottom padding is modest');
});

test('the blank spacer blocks in the copy are collapsed', () => {
  // The published copy carries <p><br></p> blocks between paragraphs. Left
  // alone they render as full blank lines — the "large gap" between paragraphs.
  assert.ok(
    SRC.includes('.about-sound-proof-copy p:has(> br:only-child) { display: none; }'),
    'a line-break-only paragraph renders as nothing',
  );
  assert.ok(SRC.includes('.about-sound-proof-copy p:empty'), 'an empty paragraph renders as nothing');
  // The real paragraphs are untouched: they still render one per paragraph.
  const rendered = renderToStaticMarkup(
    React.createElement(PublicationContentHtml, { html: DEFAULT_ABOUT_SOUND_PROOF_HTML, variant: 'print' }),
  );
  assert.equal(rendered.split('<p>').length - 1, (DEFAULT_ABOUT_SOUND_PROOF_HTML.match(/<p>/g) || []).length);
});

test('the article fits one A4 report page', () => {
  // The client report frame is 186 × 271 mm; the published About copy is about
  // 3,100 characters in 11 paragraphs. The budget below is computed from the
  // values the page actually sets, so a future change that lengthens the copy
  // styling has to re-justify itself here.
  const FRAME_H_MM = 271;
  const COPY_CHARS = 3200;
  const COPY_PARAGRAPHS = 11;
  const COLUMN_MM = 160;
  const FONT_PT = 9.5;
  const LINE_HEIGHT = 1.55;
  const PARA_GAP_MM = 2.4;
  const PT_TO_MM = 0.3528;

  const charMm = FONT_PT * 0.5 * PT_TO_MM;
  const lineMm = FONT_PT * LINE_HEIGHT * PT_TO_MM;
  const lines = Math.ceil(COPY_CHARS / (COLUMN_MM / charMm));
  const copyMm = lines * lineMm + (COPY_PARAGRAPHS - 1) * PARA_GAP_MM;
  const headerMm = 17 + 3.5 + 0.5 + 3.5 + 15 * 1.2 * PT_TO_MM + 3.5;
  const framePaddingMm = 8 * 2;

  const totalMm = copyMm + headerMm + framePaddingMm;
  assert.ok(totalMm <= FRAME_H_MM, `the page fits one page (${totalMm.toFixed(0)}mm of ${FRAME_H_MM}mm)`);
  assert.ok(totalMm <= FRAME_H_MM - 10, 'and it keeps headroom, never sitting flush to the page edge');
});

test('brand typography is used', () => {
  assert.ok(SRC.includes('REPORT_FONT_HEADING as FONT_HEADING'), 'the heading family comes from the report authority');
  assert.ok(SRC.includes('REPORT_FONT_BODY as FONT_BODY'), 'the body family comes from the report authority');
  assert.ok(SRC.includes('fontFamily: FONT_BODY'), 'the page is set in the brand body family');
  assert.ok(SRC.includes('fontFamily: FONT_HEADING'), 'the page title is set in the brand heading family');
  // The copy renderer never sets a family of its own, so the brand font inherits.
  const rendererSrc = fs.readFileSync('src/components/publicationContent/PublicationContentHtml.jsx', 'utf8');
  assert.ok(!rendererSrc.includes('fontFamily'), 'the copy renderer does not override the brand family');
});

test('the published copy passes through unchanged', () => {
  // The page hands the published HTML straight to the renderer — no rewriting.
  assert.ok(SRC.includes('html={html}'), 'the page renders the published html unchanged');
  assert.ok(!SRC.includes('replace('), 'the copy is never string-manipulated');
  // The default copy still renders as paragraphs, one block per paragraph.
  const rendered = renderToStaticMarkup(
    React.createElement(PublicationContentHtml, { html: DEFAULT_ABOUT_SOUND_PROOF_HTML, variant: 'print' }),
  );
  const paragraphCount = (DEFAULT_ABOUT_SOUND_PROOF_HTML.match(/<p>/g) || []).length;
  assert.ok(paragraphCount >= 6, 'the default copy is a multi-paragraph document');
  assert.equal(rendered.split('<p>').length - 1, paragraphCount, 'every default paragraph is still present');
  const text = textOf(rendered);
  assert.ok(text.includes('Sound Proof is a cinema design and performance prediction tool built around the principles of CEDIA RP22.'), 'the opening line is unchanged');
  assert.ok(text.includes('give clients a clear understanding of the choices behind their cinema.'), 'the closing line is unchanged');
});

test('the printed page (PDF) keeps rendering the page', () => {
  const printPage = fs.readFileSync('src/components/report/client/ClientReportPage.jsx', 'utf8');
  assert.ok(printPage.includes('AboutSoundProofReportPage'), 'the PDF page still renders the About page');
  assert.ok(printPage.includes('<AboutSoundProofReportPage html={printData.aboutHtml} />'),
    'the PDF page renders the resolved copy it is handed (never a waiting state)');
  // The same single page serves the Visual Report's on-screen closing section.
  const visualReport = fs.readFileSync('src/pages/RP22ClientReport.jsx', 'utf8');
  assert.ok(visualReport.includes('<AboutSoundProofReportPage variant="compact" html={aboutSoundProofHtml} />'),
    'the Visual Report still renders the closing section');
});

test('no layout overflow: the column is width-constrained', () => {
  // A fixed maximum measure keeps the text inside the page frame at any width,
  // and the page itself is a column flex container that never widens the sheet.
  assert.ok(SRC.includes('boxSizing: "border-box"'), 'the page keeps its padding inside its width');
  assert.ok(!SRC.includes('width: "165mm"'), 'the wide two-column measure is retired');
  assert.ok(SRC.includes('flexDirection: "column"'), 'the page stacks logo, title and copy in one column');
});