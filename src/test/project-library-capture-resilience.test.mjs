/**
 * project-library-capture-resilience.test.mjs
 * -------------------------------------------
 * ACCEPTANCE — a Project Library storage attempt must not be lost to ONE page's
 * raster failure, and it must never invent a document either.
 *
 * BOUNDARY. The orchestration is exercised with the two raster passes handed in as
 * stubs (`rasterPage`, `rasterAll`), exactly as the capture calls them: no
 * browser, no html2canvas, no storage and no PDF. The scale rule is exercised with
 * real page geometry (A4 at 96 dpi) and against the pixel budget the capture uses.
 */
import { describe, it, expect, vi } from 'vitest';

import {
  collectPageRasters,
  isZeroSizePageFailure,
} from '../components/library/libraryCaptureResilience.js';
import {
  MAX_CAPTURE_PIXELS,
  MIN_RENDER_SCALE,
  PREFERRED_RENDER_SCALE,
  resolveCaptureScale,
} from '../components/library/compositionPageRaster.js';

/** An A4 sheet at 96 dpi — the proposal pack's own page geometry. */
const A4 = { widthPx: 793.7, heightPx: 1122.5 };

const pages = ['cover', 'glossary', 'summary'];

/** A raster the capture would return: a real PNG data URL, with its size. */
const raster = (index) => ({
  dataUrl: `data:image/png;base64,PAGE${index}`,
  width: 1587,
  height: 2245,
  scale: 2,
});

/** A page capture failure carrying the diagnostics the capture really attaches. */
const pageFailure = (operation, { zeroSize = false, message = 'the page failed' } = {}) => {
  const error = new Error(`Library capture page 1 (untitled), ${operation}: ${message}`);
  error.captureDiagnostics = { operation, zeroSize, pageNumber: 1, heading: null };
  return error;
};

