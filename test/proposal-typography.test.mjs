// proposal-typography.test.mjs
// ---------------------------
// Guards the Artcoustic typography rule on every proposal surface.
//
//   Headers = Futura PT Light.  Body = Didact Gothic.  Fallback = Century Gothic.
//
// Covers the authority (families, tracking, leading, ratios) and the surfaces
// the rule must reach: the editor preview, generated section bodies, the Key
// Performance Highlights table, Project Images captions and the export/PDF.
//
// Run: node --import ./test/_alias-register.mjs test/proposal-typography.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PROPOSAL_TYPE_RULE,
  PROPOSAL_FONT_HEADING,
  PROPOSAL_FONT_BODY,
  PROPOSAL_TRACKING_HEADING,
  PROPOSAL_TRACKING_BODY,
  PROPOSAL_LEADING_HEADING,
  PROPOSAL_LEADING_BODY,
  PROPOSAL_SCREEN_SIZES,
  PROPOSAL_A4_SIZES,
  proposalRoleStyle,
  buildProposalPreviewCss,
} from '../src/components/proposal/typography/proposalTypography.js';

const read = (path) => fs.readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const MODULE = read('components/proposal/typography/proposalTypography.js');
const STYLES = read('components/proposal/typography/ProposalTypographyStyles.jsx');
const EDITOR = read('pages/ProposalEditor.jsx');
const RICH_TEXT = read('components/proposal/InlineRichTextEditor.jsx');
const KPH = read('components/proposal/KeyPerformanceHighlightsTable.jsx');
const COVER = read('components/proposal/cover/ProposalCoverPage.jsx');
const PRINT = read('components/proposal/export/ProposalPrintStyles.jsx');
const CAPTIONS = read('components/proposal/ImageUploadField.jsx') + read('components/proposal/GalleryDragList.jsx');
const PROPOSAL_SURFACES = [MODULE, STYLES, RICH_TEXT, KPH, COVER, PRINT, CAPTIONS].join('\n');

const familyList = (stack) => stack.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, ''));
/** Largest px value of a clamp(), or the value itself when it is a fixed size. */
const maxPx = (value) => Number((/clamp\([^)]*?(\d+)px\)/.exec(value) || [])[1] || (/^(\d+)px$/.exec(value) || [])[1]);

/* ── Families ─────────────────────────────────────────────────────────── */

test('fallback font set: Futura PT Light / Didact Gothic with Century Gothic between them', () => {
  const heading = familyList(PROPOSAL_FONT_HEADING);
  const body = familyList(PROPOSAL_FONT_BODY);

  assert.equal(heading[0], 'Futura PT Light', 'headers start with the brand face');
  assert.equal(body[0], 'Didact Gothic', 'body copy starts with the brand face');
  assert.ok(heading.includes('Century Gothic'), 'heading fallback');
  assert.ok(body.includes('Century Gothic'), 'body fallback');
  assert.ok(
    heading.indexOf('Century Gothic') < heading.indexOf('Didact Gothic'),
    'Century Gothic is the stated fallback, before the loaded in-family face',
  );
  assert.equal(heading[heading.length - 1], 'sans-serif', 'generic fallback is sans-serif');
  assert.equal(body[body.length - 1], 'sans-serif', 'generic fallback is sans-serif');
});

test('serif body font removed from every proposal surface', () => {
  for (const stack of [PROPOSAL_FONT_HEADING, PROPOSAL_FONT_BODY]) {
    assert.equal(familyList(stack).filter((f) => f === 'serif').length, 0, stack);
  }
  assert.doesNotMatch(PROPOSAL_SURFACES, /Georgia/i, 'no serif face on a proposal surface');
  assert.doesNotMatch(PROPOSAL_SURFACES, /,\s*serif\b/i, 'no bare serif fallback');
  assert.doesNotMatch(PROPOSAL_SURFACES, /font-family:\s*serif/i);
});

