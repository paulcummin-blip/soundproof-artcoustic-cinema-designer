// test/print-header-logo-sizing.test.mjs
//
// Proves applyPrintHeaderLogoSizing sizes the Sound Proof logo to exactly the
// rendered width of the "Powered by Artcoustic Design Intelligence (ADI)"
// strapline (1:1), preserving the logo's fixed aspect ratio for the height.
//
// A minimal DOM mock stands in for the print window's document: the strapline
// span reports a rendered width, and the helper sets the logo's inline width
// and height from it. No jsdom is required.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { applyPrintHeaderLogoSizing } from '../src/components/report/printHeaderLogoSizing.js';
import { REPORT_PRINT_HEADER } from '../src/components/report/reportPrintHeader.js';

function makeFakeDoc({ straplineWidth }) {
  const logo = {
    tagName: 'IMG',
    style: {},
  };
  const span = {
    getBoundingClientRect: () => ({ width: straplineWidth }),
    cloneNode: () => ({ style: {} }),
  };
  const subDiv = {
    querySelector: (sel) => (sel === 'span' ? span : null),
  };
  const header = {
    children: [logo],
    querySelector: (sel) => {
      if (sel === '.sound-proof-print-header__strapline--sub') return subDiv;
      return null;
    },
  };
  return {
    documentElement: {},
    querySelector: (sel) => (sel === '.sound-proof-print-header' ? header : null),
    _logo: logo,
    _span: span,
  };
}

test('logo width equals the ADI strapline width (1:1)', () => {
  const doc = makeFakeDoc({ straplineWidth: 515 });
  const ok = applyPrintHeaderLogoSizing(doc);
  assert.equal(ok, true);
  assert.equal(doc._logo.style.width, '515px', 'logo width is the strapline width');
  const aspect = REPORT_PRINT_HEADER.logoAspectRatio;
  assert.equal(doc._logo.style.height, `${515 / aspect}px`, 'height preserves the logo aspect ratio');
  assert.equal(doc._logo.style.maxWidth, 'none');
});

test('the width ratio is exactly 1:1 for any strapline width', () => {
  for (const w of [300, 405, 515, 720]) {
    const doc = makeFakeDoc({ straplineWidth: w });
    applyPrintHeaderLogoSizing(doc);
    const logoWidth = parseFloat(doc._logo.style.width);
    const ratio = logoWidth / w;
    assert.ok(Math.abs(ratio - 1) < 0.001, `logo/strapline ratio is 1:1 at ${w}px (got ${ratio})`);
  }
});

test('returns false and leaves the logo untouched when there is no header', () => {
  const doc = { querySelector: () => null };
  assert.equal(applyPrintHeaderLogoSizing(doc), false);
});

test('returns false when the strapline width is not measurable', () => {
  const doc = makeFakeDoc({ straplineWidth: 0 });
  assert.equal(applyPrintHeaderLogoSizing(doc), false);
  assert.equal(doc._logo.style.width, undefined, 'logo is not sized from a zero measurement');
});