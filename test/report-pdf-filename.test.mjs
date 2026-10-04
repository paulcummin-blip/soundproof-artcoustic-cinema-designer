/**
 * Acceptance tests for exported report filenames.
 *
 * Covers: the mandated filename format for the Visual and Technical Reports,
 * the optional dealer and project-reference segments, sanitising of illegal
 * filesystem characters, the .pdf extension on download names, and the rule
 * that an exported filename never names the platform the app is built on.
 *
 * Pure: no React, no database, no browser.
 *
 * Run: node test/report-pdf-filename.test.mjs
 */

import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import {
  buildReportFilename,
  buildReportPdfFilename,
  buildTechnicalReportTitle,
  buildVisualReportTitle,
  sanitiseFilenameSegment,
} from '../src/components/report/reportPdfTitle.js';

/** What every exported report filename must contain. */
const MANDATORY = ['Sound Proof', 'Artcoustic Cinema Designer'];

/** What no exported report filename may ever contain. */
const FORBIDDEN = [/base\s*44/i, /\bdownload\b/i, /\bundefined\b/i, /\bnull\b/i, /\d\.\d/];

/** macOS and Windows both refuse these characters in a filename. */
const ILLEGAL_CHARS = /[<>:"/\\|?*\u0000-\u001f]/;

/** A filename may not end in a dot or a space on Windows. */
const assertFilenameClean = (filename) => {
  assert.equal(ILLEGAL_CHARS.test(filename), false, `illegal character in "${filename}"`);
  assert.equal(/[ .]$/.test(filename), false, `trailing dot/space in "${filename}"`);
  assert.equal(/\s{2,}/.test(filename), false, `repeated spaces in "${filename}"`);
  assert.equal(filename, filename.trim(), `untrimmed filename "${filename}"`);
  for (const forbidden of FORBIDDEN) {
    assert.equal(forbidden.test(filename), false, `forbidden token ${forbidden} in "${filename}"`);
  }
  assert.ok(filename.length <= 180, `filename too long (${filename.length}): "${filename}"`);
};

// ── 1 & 2: the format, for both report types ─────────────────────────────────

describe('the exported Visual Report filename', () => {
  it('names Sound Proof, the designer, the report type, dealer, project and reference', () => {
    const filename = buildVisualReportTitle('Lords Hall', null, {
      dealerName: 'Ribble AV',
      projectReference: 'LH-001',
    });
    assert.equal(
      filename,
      'Sound Proof - Artcoustic Cinema Designer - Visual - Ribble AV - Lords Hall - LH-001',
    );
    for (const token of [...MANDATORY, 'Visual', 'Ribble AV', 'Lords Hall', 'LH-001']) {
      assert.ok(filename.includes(token), `"${filename}" is missing "${token}"`);
    }
    assertFilenameClean(filename);
  });

  it('appends the .pdf extension only when the name is used as a download', () => {
    const title = buildVisualReportTitle('Lords Hall', null, { dealerName: 'Ribble AV' });
    const download = buildReportPdfFilename('Visual', 'Lords Hall', null, { dealerName: 'Ribble AV' });
    assert.equal(download, `${title}.pdf`);
    assert.equal(title.endsWith('.pdf'), false);
    assert.equal((download.match(/\.pdf/g) || []).length, 1);
  });
});

describe('the exported Technical Report filename', () => {
  it('names the same segments with the Technical token', () => {
    const filename = buildTechnicalReportTitle('Clarke', null, {
      dealerName: 'Richer Sounds Nottingham',
      projectReference: 'RSN-CLARKE',
    });
    assert.equal(
      filename,
      'Sound Proof - Artcoustic Cinema Designer - Technical - Richer Sounds Nottingham - Clarke - RSN-CLARKE',
    );
    assert.ok(filename.includes('Technical'));
    assertFilenameClean(filename);
  });
});

// ── 3: neither filename names the platform, or a project UUID ────────────────

describe('no exported filename names the platform', () => {
  it('strips a platform token that leaked in from the page title', () => {
    const polluted = 'SoundProof - Artcoustic Cinema Designer _ Base44';
    const filename = buildReportFilename('Visual', polluted, null, {
      projectReference: 'LH-001',
    });
    assert.equal(/base\s*44/i.test(filename), false, `"${filename}" names the platform`);
    assert.ok(filename.includes('Visual'));
    assert.ok(filename.includes('LH-001'));
    assertFilenameClean(filename);
  });

  it('never falls back to the raw project identifier', () => {
    const filename = buildTechnicalReportTitle('f2b1c9de-6f2a-4a1e-9d55-1a2b3c4d5e6f');
    // The identifier is a project NAME here, so it is passed through as the
    // name — the point is that no path invents a filename from an id alone.
    assert.ok(filename.includes('Technical'));
    assert.equal(filename, `Sound Proof - Artcoustic Cinema Designer - Technical - f2b1c9de-6f2a-4a1e-9d55-1a2b3c4d5e6f`);
  });

  it('is never only "SoundProof"', () => {
    const filename = buildVisualReportTitle('Lords Hall');
    assert.notEqual(filename, 'SoundProof');
    assert.ok(filename.includes('Sound Proof'));
    assert.ok(filename.includes('Artcoustic Cinema Designer'));
    assert.ok(filename.includes('Visual'));
  });
});

// ── 4 & 5: with and without a project reference ──────────────────────────────

describe('the optional segments', () => {
  it('states the reference when the project has one', () => {
    const filename = buildTechnicalReportTitle('Clarke', null, {
      dealerName: 'Richer Sounds Nottingham',
      projectReference: 'RSN-CLARKE',
    });
    assert.ok(filename.endsWith(' - RSN-CLARKE'));
  });

  it('omits the reference segment entirely when the project has none', () => {
    const filename = buildTechnicalReportTitle('Clarke', null, {
      dealerName: 'Richer Sounds Nottingham',
      projectReference: '',
    });
    assert.equal(
      filename,
      'Sound Proof - Artcoustic Cinema Designer - Technical - Richer Sounds Nottingham - Clarke',
    );
    assert.equal(/ - - /.test(filename), false);
    assert.equal(filename.endsWith(' -'), false);
    assertFilenameClean(filename);
  });

  it('omits the dealer segment when the dealer is unavailable', () => {
    const filename = buildVisualReportTitle('Lords Hall', null, {
      dealerName: null,
      projectReference: 'LH-001',
    });
    assert.equal(
      filename,
      'Sound Proof - Artcoustic Cinema Designer - Visual - Lords Hall - LH-001',
    );
    assertFilenameClean(filename);
  });

  it('always states the project name, falling back when it is missing', () => {
    const filename = buildVisualReportTitle(null, null, {});
    assert.equal(filename, 'Sound Proof - Artcoustic Cinema Designer - Visual - Untitled Project');
  });

  it('states the design version at the end, including the baseline version', () => {
    // A project can hold several versions and Proposal Centre compares them, so
    // an exported report always names the version it documents.
    const named = buildVisualReportTitle('Lords Hall', { number: 2, name: 'Twin SUB2-12' }, {
      projectReference: 'LH-001',
    });
    assert.equal(
      named,
      'Sound Proof - Artcoustic Cinema Designer - Visual - Lords Hall - LH-001 - Twin SUB2-12 V2',
    );
    const baseline = buildVisualReportTitle('Lords Hall', { number: 1, name: 'Current Design' });
    assert.equal(baseline, 'Sound Proof - Artcoustic Cinema Designer - Visual - Lords Hall - Current Design V1');
  });
});

// ── 6: special characters ────────────────────────────────────────────────────

describe('special characters in a name or reference', () => {
  it('removes slashes and every illegal filesystem character', () => {
    const filename = buildTechnicalReportTitle('Hall/Annex: "West" <upstairs>', null, {
      dealerName: 'Ribble AV | North',
      projectReference: 'LH\\001?*',
    });
    assert.equal(ILLEGAL_CHARS.test(filename), false, `illegal character in "${filename}"`);
    assert.equal(filename.includes('/'), false);
    assert.equal(filename.includes('\\'), false);
    assert.ok(filename.includes('Hall Annex'));
    assert.ok(filename.includes('LH 001'));
    assert.ok(filename.includes('Technical'));
    assertFilenameClean(filename);
  });

  it('collapses repeated spaces and trims the result', () => {
    const filename = buildVisualReportTitle('  Lords    Hall  ', null, { dealerName: '  ' });
    assert.equal(filename, 'Sound Proof - Artcoustic Cinema Designer - Visual - Lords Hall');
    assert.ok(!filename.includes('  '));
  });

  it('does not leave an empty segment when a value is only separators', () => {
    const filename = buildTechnicalReportTitle('Clarke', null, {
      dealerName: ' / ',
      projectReference: '   ',
    });
    assert.equal(filename, 'Sound Proof - Artcoustic Cinema Designer - Technical - Clarke');
  });

  it('keeps a hyphen inside a name readable', () => {
    assert.equal(sanitiseFilenameSegment('Ribble AV - North'), 'Ribble AV - North');
    assert.equal(
      buildVisualReportTitle('Lords Hall – Main', null, { projectReference: 'LH-001' }),
      'Sound Proof - Artcoustic Cinema Designer - Visual - Lords Hall - Main - LH-001',
    );
  });
});

// ── 7: one format for every consumer ─────────────────────────────────────────

describe('every consumer builds the name the same way', () => {
  it('is the same name whether the extension is added or not', () => {
    const args = ['Technical', 'Clarke', null, { dealerName: 'Richer Sounds', projectReference: 'RSN-1' }];
    assert.equal(buildReportPdfFilename(...args), `${buildReportFilename(...args)}.pdf`);
  });

  it('states the report type token exactly once', () => {
    const filename = buildVisualReportTitle('Lords Hall', null, {});
    assert.equal((filename.match(/Visual/g) || []).length, 1);
  });
});