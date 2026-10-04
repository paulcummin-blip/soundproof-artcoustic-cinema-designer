/**
 * Exported PDF row layout contract.
 *
 * Every issued-document row must use ONE structure: icon + filename + metadata
 * on the left, status badge + Open + Download on the right, held on a single
 * line at desktop width and stacking only when the viewport is too narrow.
 *
 * Guards the regression where a row's status/actions wrapped onto their own
 * line while a neighbouring row stayed aligned.
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(here, '../components/library/ExportedDocumentRow.jsx'),
  'utf8',
);

describe('ExportedDocumentRow layout', () => {
  it('stacks only on narrow screens and stays on one line at desktop width', () => {
    assert.ok(
      source.includes('flex flex-col gap-3'),
      'the row stacks by default for narrow viewports',
    );
    assert.ok(
      source.includes('sm:flex-row'),
      'the row becomes a single line at desktop width',
    );
    assert.ok(
      !source.includes('flex-wrap items-start'),
      'the row container no longer wraps the actions onto their own line',
    );
  });

  it('keeps the filename area shrinkable and the actions fixed', () => {
    assert.ok(
      source.includes('flex min-w-0 flex-1 items-start gap-3'),
      'the left content area may shrink so a long filename wraps inside it',
    );
    assert.ok(
      source.includes('flex shrink-0 items-center gap-4 sm:justify-end'),
      'the right-side actions never shrink and sit flush right',
    );
  });

  it('reserves one status column so Open and Download align across rows', () => {
    assert.ok(
      source.includes('sm:min-w-[11rem]'),
      'the status badge occupies a reserved column on desktop',
    );
    const statusSlot = source.indexOf('sm:min-w-[11rem]');
    const statusLabel = source.indexOf('<LibraryStatusLabel');
    const openButton = source.indexOf("run(openIssuedDocument");
    assert.ok(
      statusSlot < statusLabel && statusLabel < openButton,
      'order is status, then Open',
    );
    assert.ok(
      openButton < source.indexOf("run(downloadIssuedDocument"),
      'order is Open, then Download',
    );
  });

  it('preserves the metadata line, the wrapping filename and the page count', () => {
    assert.ok(source.includes('break-words'), 'long filenames wrap in place');
    assert.ok(source.includes('issuedDocumentLabel(record.document_type)'), 'report type kept');
    assert.ok(source.includes('{versionText && <span>{versionText}</span>}'), 'version kept');
    assert.ok(source.includes('Exported {exportedDate}'), 'exported date kept');
    assert.ok(source.includes('`${record.page_count} pages`'), 'page count kept');
  });

  it('carries no report, version or export logic of its own', () => {
    for (const forbidden of [
      'recordIssuedExport',
      'base44.entities',
      'ProjectVersion',
      'document_type ===',
    ]) {
      assert.ok(
        !source.includes(forbidden),
        `the row stays presentation only (found "${forbidden}")`,
      );
    }
  });
});