/**
 * capture-page-fit-diagnostics.test.mjs
 * -------------------------------------
 * ACCEPTANCE — when Project Library storage stops because a completed browser
 * proposal sheet overflowed, the record names the ACTUAL failed sheet, the element
 * that overran it, the height the content measured, the height the sheet allowed
 * and the overflow amount — and the existing TECHNICAL DETAIL disclosure prints
 * them. The browser composition's own measurement of the same sheet travels beside
 * them, so a rounding difference between the two documents reads differently from
 * a material one.
 *
 * BOUNDARY. The decision arithmetic is exercised against the inventory rows the
 * capture really reads (`usedMm` / `availableMm` / `fits`), and the disclosure is
 * exercised with the record the capture really throws. No renderer, no storage,
 * no pagination and no rule is changed to make the suite run.
 */
import { describe, it, expect } from 'vitest';

import { pageFitRecords } from '../components/library/issuedDocument/capturePageFitDiagnostics.js';
import {
  buildStorageTechnicalDetail,
  formatStorageDiagnosticsText,
} from '../components/library/issuedDocument/projectLibraryStorageDiagnostics.js';

/** The tolerance the capture applies to the paper, and so to a sheet. */
const TOLERANCE_MM = 2;

const page = (over) => ({
  kind: 'pp-page proposal-print-section',
  fits: true,
  usedMm: 240,
  availableMm: 271,
  ...over,
});

const value = (rows, key) => rows.find((row) => row.key === key)?.value ?? null;

describe('the sheet that overflowed is reported with its own measurements', () => {
  it('names the failed page, its content height, the printable height and the overflow', () => {
    const capture = [
      { page: 1, kind: 'proposal-print-cover', text: 'cover', images: [] },
      page({ page: 2 }),
      page({ page: 5, kind: 'pp-page proposal-print-section pp-page--images', usedMm: 274.6, fits: false }),
    ];
    const browser = [
      page({ page: 2 }),
      page({ page: 5, usedMm: 270.8 }),
    ];

    const fit = pageFitRecords(capture, { toleranceMm: TOLERANCE_MM, browserPages: browser });

    // The cover carries no measurement, so it is not a sheet that can overflow.
    expect(fit.pages.map((row) => row.page)).toEqual([2, 5]);
    expect(fit.overflowing).toHaveLength(1);
    expect(fit.tolerated).toEqual([]);

    const failed = fit.failed[0];
    expect(failed.page).toBe(5);
    expect(failed.usedMm).toBe(274.6);
    expect(failed.availableMm).toBe(271);
    expect(failed.overflowMm).toBe(3.6);
    // What the composition measured for the SAME sheet, and the difference.
    expect(failed.browserUsedMm).toBe(270.8);
    expect(failed.measurementDifferenceMm).toBe(3.8);
  });

  it('reports nothing when every sheet fits', () => {
    const fit = pageFitRecords([page({ page: 2 }), page({ page: 3 })], { toleranceMm: TOLERANCE_MM });
    expect(fit.overflowing).toEqual([]);
    expect(fit.failed).toEqual([]);
  });
});

describe('sub-millimetre rounding is not a fidelity failure', () => {
  it('stores a sheet that measured over by less than the paper tolerance, and records it', () => {
    const fit = pageFitRecords(
      [page({ page: 3, usedMm: 271.4, fits: false })],
      { toleranceMm: TOLERANCE_MM },
    );

    expect(fit.failed).toEqual([]);
    expect(fit.tolerated).toHaveLength(1);
    expect(fit.tolerated[0].page).toBe(3);
    expect(fit.tolerated[0].overflowMm).toBe(0.4);
  });

  it('still stops storage past the tolerance', () => {
    const fit = pageFitRecords(
      [page({ page: 3, usedMm: 273.1, fits: false })],
      { toleranceMm: TOLERANCE_MM },
    );

    expect(fit.failed).toHaveLength(1);
    expect(fit.tolerated).toEqual([]);
  });
});

describe('the existing disclosure states the measurements', () => {
  const diagnostic = {
    stage_failed: 'capture',
    operation: 'proposal_page_overflow',
    project_id: 'project-1',
    version_id: 'version-1',
    report_type: 'proposal',
    reason: 'The exported PDF could not be captured page-for-page.',
    occurred_at: '2026-10-13T22:00:00.000Z',
    capture_diagnostics: {
      operation: 'proposal_page_overflow',
      paper: '210×297mm',
      pageCount: 9,
      pageFit: {
        toleranceMm: TOLERANCE_MM,
        tolerated: [{ page: 3, overflowMm: 0.4 }],
        failedPage: {
          page: 5,
          kind: 'pp-page proposal-print-section pp-page--images',
          usedMm: 274.6,
          availableMm: 271,
          overflowMm: 3.6,
          browserUsedMm: 270.8,
          measurementDifferenceMm: 3.8,
          element: {
            label: 'figure.pp-media.pp-media--inline',
            identifier: 'frame:3',
            section: { type: 'system_design_summary', name: 'System Design Summary' },
          },
        },
      },
    },
  };

  it('names the sheet, the offending element and all three heights', () => {
    const rows = buildStorageTechnicalDetail({ diagnostic, authAccountId: 'account-1', authRole: 'admin' });

    expect(value(rows, 'capture_failed_page')).toBe('Page 5 of 9 — pp-page proposal-print-section pp-page--images');
    expect(value(rows, 'capture_overflow_element')).toBe(
      'figure.pp-media.pp-media--inline · origin frame:3 · section System Design Summary',
    );
    expect(value(rows, 'capture_page_used')).toBe('274.6 mm');
    expect(value(rows, 'capture_page_available')).toBe('271.0 mm');
    expect(value(rows, 'capture_page_overflow')).toBe('3.6 mm');
    expect(value(rows, 'capture_page_browser')).toBe('270.8 mm (capture measured 3.8 mm more)');
    expect(value(rows, 'capture_page_tolerated')).toBe('page 3 by 0.4 mm');
  });

  it('carries the same rows into COPY DIAGNOSTICS', () => {
    const rows = buildStorageTechnicalDetail({ diagnostic, authAccountId: 'account-1', authRole: 'admin' });
    const text = formatStorageDiagnosticsText({ diagnostic, detail: rows, authAccountId: 'account-1', authRole: 'admin' });

    expect(text).toContain('Overflowing sheet: Page 5 of 9');
    expect(text).toContain('Measured content height: 274.6 mm');
    expect(text).toContain('Printable height available: 271.0 mm');
    expect(text).toContain('Overflow: 3.6 mm');
  });

  it('adds no capture rows to any failure that carries no capture measurement', () => {
    const rows = buildStorageTechnicalDetail({
      diagnostic: { stage_failed: 'storage_upload', reason: 'Storage upload failed.' },
      authAccountId: 'account-1',
      authRole: 'admin',
    });

    expect(rows.some((row) => String(row.key).startsWith('capture_'))).toBe(false);
    expect(value(rows, 'reason')).toBe('Storage upload failed.');
  });
});