describe('Project Library capture resilience', () => {
  it('1. valid PNG data — every page is stored and no fallback is used', async () => {
    const rasterAll = vi.fn();
    const { rasters, diagnostics } = await collectPageRasters({
      pages,
      rasterPage: async (_page, index) => raster(index),
      rasterAll,
    });

    expect(rasters.map((entry) => entry.dataUrl)).toEqual([
      'data:image/png;base64,PAGE0',
      'data:image/png;base64,PAGE1',
      'data:image/png;base64,PAGE2',
    ]);
    expect(rasterAll).not.toHaveBeenCalled();
    expect(diagnostics.fallback).toBe('none');
    expect(diagnostics.failed).toEqual([]);
  });

  it('2. PNG capture returns data:, — the page is recovered from the whole composition', async () => {
    const { rasters, diagnostics } = await collectPageRasters({
      pages,
      rasterPage: async (_page, index) => {
        if (index === 0) throw pageFailure('png_validation', { message: 'Canvas did not return PNG data (an empty or over-limit canvas returns data:,).' });
        return raster(index);
      },
      rasterAll: async () => pages.map((_page, index) => raster(index)),
    });

    expect(rasters.filter(Boolean).length).toBe(3);
    expect(diagnostics.fallback).toBe('composition_raster_fallback');
    expect(diagnostics.recovered).toEqual([{ page: 1, fromOperation: 'png_validation' }]);
    expect(diagnostics.failed).toEqual([]);
  });

  it('3. PNG capture throws — the page is still recovered, storage is not abandoned', async () => {
    const { rasters, diagnostics } = await collectPageRasters({
      pages,
      rasterPage: async (_page, index) => {
        if (index === 1) throw pageFailure('page_raster', { message: "Failed to execute 'drawImage' on 'CanvasRenderingContext2D'." });
        return raster(index);
      },
      rasterAll: async () => pages.map((_page, index) => raster(index)),
    });

    expect(rasters[1]).toEqual(raster(1));
    expect(diagnostics.recovered).toEqual([{ page: 2, fromOperation: 'page_raster' }]);
    expect(diagnostics.failed).toEqual([]);
  });

  it('4. a page element that measures nothing is skipped, and the rest is stored', async () => {
    const rasterAll = vi.fn();
    const { rasters, diagnostics } = await collectPageRasters({
      pages,
      rasterPage: async (_page, index) => {
        if (index === 0) throw pageFailure('page_dimensions', { zeroSize: true, message: 'The page measures nothing (0 × 0 px).' });
        return raster(index);
      },
      rasterAll,
    });

    expect(rasters[0]).toBe(null);
    expect(rasters[1]).toEqual(raster(1));
    expect(rasters[2]).toEqual(raster(2));
    expect(diagnostics.skipped).toEqual([{ page: 1, reason: 'page_measures_nothing' }]);
    // A page that paints nothing is not a failed page: no fallback is spent on it.
    expect(rasterAll).not.toHaveBeenCalled();
    expect(diagnostics.failed).toEqual([]);
  });

  it('5. a document whose every page measures nothing is refused, named as no raster', async () => {
    await expect(collectPageRasters({
      pages,
      rasterPage: async () => { throw pageFailure('page_dimensions', { zeroSize: true }); },
      rasterAll: async () => pages.map(() => null),
    })).rejects.toMatchObject({
      captureDiagnostics: {
        operation: 'library_page_capture',
        failed: [{ operation: 'no_page_rasterised' }],
      },
    });
  });

  it('6. a page neither pass can rasterise stops storage, naming the page and the operation', async () => {
    await expect(collectPageRasters({
      pages,
      rasterPage: async (_page, index) => {
        if (index === 2) throw pageFailure('png_validation', { message: 'Canvas did not return PNG data.' });
        return raster(index);
      },
      rasterAll: async () => [raster(0), raster(1), null],
    })).rejects.toMatchObject({
      message: expect.stringContaining('Library capture page 3'),
      captureDiagnostics: {
        failed: [{ page: 3, operation: 'png_validation' }],
        recovered: [],
      },
    });
  });

  it('7. a zero-size failure is told apart from a real raster failure', () => {
    expect(isZeroSizePageFailure(pageFailure('page_dimensions', { zeroSize: true }))).toBe(true);
    expect(isZeroSizePageFailure(pageFailure('png_validation'))).toBe(false);
    expect(isZeroSizePageFailure(new Error('no diagnostics'))).toBe(false);
  });
});

describe('Project Library capture scale clamp', () => {
  it('an A4 sheet keeps the preferred scale', () => {
    expect(resolveCaptureScale(A4)).toBe(PREFERRED_RENDER_SCALE);
  });

  it('a page too large for the pixel budget is rasterised at a lower, legible scale', () => {
    const widthPx = 2000;
    const heightPx = 3000;
    const scale = resolveCaptureScale({ widthPx, heightPx });
    expect(scale).toBeLessThan(PREFERRED_RENDER_SCALE);
    expect(scale).toBeGreaterThanOrEqual(MIN_RENDER_SCALE);
    // The clamped canvas stays inside the budget the capture declares.
    expect(widthPx * scale * heightPx * scale).toBeLessThanOrEqual(MAX_CAPTURE_PIXELS);
  });

  it('a page beyond even the floor scale is never reduced below legibility', () => {
    const widthPx = 40000;
    const heightPx = 60000;
    const scale = resolveCaptureScale({ widthPx, heightPx });
    expect(scale).toBe(MIN_RENDER_SCALE);
    // Legibility wins over the budget at the floor: the canvas is larger than the
    // budget, and still far inside the browser's own canvas ceiling.
    expect(widthPx * scale * heightPx * scale).toBeGreaterThan(MAX_CAPTURE_PIXELS);
  });

  it('an unmeasured page takes the preferred scale rather than a guess', () => {
    expect(resolveCaptureScale({ widthPx: 0, heightPx: 0 })).toBe(PREFERRED_RENDER_SCALE);
    expect(resolveCaptureScale()).toBe(PREFERRED_RENDER_SCALE);
  });
});