/**
 * Acceptance tests for the System Design Summary / Proposal PDF output.
 *
 * Covers: the proposal filename format for every report type, the numeric
 * display policy (whole angles, whole dB, whole Hz), the four-column Key
 * Performance Highlights rows with a populated "What the room gains" cell, the
 * one-heading rule for a section, the highlights introduction rule, and the
 * canonical screen size a report states.
 *
 * Pure: no React, no database, no browser.
 *
 * Run: npx vitest run test/proposal-report-authority.test.mjs
 */

import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import {
  buildProposalReportTitle,
  buildReportFilename,
  proposalReportTypeToken,
  REPORT_PDF_TYPE,
} from '../src/components/report/reportPdfTitle.js';
import {
  DISPLAY_UNIT,
  formatResultText,
} from '../src/components/proposal/displayValueFormat.js';
import {
  HIGHLIGHT_AREA,
  buildHighlightDisplayRows,
  HIGHLIGHT_DISPLAY_LIMIT,
} from '../src/components/proposal/keyPerformanceHighlightsAuthority.js';
import {
  limitSentences,
  prepareSectionBody,
  stripDuplicateLeadingHeading,
} from '../src/components/proposal/sectionBodyAuthority.js';
import { resolveCanonicalScreen } from '../src/components/models/screen/canonicalScreenSize.js';

const SEGMENTS = ['Sound Proof', 'Artcoustic Cinema Designer'];

describe('proposal PDF filename', () => {
  const details = { dealerName: 'Ribble AV', projectReference: 'LH-001' };

  it('names the report type, dealer, project and reference', () => {
    assert.equal(
      buildProposalReportTitle('Lords Hall', 'system_summary', details),
      'Sound Proof - Artcoustic Cinema Designer - System Design Summary - Ribble AV - Lords Hall - LH-001'
    );
    assert.equal(
      buildProposalReportTitle('Lords Hall', 'comparison', details),
      'Sound Proof - Artcoustic Cinema Designer - System Design Comparison - Ribble AV - Lords Hall - LH-001'
    );
    assert.equal(
      buildProposalReportTitle('Lords Hall', 'single', details),
      'Sound Proof - Artcoustic Cinema Designer - Proposal - Ribble AV - Lords Hall - LH-001'
    );
  });

  it('always carries Sound Proof, the product and a report type token', () => {
    const name = buildProposalReportTitle('Lords Hall', 'system_summary', {});
    SEGMENTS.forEach((segment) => assert.ok(name.includes(segment), segment));
    assert.ok(name.includes('System Design Summary'));
    assert.equal(proposalReportTypeToken('system_summary'), REPORT_PDF_TYPE.SYSTEM_DESIGN_SUMMARY);
    assert.equal(proposalReportTypeToken('comparison'), REPORT_PDF_TYPE.SYSTEM_DESIGN_COMPARISON);
    assert.equal(proposalReportTypeToken('something_legacy'), REPORT_PDF_TYPE.PROPOSAL);
  });

  it('never names the platform, whatever the project is called', () => {
    const name = buildReportFilename('Proposal', 'Base44 demo room', null, {
      dealerName: 'Base 44 dealer',
    });
    assert.ok(!/base\s*44/i.test(name), name);
  });

  it('omits the dealer and reference segments rather than filling them in', () => {
    assert.equal(
      buildProposalReportTitle('Lords Hall', 'system_summary', {}),
      'Sound Proof - Artcoustic Cinema Designer - System Design Summary - Lords Hall'
    );
  });
});

describe('numeric display policy', () => {
  it('states angles as whole degrees', () => {
    assert.equal(formatResultText('L1 · 47.8°', DISPLAY_UNIT.DEGREES), 'L1 · 48°');
  });

  it('states dB as whole numbers', () => {
    assert.equal(formatResultText('106.0 dBC', DISPLAY_UNIT.DB), '106 dBC');
    assert.equal(formatResultText('±0.95 dB', DISPLAY_UNIT.DB), '±1 dB');
    assert.equal(formatResultText('L4 · 24.4 dB', DISPLAY_UNIT.DB), 'L4 · 25 dB');
  });

  it('states bass extension as whole Hz using the favourable policy', () => {
    assert.equal(formatResultText('16.4 Hz', DISPLAY_UNIT.HZ), '16 Hz');
  });

  it('leaves a level code, a channel count and a distance alone', () => {
    assert.equal(formatResultText('L1 · 9.1.4', DISPLAY_UNIT.NONE), 'L1 · 9.1.4');
    assert.equal(formatResultText('L1', DISPLAY_UNIT.NONE), 'L1');
    assert.equal(formatResultText('0.85 m', DISPLAY_UNIT.NONE), '0.85 m');
  });

  it('gives a bare angle its degree sign', () => {
    assert.equal(formatResultText('L1 · 47.8', DISPLAY_UNIT.DEGREES), 'L1 · 48°');
  });
});

