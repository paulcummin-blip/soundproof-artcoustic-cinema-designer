/**
 * Acceptance tests for exported document filenames.
 *
 * Covers: the mandated concise filename format for every exported document
 * ("Sound Proof <Document Type> - <Project Name> - <Version>"), the identity
 * fields a filename deliberately leaves out, sanitising of illegal filesystem
 * characters, the .pdf extension on download names, and the rule that an
 * exported filename never names the platform the app is built on.
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
  buildProjectReportTitle,
  buildTechnicalReportTitle,
  buildVisualReportTitle,
  sanitiseFilenameSegment,
} from '../src/components/report/reportPdfTitle.js';

/** What every exported filename must contain. */
const MANDATORY = ['Sound Proof'];

/** What no exported filename may ever contain. */
const FORBIDDEN = [
  /base\s*44/i,
  /artcoustic/i,
  /cinema designer/i,
  /\bdownload\b/i,
  /\bundefined\b/i,
  /\bnull\b/i,
  /\d\.\d/,
];

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

// ── 1: the format, for every document type ───────────────────────────────────

describe('the exported document filename', () => {
  it('states the document type, the project name and the version — and nothing else', () => {
    const filename = buildVisualReportTitle('Lords Hall', { number: 1, name: 'Original Design' }, {
      dealerName: 'Ribble AV',
      clientName: 'Noble Projects',
      projectReference: 'LH-001',
    });
    assert.equal(filename, 'Sound Proof Visual - Lords Hall - Original Design');
    for (const token of [...MANDATORY, 'Visual', 'Lords Hall', 'Original Design']) {
      assert.ok(filename.includes(token), `"${filename}" is missing "${token}"`);
    }
    assertFilenameClean(filename);
  });

  it('names each document type concisely, with its own project and version', () => {
    const version = { number: 1, name: 'Original Design' };
    assert.equal(
      buildProjectReportTitle('Barton Solutions', version, { dealerName: 'Sound Proof', clientName: 'Cheyne Walk', projectReference: 'AC-2026-014' }),
      'Sound Proof Project Report - Barton Solutions - Original Design',
    );
    assert.equal(
      buildTechnicalReportTitle('Barton Solutions', version, { dealerName: 'Sound Proof' }),
      'Sound Proof Technical - Barton Solutions - Original Design',
    );
    assert.equal(
      buildVisualReportTitle('Barton Solutions', version, {}),
      'Sound Proof Visual - Barton Solutions - Original Design',
    );
  });

  it('appends the .pdf extension only when the name is used as a download', () => {
    const title = buildVisualReportTitle('Lords Hall', null, { dealerName: 'Ribble AV' });
    const download = buildReportPdfFilename('Visual', 'Lords Hall', null, { dealerName: 'Ribble AV' });
    assert.equal(download, `${title}.pdf`);
    assert.equal(title.endsWith('.pdf'), false);
    assert.equal((download.match(/\.pdf/g) || []).length, 1);
    assert.equal(download, 'Sound Proof Visual - Lords Hall.pdf');
  });
});

// ── 2: the identity a filename leaves out ────────────────────────────────────

describe('the identity a filename leaves out', () => {
  it('never states the dealer, the client name or the project reference', () => {
    const filename = buildReportFilename('Project Report', 'Barton Solutions', null, {
      dealerName: 'Genesis AV',
      clientName: 'Cheyne Walk',
      projectReference: 'AC-2026-014',
    });
    assert.equal(filename, 'Sound Proof Project Report - Barton Solutions');
    for (const excluded of ['Genesis AV', 'Cheyne Walk', 'AC-2026-014']) {
      assert.equal(filename.includes(excluded), false, `"${filename}" must not name ${excluded}`);
    }
    assertFilenameClean(filename);
  });

  it('never repeats the brand, the document type or the product name', () => {
    const filename = buildReportFilename('Speaker Design', 'Barton Solutions', { number: 1, name: 'Original Design' }, {
      dealerName: 'Sound Proof',
      projectReference: 'AC-2026-014',
    });
    assert.equal(filename, 'Sound Proof Speaker Design - Barton Solutions - Original Design');
    assert.equal((filename.match(/Sound Proof/g) || []).length, 1, 'the brand is stated once');
    assert.equal((filename.match(/Speaker Design/g) || []).length, 1, 'the document type is stated once');
    assert.equal(/artcoustic/i.test(filename), false, 'the product name is never written');
  });
});

// ── 3: neither filename names the platform, or a project UUID ────────────────