test('one authority: families and ratios are reused, never re-declared', () => {
  assert.match(MODULE, /from '@\/components\/report\/typography\/reportTypography'/, 'reads the shared authority');
  assert.doesNotMatch(MODULE, /'Futura PT Light'|'Didact Gothic'/, 'no duplicated font literals');
});

/* ── Header style ─────────────────────────────────────────────────────── */

test('header style: uppercase, tracking +100, leading 1.2, light weight', () => {
  assert.equal(PROPOSAL_TRACKING_HEADING, '0.1em');
  assert.equal(PROPOSAL_LEADING_HEADING, 1.2);
  for (const role of ['title', 'header', 'subheader', 'label']) {
    const style = proposalRoleStyle(role);
    assert.equal(style.fontFamily, PROPOSAL_FONT_HEADING, `${role} family`);
    assert.equal(style.fontWeight, 300, `${role} weight`);
    assert.equal(style.textTransform, 'uppercase', `${role} case`);
    assert.equal(style.letterSpacing, PROPOSAL_TRACKING_HEADING, `${role} tracking`);
    assert.equal(style.lineHeight, PROPOSAL_LEADING_HEADING, `${role} leading`);
  }
});

test('body style: sentence case, tracking +50, leading 1.4, regular weight', () => {
  assert.equal(PROPOSAL_TRACKING_BODY, '0.05em');
  assert.equal(PROPOSAL_LEADING_BODY, 1.4);
  for (const role of ['body', 'caption']) {
    const style = proposalRoleStyle(role);
    assert.equal(style.fontFamily, PROPOSAL_FONT_BODY, `${role} family`);
    assert.equal(style.fontWeight, 400, `${role} weight`);
    assert.equal(style.textTransform, 'none', `${role} case`);
    assert.equal(style.letterSpacing, PROPOSAL_TRACKING_BODY, `${role} tracking`);
    assert.equal(style.lineHeight, PROPOSAL_LEADING_BODY, `${role} leading`);
  }
});

/* ── Hierarchy ────────────────────────────────────────────────────────── */

test('heading hierarchy matches the Artcoustic brand ratio', () => {
  // A4 document roles, read from the shared profile.
  assert.deepEqual(
    { title: PROPOSAL_A4_SIZES.title, header: PROPOSAL_A4_SIZES.header, subheader: PROPOSAL_A4_SIZES.subheader, body: PROPOSAL_A4_SIZES.body },
    { title: '60pt', header: '22pt', subheader: '14pt', body: '9pt' },
  );

  // Screen preview follows the presentation ratio 60 : 40 : 24 : 14.
  const title = maxPx(PROPOSAL_SCREEN_SIZES.title);
  const header = maxPx(PROPOSAL_SCREEN_SIZES.header);
  const subheader = maxPx(PROPOSAL_SCREEN_SIZES.subheader);
  const body = maxPx(PROPOSAL_SCREEN_SIZES.body);
  assert.equal(title, 60);
  assert.equal(header, 40);
  assert.equal(subheader, 24);
  assert.equal(body, 14);

  const near = (a, b) => Math.abs(a - b) <= 0.05;
  assert.ok(near(title / header, 60 / 40), `title/header ${title / header}`);
  assert.ok(near(header / subheader, 40 / 24), `header/subheader ${header / subheader}`);
  assert.ok(near(subheader / body, 24 / 14), `subheader/body ${subheader / body}`);
});

/* ── Surfaces ─────────────────────────────────────────────────────────── */

