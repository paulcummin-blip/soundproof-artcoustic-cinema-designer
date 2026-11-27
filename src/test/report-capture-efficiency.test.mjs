import { test, vi } from 'vitest';
import html2canvas from 'html2canvas';
import { rasteriseCompositionPages } from '../components/library/compositionPageRaster.js';

vi.mock('html2canvas', () => ({ default: vi.fn() }));
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { collectPageRasters } from '../components/library/libraryCaptureResilience.js';

test('an expired capture stops before another page or a full-composition fallback', async () => {
  const controller = new AbortController();
  let pages = 0, fallback = 0;
  await assert.rejects(collectPageRasters({
    pages: [1, 2, 3], signal: controller.signal,
    rasterPage: async () => {
      pages++;
      controller.abort(new Error('capture expired'));
      throw new Error('page interrupted');
    },
    rasterAll: async () => { fallback++; return []; },
  }), /capture expired/);
  assert.equal(pages, 1);
  assert.equal(fallback, 0);
});

test('a page raster excludes sibling sheets while retaining its own content and ancestors', async () => {
  let source = await fs.readFile(new URL('../components/library/compositionPageRaster.js', import.meta.url), 'utf8');
  source = source.replace("import capturePagePng, { inspectCanvasPng } from '@/components/library/capturePagePng';",
    'const capturePagePng = async (element, number, options) => options; const inspectCanvasPng = () => ({});');
  const { rasterisePage } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const child = { matches: () => true, contains: () => false };
  const page = { matches: () => true, contains: node => node === child };
  const ancestor = { matches: () => true, contains: node => node === page };
  const sibling = { matches: () => true, contains: () => false };
  const styles = { matches: () => false, contains: () => false };
  const options = await rasterisePage(page, { pageSelector: '.page', pageNumber: 2, scale: 2, windowWidth: 700, windowHeight: 30000 });
  assert.equal(options.ignoreElements(sibling), true);
  for (const node of [page, child, ancestor, styles]) assert.equal(options.ignoreElements(node), false);
  assert.equal(options.scale, 2, 'image quality is unchanged');
});

test('fallback encodes only missing sheets in their original positions and releases its canvases', async () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT90AAAAASUVORK5CYII=';
  const pages = Array.from({ length: 3 }, (_, top) => ({
    getBoundingClientRect: () => ({ left: 0, top, width: 1, height: 1 }),
  }));
  const source = { width: 1, height: 3, toDataURL: vi.fn() };
  const slices = [];
  const offsets = [];
  const container = {
    className: '', querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 3 }),
    ownerDocument: { createElement: () => {
      const slice = {
        getContext: () => ({ drawImage: (_canvas, _x, y) => offsets.push(y) }),
        toDataURL: () => png,
      };
      slices.push(slice);
      return slice;
    } },
  };
  html2canvas.mockResolvedValueOnce(source);
  const result = await collectPageRasters({
    pages,
    rasterPage: async (_page, index) => {
      if (index !== 1) throw new Error('controlled failure');
      return { dataUrl: 'first pass' };
    },
    rasterAll: indices => rasteriseCompositionPages(container, pages, { unresolvedIndices: indices, scale: 1 }),
  });
  assert.deepEqual(offsets, [0, 2]);
  assert.deepEqual(result.rasters.map(raster => raster.dataUrl), [png, 'first pass', png]);
  assert.equal(source.toDataURL.mock.calls.length, 0);
  for (const canvas of [source, ...slices]) assert.deepEqual([canvas.width, canvas.height], [0, 0]);
});
