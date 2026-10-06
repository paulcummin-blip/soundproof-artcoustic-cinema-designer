// technical-report-brand-typography.test.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE — Artcoustic brand typography, RP22 level pills and the FAIL label
// in the Technical Report and its exported PDF.
//
//   A  brand typography   every Technical Report surface reads the shared tokens,
//                         and no surface declares a stack of its own
//   B  header rhythm      uppercase headings, tracking +100, line height 1.2
//   C  body type          Didact Gothic, 9pt A4 copy, tracking +50, line height 1.4
//   D  pill centring      a fixed box with the label centred in it, line-height 1
//   E  fail label         the summary's fifth bucket reads FAIL × n, never "–"
//   F  fail colour        the one canonical FAIL token — the brand's #4A230F
//   G  PDF export         the printed document carries the same fonts, tracking
//                         and pill boxes as the preview
//
// Type and colour are decided by two existing authorities and nothing else:
//   src/components/report/typography/reportTypography.js
//   src/components/utils/rp22Colors.jsx
// ---------------------------------------------------------------------------

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  REPORT_FONT_BODY,
  REPORT_FONT_HEADING,
  REPORT_TRACKING_BODY,
  REPORT_TRACKING_HEADING,
  REPORT_LEADING_BODY,
  REPORT_LEADING_HEADING,
  reportSectionHeadingStyle,
  reportBodyStyle,
  resolveReportProfile,
} from '../src/components/report/typography/reportTypography.js';
import { resolveGradeToken, RP22_GRADE_TOKENS } from '../src/components/utils/rp22Colors.jsx';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const TOKENS = '../src/components/report/typography/reportTypography.js';
const RP22_COLORS = '../src/components/utils/rp22Colors.jsx';
const PILL = '../src/components/ui/RP22GradingPill.jsx';
const BADGE = '../src/components/report/technical/TechnicalLevelBadge.jsx';
const SUMMARY = '../src/components/report/technical/TechnicalPerformanceSummary.jsx';
const OVERVIEW = '../src/components/report/technical/TechnicalProjectOverview.jsx';
const PARAM_PAGE = '../src/components/report/technical/TechnicalParameterPage.jsx';
const GRAPH = '../src/components/report/technical/BassResponseGraphSection.jsx';
const SCORECARD = '../src/components/report/technical/TechnicalAsdrScorecard.jsx';
const NOTICE = '../src/components/report/technical/TechnicalReportNotice.jsx';
const ABOUT_PAGE = '../src/components/report/AboutSoundProofReportPage.jsx';
const REPORT_PAGE = '../src/pages/RP22Report.jsx';
const PRINT_STYLES = '../src/components/report/ReportPrintStyles.jsx';
const PRINT_WINDOW = '../src/components/report/reportPrintWindow.js';
const TECH_PRINT_WINDOW = '../src/components/report/technical/technicalReportPrintWindow.js';

/** Every Technical Report surface whose type must come from the tokens. */
const REPORT_SURFACES = [
  SUMMARY,
  OVERVIEW,
  PARAM_PAGE,
  GRAPH,
  SCORECARD,
  NOTICE,
  ABOUT_PAGE,
  REPORT_PAGE,
];

/** A local font stack: the very drift this work removes. */
const LOCAL_STACK = /Futura|Didact|Century Gothic|Arial|Helvetica|system-ui|sans-serif/;

test('A. the Technical Report declares no font stack of its own', () => {
  for (const file of REPORT_SURFACES) {
    const offenders = read(file)
      .split('\n')
      .filter((line) => /fontFamily:/.test(line) && LOCAL_STACK.test(line));
    assert.deepEqual(offenders, [], `${file} wrote a local font stack: ${offenders.join(' | ')}`);
  }
});

test('A. every Technical Report heading surface reads the shared heading token', () => {
  for (const file of [SUMMARY, OVERVIEW, PARAM_PAGE, GRAPH, SCORECARD, ABOUT_PAGE]) {
    const source = read(file);
    assert.match(source, /reportSectionHeadingStyle/, `${file} does not use the section-heading token`);
    assert.match(
      source,
      /from '@\/components\/report\/typography\/reportTypography'|from "@\/components\/report\/typography\/reportTypography"/,
      `${file} does not import the token module`,
    );
  }
  const notice = read(NOTICE);
  assert.match(notice, /REPORT_FONT_BODY/);
  assert.equal(LOCAL_STACK.test(notice.split('fontFamily:')[1] || ''), false);
});

