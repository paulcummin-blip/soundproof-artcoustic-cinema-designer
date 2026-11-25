import test from 'node:test';
import assert from 'node:assert/strict';
import { captureImageBlob, inlineSvgCaptureImages } from '../components/library/inlineSvgCaptureImages.js';
test('binary-typed JPEG keeps every original byte; non-images remain rejected', async () => {
  const bytes = new Uint8Array([255,216,255,224,0,1,2,3]);
  const result = await captureImageBlob(new Blob([bytes], { type: 'application/octet-stream' }));
  assert.equal(result.type, 'image/jpeg');
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), bytes);
  await assert.rejects(captureImageBlob(new Blob(['<html>error</html>'], { type: 'text/html' })), /no image/);
});
test('repeated HTML logos fetch once and decode without resizing or re-encoding', async () => {
  const previousFetch = globalThis.fetch, previousReader = globalThis.FileReader;
  let requests = 0, decodes = 0;
  globalThis.fetch = async () => { requests++; return { ok: true, blob: async () => new Blob([new Uint8Array([255,216,255,224])], { type: 'application/octet-stream' }) }; };
  globalThis.FileReader = class { readAsDataURL(blob) { assert.equal(blob.type, 'image/jpeg'); this.result = 'data:image/jpeg;base64,/9j/4A=='; this.onload(); } };
  const images = Array.from({length: 34}, () => {
    const attrs = { src: '/logo.jpg', width: '200', height: '80' };
    return { tagName: 'IMG', attrs, getAttribute: key => attrs[key], setAttribute: (key,value) => { attrs[key] = value; }, removeAttribute: key => { delete attrs[key]; }, decode: async () => { decodes++; } };
  });
  try {
    await inlineSvgCaptureImages({ baseURI: 'https://example.test/', querySelectorAll: selector => { assert.equal(selector, 'svg image, img'); return images; } }, null, { includeHtmlImages: true });
    assert.equal(requests, 1); assert.equal(decodes, 34);
    for (const image of images) { assert.match(image.attrs.src, /^data:image\/jpeg/); assert.equal(image.attrs.width, '200'); assert.equal(image.attrs.height, '80'); }
  } finally { globalThis.fetch = previousFetch; globalThis.FileReader = previousReader; }
});