test('proposal preview updated: heading, body and cover roles applied', () => {
  assert.match(EDITOR, /<ProposalTypographyStyles \/>/, 'the stylesheet is mounted');
  assert.match(EDITOR, /className="proposal-preview/, 'the document is inside the typography scope');
  assert.match(EDITOR, /className="proposal-section-title text-\[#1B1A1A\]"/, 'section headings take the class');
  assert.match(EDITOR, /style=\{proposalRoleStyle\('header'\)\}/, 'section headings take the header role');
  assert.match(RICH_TEXT, /\.\.\.proposalRoleStyle\('body'\)/, 'the editable body takes the body role');
  assert.match(RICH_TEXT, /proposal-editor-content proposal-body/, 'inner HTML roles resolve in the scope');

  const css = buildProposalPreviewCss({ scope: '.proposal-preview' });
  for (const selector of ['.proposal-cover-name', '.proposal-section-title', 'h2', 'h3', '.kph-table th', '.kph-table td', '.proposal-caption']) {
    assert.ok(css.includes(selector), `${selector} styled`);
  }
  assert.match(
    css,
    /proposal-cover-name \{[\s\S]*?font-size: clamp\(30px, 3\.6vw, 60px\)/,
    'cover title at title scale',
  );
  assert.ok(!/serif(?!-)/.test(css.replace(/sans-serif/g, '')), 'no serif in the preview stylesheet');
});

test('generated section content and captions use the proposal faces', () => {
  // Section bodies arrive as HTML — element roles cover h2/h3/p/li inside them.
  const css = buildProposalPreviewCss({ scope: '.proposal-preview' });
  assert.match(css, /p,\n\.proposal-preview li/, 'paragraph and list copy in the body face');
  assert.match(KPH, /proposalRoleStyle\('label'\)/, 'table headers take the header family');
  assert.match(KPH, /proposalRoleStyle\('body'\)/, 'table body takes the body family');
  assert.match(CAPTIONS, /proposalRoleStyle\('caption'\)/, 'Project Images captions take the body family');
});

test('cover identity takes the header face, metadata the body face', () => {
  assert.match(COVER, /valueClass="proposal-cover-name"/, 'the project name is the cover title');
  assert.match(COVER, /className="proposal-cover-label"/);
  assert.match(COVER, /className="proposal-cover-partner"/);
  assert.match(COVER, /className="proposal-cover-meta"/);
  assert.match(COVER, /fontFamily: PROPOSAL_FONT_HEADING/, 'cover identity in the header face');
});

test('export / PDF uses the same typography', () => {
  // The export consumes the shared A4 profile: 60pt title / 22pt header /
  // 14pt subheader / 9pt body.
  assert.match(PRINT, /buildReportTypographyCss\(\{ scope: '\.proposal-print-portal', profile: 'a4'/);
  assert.match(PRINT, /\.proposal-print-section__title \{[\s\S]*?font-family: var\(--report-font-heading\)/, 'export section headings in the header face');
  assert.match(PRINT, /\.proposal-print-cover \.proposal-cover-name \{[\s\S]*?font-size: var\(--report-title-size\)/, 'export cover title at title scale');
  assert.match(PRINT, /\.proposal-print-cover \.proposal-cover-name \{[\s\S]*?font-family: var\(--report-font-heading\)/, 'export cover title in the header face');
  assert.match(PRINT, /\.kph-table th \{[\s\S]*?font-family: var\(--report-font-heading\)/, 'export table headers in the header face');
  assert.match(PRINT, /\.kph-table \{[\s\S]*?font-family: var\(--report-font-body\)/, 'export table body in the body face');

  // No wildcard family that would flatten the roles back to one face.
  const wildcard = /proposal-print-portal \* \{([\s\S]*?)\}/.exec(PRINT)?.[1] || '';
  assert.doesNotMatch(wildcard, /font-family/, 'the print wildcard sets no font family');
});

test('no layout overflow: the cover title wraps and the hierarchy stays proportional', () => {
  assert.match(buildProposalPreviewCss({ scope: '.proposal-preview' }), /proposal-cover-name \{[\s\S]*?overflow-wrap: anywhere/);
  assert.match(PRINT, /\.proposal-cover-name \{[\s\S]*?overflow-wrap: anywhere/);
  assert.equal(PROPOSAL_TYPE_RULE, 'Headers = Futura PT Light. Body = Didact Gothic. Fallback = Century Gothic.');
});