test('A. the report page carries the brand stacks through the tokens', () => {
  const source = read(REPORT_PAGE);
  assert.match(source, /import \{[\s\S]*REPORT_FONT_HEADING,[\s\S]*\} from '@\/components\/report\/typography\/reportTypography'/);
  assert.match(source, /fontFamily: REPORT_FONT_HEADING/);
  assert.match(source, /fontFamily: REPORT_FONT_BODY/);
  // The cover's RP22 and RP23 explanations are document headings.
  const coverHeadings = (source.match(/data-report-section-heading="true" style=\{reportSectionHeadingStyle\(/g) || []).length;
  assert.equal(coverHeadings, 2);
});

test('B. report headings are uppercase, tracked +100, leading 1.2', () => {
  assert.equal(REPORT_TRACKING_HEADING, '0.1em');
  assert.equal(REPORT_LEADING_HEADING, 1.2);

  const heading = reportSectionHeadingStyle('18pt', { color: '#213428' });
  assert.equal(heading.fontFamily, REPORT_FONT_HEADING);
  assert.equal(heading.textTransform, 'uppercase');
  assert.equal(heading.letterSpacing, '0.1em');
  assert.equal(heading.lineHeight, 1.2);
  assert.equal(heading.fontSize, '18pt');
  // A caller may pass colour and spacing — never type.
  assert.equal(heading.color, '#213428');
});

test('B. the heading face is Futura PT Light with the Century Gothic fallback', () => {
  assert.match(REPORT_FONT_HEADING, /'Futura PT Light'/);
  assert.match(REPORT_FONT_HEADING, /'Futura PT'/);
  assert.match(REPORT_FONT_HEADING, /'Century Gothic'/);
});

test('B. the A4 profile keeps the brand title / header / subheader / body sizes', () => {
  const a4 = resolveReportProfile('a4');
  assert.equal(a4.title, '60pt');
  assert.equal(a4.header, '22pt');
  assert.equal(a4.subheader, '14pt');
  assert.equal(a4.body, '9pt');
});

test('C. body copy is Didact Gothic, sentence case, tracked +50, leading 1.4', () => {
  assert.match(REPORT_FONT_BODY, /'Didact Gothic'/);
  assert.match(REPORT_FONT_BODY, /'Century Gothic'/);

  const body = reportBodyStyle();
  assert.equal(body.fontFamily, REPORT_FONT_BODY);
  assert.equal(body.fontSize, '9pt');
  assert.equal(body.letterSpacing, '0.05em');
  assert.equal(body.lineHeight, 1.4);
  assert.equal(body.textTransform, 'none');

  assert.equal(REPORT_TRACKING_BODY, '0.05em');
  assert.equal(REPORT_LEADING_BODY, 1.4);
});

test('D. the RP22 pill centres its label in a fixed, border-box box', () => {
  const source = read(PILL);
  assert.match(source, /display: "inline-flex"/);
  assert.match(source, /alignItems: "center"/);
  assert.match(source, /justifyContent: "center"/);
  assert.match(source, /textAlign: "center"/);
  assert.match(source, /lineHeight: 1,/);
  assert.match(source, /boxSizing: "border-box"/);
  assert.match(source, /height: size\.height/);
  assert.match(source, /minWidth: size\.minWidth/);
  assert.match(source, /fontFamily: REPORT_FONT_HEADING/);

  // Every variant carries a fixed height, so a row of pills is one row of boxes.
  const heights = source.match(/height: \d+,/g) || [];
  assert.equal(heights.length, 3, 'each pill variant must declare a height');
});

test('D. the Technical Report level badge centres its label in a fixed box', () => {
  const source = read(BADGE);
  assert.match(source, /display: "inline-flex"/);
  assert.match(source, /alignItems: "center"/);
  assert.match(source, /justifyContent: "center"/);
  assert.match(source, /textAlign: "center"/);
  assert.match(source, /lineHeight: 1,/);
  assert.match(source, /boxSizing: "border-box"/);
  assert.match(source, /minWidth: dims\.w/);
  assert.match(source, /height: dims\.h/);
  // One authority for the grade colours, never a local one.
  assert.match(source, /resolveGradeToken/);
});

test('E. the summary counts every level, and the fifth bucket is FAIL', () => {
  const source = read(SUMMARY);
  const blocks = source.match(/<LevelCountBlock[^>]*\/>/g) || [];
  assert.equal(blocks.length, 5, 'L4, L3, L2, L1 and FAIL are all shown');
  for (const level of ['L4', 'L3', 'L2', 'L1']) {
    assert.ok(blocks.some((block) => block.includes(`level="${level}"`)), `${level} is missing`);
  }
  const fail = blocks.find((block) => block.includes('level="FAIL"'));
  assert.ok(fail, 'the fifth bucket must be FAIL');
  // FAIL is the failure count, shown even when it is zero.
  assert.match(fail, /count=\{roomLevelCounts\?\.fail \?\? 0\}/);
});

test('E. no dash is used as a level label in the summary', () => {
  const source = read(SUMMARY);
  assert.equal(source.includes('level="—"'), false);
  assert.equal(source.includes('unassessed'), false);
  // A dash is still the honest answer for an unassessed value elsewhere, and a
  // zero level is a failure — that distinction lives in the colour authority.
  assert.equal(resolveGradeToken('FAIL').label, 'FAIL');
  assert.equal(resolveGradeToken(0).key, 'FAIL');
  assert.equal(resolveGradeToken('—').key, 'DASH');
  assert.equal(resolveGradeToken('—').label, '—');
});

test('F. FAIL uses the one canonical token, the brand burgundy #4A230F', () => {
  const { token, key } = resolveGradeToken('FAIL');
  assert.equal(key, 'FAIL');
  assert.equal(token.bg, RP22_GRADE_TOKENS.FAIL.bg);
  assert.equal(token.border, '#4A230F');
  assert.equal(token.text, '#FFFFFF');
  assert.equal(token.solid, true);

  // The colour authority declares the FAIL token once; every report surface
  // reads it through the resolver and declares no failure style of its own.
  assert.match(read(RP22_COLORS), /FAIL: \{ bg: "#4A230F", border: "#4A230F", text: "#FFFFFF", solid: true \}/);
  // The pill and the report badge both resolve their colours through it.
  for (const file of [BADGE, PILL]) {
    assert.match(read(file), /resolveGradeToken/);
  }
  // The summary carries no colour of its own: it renders the FAIL bucket through
  // the badge, which is the component that owns the token.
  const summary = read(SUMMARY);
  assert.match(summary, /<TechnicalLevelBadge level=\{level\} size="small" \/>/);
  for (const file of [SUMMARY, BADGE, PILL]) {
    const source = read(file);
    assert.equal(/\bFAIL\s*:\s*\{/.test(source), false, `${file} declares its own FAIL token`);
    assert.equal(/failBG|failBg|FailColor|FAIL_COLOR/.test(source), false, `${file} names a fail colour`);
  }
});

test('G. the exported PDF carries the same fonts, tracking and pill boxes', () => {
  // The print window copies the app's stylesheets and the printed node verbatim.
  const window = read(PRINT_WINDOW);
  assert.match(window, /stylesMarkup\(\)/);
  assert.match(window, /node\.outerHTML/);

  const technicalWindow = read(TECH_PRINT_WINDOW);
  assert.match(technicalWindow, /\.print-only\.print-keep-layout/);

  // The report mounts the shared typography system into its own root.
  assert.match(read(REPORT_PAGE), /<ReportTypographyStyles scope="\.rp22-report" profile="a4" \/>/);

  // And its print rules read the canonical variables rather than a local stack.
  const printStyles = read(PRINT_STYLES);
  assert.match(printStyles, /font-family: var\(--report-font-heading\) !important/);
  assert.match(printStyles, /letter-spacing: var\(--report-heading-tracking\) !important/);
  assert.match(printStyles, /line-height: var\(--report-heading-leading\) !important/);
  assert.match(printStyles, /font-family: var\(--report-font-body\) !important/);

  // The one print rule that resizes the seat badge changes its dimensions only:
  // centring stays with the component's inline box, so the label cannot drift.
  const badgeRule = (printStyles.match(/\.rp22-report \.tech-seat-badge \{[\s\S]*?\}/) || [''])[0];
  assert.match(badgeRule, /height: 24px !important/);
  assert.equal(/display:/.test(badgeRule), false);
  assert.equal(/align-items:/.test(badgeRule), false);
  assert.equal(/line-height:/.test(badgeRule), false);
});

test('G. the token module is the single typography authority', () => {
  const tokens = read(TOKENS);
  assert.match(tokens, /export const REPORT_FONT_HEADING/);
  assert.match(tokens, /export function reportSectionHeadingStyle/);
  assert.match(tokens, /export function reportBodyStyle/);
  // The stack is written once, and both helpers read it.
  const futuraWrites = (tokens.match(/'Futura PT Light'/g) || []).length;
  assert.equal(futuraWrites, 1);
});