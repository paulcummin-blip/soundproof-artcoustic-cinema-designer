import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineSvgCaptureImages } from '../components/library/inlineSvgCaptureImages.js';
test('capture embeds each external SVG image once without changing geometry', async () => {
  const oldFetch = globalThis.fetch, oldReader = globalThis.FileReader;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, blob: async () => ({ type: 'image/png' }) }; };
  globalThis.FileReader = class { readAsDataURL() { this.result = 'data:image/png;base64,aGVsbG8='; this.onload(); } };
  const makeImage = () => {
    const attrs = { href: 'https://example.test/speaker.png', width: '300', height: '450' };
    return { attrs, getAttribute: k => attrs[k], setAttribute: (k,v) => {attrs[k]=v;}, hasAttribute: k => k in attrs };
  };
  try {
    const images = [makeImage(), makeImage()];
    await inlineSvgCaptureImages({ querySelectorAll: () => images, baseURI: 'https://example.test/' });
    assert.equal(calls, 1);
    for (const image of images) {
      assert.match(image.attrs.href, /^data:image\/png/);
      assert.equal(image.attrs.width, '300'); assert.equal(image.attrs.height, '450');
    }
    globalThis.fetch = async () => ({ ok: false, status: 403 });
    await assert.rejects(inlineSvgCaptureImages({ querySelectorAll: () => [makeImage()] }), /speaker drawing image.*Retry storage/);
  } finally { globalThis.fetch = oldFetch; globalThis.FileReader = oldReader; }
});