describe('Key Performance Highlights rows', () => {
  const calculated = [
    { key: 'p5', area: 'Horizontal spacing', result: 'L1 · 47.8', what_the_room_gains: '' },
    {
      key: 'p12',
      area: 'Screen Dynamic Range',
      result: 'L4 · 106.0 dBC',
      what_the_room_gains: 'Strong headroom on the screen channels.',
    },
    { key: 'p18', area: 'Bass extension', result: 'L4 · 16.4 Hz', what_the_room_gains: '' },
    { key: 'dpi', area: 'Design Index', result: '4 · Primary', what_the_room_gains: 'Internal' },
  ];

  const rows = buildHighlightDisplayRows(calculated);

  it('carries the four client-facing columns', () => {
    assert.deepEqual(Object.keys(rows[0]).filter((key) => key !== 'key'), [
      'area',
      'parameter',
      'result',
      'gain',
    ]);
  });

  it('names the performance area and the parameter source', () => {
    assert.equal(rows[0].area, HIGHLIGHT_AREA.SPATIAL);
    assert.equal(rows[0].parameter, 'P5 horizontal spacing');
    assert.equal(rows[0].result, 'L1 · 48°');
  });

  it('never leaves "what the room gains" empty', () => {
    rows.forEach((row) => assert.ok(row.gain.length > 15, `${row.key}: ${row.gain}`));
  });

  it('keeps each row on its own performance area', () => {
    const byKey = new Map(rows.map((row) => [row.key, row]));
    assert.equal(byKey.get('p12').area, HIGHLIGHT_AREA.DYNAMIC);
    assert.equal(byKey.get('p18').area, HIGHLIGHT_AREA.BASS);
    assert.equal(byKey.get('p18').result, 'L4 · 16 Hz');
  });

  it('drops the internal Design Index and caps the table length', () => {
    assert.ok(!rows.some((row) => /design index/i.test(`${row.area} ${row.parameter}`)));
    const many = Array.from({ length: 30 }, (unused, index) => ({
      key: `p${index + 2}`,
      area: 'Result',
      result: 'L2 · 3.4 dB',
      what_the_room_gains: '',
    }));
    assert.equal(buildHighlightDisplayRows(many).length, HIGHLIGHT_DISPLAY_LIMIT);
  });

  it('keeps a generated sentence when it is a usable one', () => {
    const withProse = buildHighlightDisplayRows([
      {
        key: 'p19',
        area: 'Bass response',
        result: 'L3 · 4.0 dB',
        what_the_room_gains: 'Even bass response across every seat in the room.',
      },
    ]);
    assert.equal(withProse[0].gain, 'Even bass response across every seat in the room.');
  });
});

describe('section heading and highlights introduction', () => {
  it('removes a leading heading that repeats the section title', () => {
    assert.equal(
      stripDuplicateLeadingHeading('<h2>Dynamic Range</h2><p>Body text.</p>', 'Dynamic Range'),
      '<p>Body text.</p>'
    );
    assert.equal(
      stripDuplicateLeadingHeading('<h2>SYSTEM DESIGN SUMMARY</h2><p>Body.</p>', 'System Design Summary'),
      '<p>Body.</p>'
    );
  });

  it('keeps a heading that says something else', () => {
    const html = '<h2>Screen and seating</h2><p>Body text.</p>';
    assert.equal(stripDuplicateLeadingHeading(html, 'Dynamic Range'), html);
  });

  it('applies the one-heading rule to every section', () => {
    assert.equal(
      prepareSectionBody('<h2>Timbre Matching</h2><p>Body.</p>', {
        title: 'Timbre Matching',
        sectionType: 'timbre_matching',
      }),
      '<p>Body.</p>'
    );
  });

  it('drops a list from the highlights introduction and keeps it short', () => {
    const intro = prepareSectionBody(
      '<h2>Key Performance Highlights</h2><p>Measured summary of this design.</p><ul><li>P5 47.8°</li></ul><p>Every row states what the result gives the room.</p><p>A third sentence.</p><p>A fourth sentence.</p>',
      { title: 'Key Performance Highlights', sectionType: 'key_performance_highlights' }
    );
    assert.ok(!/<ul|<li/.test(intro), intro);
    assert.ok((intro.match(/[.!?](\s|$)/g) || []).length <= 3, intro);
  });

  it('limits prose to the requested number of sentences', () => {
    assert.equal(limitSentences('<p>One. Two. Three.</p>', 2), '<p>One. Two.');
  });
});

describe('canonical screen size', () => {
  it('derives the stated diagonal from the viewable width', () => {
    const screen = resolveCanonicalScreen({ screen_size: 147, aspect_ratio: '16:9' });
    assert.equal(screen.widthInches, 147);
    assert.equal(screen.diagonalInches, 169);
  });

  it('uses a TV preset when the design carries one', () => {
    const screen = resolveCanonicalScreen({ screen_size: 120, tv_preset_key: 'tv83', aspect_ratio: '16:9' });
    assert.equal(screen.diagonalInches, 83);
  });

  it('states nothing when the project declares no screen', () => {
    assert.equal(resolveCanonicalScreen({ name: 'Room' }), null);
  });
});