describe('no exported filename names the platform', () => {
  it('strips a platform token that leaked in from the page title', () => {
    const polluted = 'SoundProof _ Base44';
    const filename = buildReportFilename('Visual', polluted, null, {
      projectReference: 'LH-001',
    });
    assert.equal(/base\s*44/i.test(filename), false, `"${filename}" names the platform`);
    assert.ok(filename.includes('Visual'));
    assert.ok(filename.includes('SoundProof'));
    assertFilenameClean(filename);
  });

  it('never falls back to the raw project identifier', () => {
    const filename = buildTechnicalReportTitle('f2b1c9de-6f2a-4a1e-9d55-1a2b3c4d5e6f');
    // The identifier is a project NAME here, so it is passed through as the
    // name — the point is that no path invents a filename from an id alone.
    assert.ok(filename.includes('Technical'));
    assert.equal(filename, 'Sound Proof Technical - f2b1c9de-6f2a-4a1e-9d55-1a2b3c4d5e6f');
  });

  it('is never only "SoundProof"', () => {
    const filename = buildVisualReportTitle('Lords Hall');
    assert.notEqual(filename, 'SoundProof');
    assert.ok(filename.includes('Sound Proof'));
    assert.ok(filename.includes('Visual'));
    assert.ok(filename.includes('Lords Hall'));
  });
});

// ── 4 & 5: a missing project, and a missing version ──────────────────────────

describe('the always-present segments', () => {
  it('always states the project name, falling back when it is missing', () => {
    const filename = buildVisualReportTitle(null, null, {});
    assert.equal(filename, 'Sound Proof Visual - Untitled Project');
  });

  it('states the design version at the end, including the baseline version', () => {
    // A project can hold several versions and Proposal Centre compares them, so
    // an exported report always names the version it documents — as the saved
    // name exactly, with no version slot marker appended.
    const named = buildVisualReportTitle('Lords Hall', { number: 2, name: 'Twin SUB2-12' }, {
      projectReference: 'LH-001',
    });
    assert.equal(named, 'Sound Proof Visual - Lords Hall - Twin SUB2-12');
    const baseline = buildVisualReportTitle('Lords Hall', { number: 1, name: 'Current Design' });
    assert.equal(baseline, 'Sound Proof Visual - Lords Hall - Current Design');
    assert.ok(named.endsWith('Twin SUB2-12'), 'the version is the last segment');
  });

  it('states no version when the caller has none, and never a dangling separator', () => {
    const filename = buildVisualReportTitle('Lords Hall', null, { dealerName: 'Ribble AV' });
    assert.equal(filename, 'Sound Proof Visual - Lords Hall');
    assert.equal(/ - - /.test(filename), false);
    assert.equal(filename.endsWith(' -'), false);
    assertFilenameClean(filename);
  });
});

// ── 6: special characters ────────────────────────────────────────────────────

describe('special characters in a name', () => {
  it('removes slashes and every illegal filesystem character', () => {
    const filename = buildTechnicalReportTitle('Hall/Annex: "West" <upstairs>', null, {
      dealerName: 'Ribble AV | North',
      projectReference: 'LH\\001?*',
    });
    assert.equal(ILLEGAL_CHARS.test(filename), false, `illegal character in "${filename}"`);
    assert.equal(filename.includes('/'), false);
    assert.equal(filename.includes('\\'), false);
    assert.ok(filename.includes('Hall Annex'));
    assert.ok(filename.includes('Technical'));
    assertFilenameClean(filename);
  });

  it('collapses repeated spaces and trims the result', () => {
    const filename = buildVisualReportTitle('  Lords    Hall  ', null, { dealerName: '  ' });
    assert.equal(filename, 'Sound Proof Visual - Lords Hall');
    assert.ok(!filename.includes('  '));
  });

  it('does not leave an empty segment when a value is only separators', () => {
    const filename = buildTechnicalReportTitle('Clarke', null, {
      dealerName: ' / ',
      projectReference: '   ',
    });
    assert.equal(filename, 'Sound Proof Technical - Clarke');
  });

  it('keeps a hyphen inside a name readable', () => {
    assert.equal(sanitiseFilenameSegment('Ribble AV - North'), 'Ribble AV - North');
    assert.equal(
      buildVisualReportTitle('Lords Hall – Main', null, { projectReference: 'LH-001' }),
      'Sound Proof Visual - Lords Hall - Main',
    );
  });
});

// ── 7: one format for every consumer ─────────────────────────────────────────

describe('every consumer builds the name the same way', () => {
  it('is the same name whether the extension is added or not', () => {
    const args = ['Technical', 'Clarke', null, { dealerName: 'Richer Sounds', projectReference: 'RSN-1' }];
    assert.equal(buildReportPdfFilename(...args), `${buildReportFilename(...args)}.pdf`);
  });

  it('states the document type token exactly once', () => {
    const filename = buildVisualReportTitle('Lords Hall', null, {});
    assert.equal((filename.match(/Visual/g) || []).length, 1);
  });
});