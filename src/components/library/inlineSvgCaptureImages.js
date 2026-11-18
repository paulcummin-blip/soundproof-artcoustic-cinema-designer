/** SVGs rasterised as images cannot load external image references.
 * Inline the original bytes in the isolated report clone; geometry stays intact.
 */
export async function inlineSvgCaptureImages(scope, signal) {
  const cache = new Map();
  for (const image of scope.querySelectorAll('svg image')) {
    signal?.throwIfAborted();
    const href = image.getAttribute('href') || image.getAttribute('xlink:href');
    if (!href || href.startsWith('data:')) continue;
    if (!cache.has(href)) {
      cache.set(href, (async () => {
        const response = await fetch(new URL(href, scope.baseURI).href, { signal });
        if (!response.ok) throw new Error('Drawing image request failed (' + response.status + '). Retry storage.');
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('Drawing image returned no image. Retry storage.');
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Drawing image could not be read. Retry storage.'));
          reader.readAsDataURL(blob);
        });
      })());
    }
    try {
      const dataUrl = await cache.get(href);
      signal?.throwIfAborted();
      image.setAttribute('href', dataUrl);
      if (image.hasAttribute('xlink:href')) image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', dataUrl);
    } catch (error) {
      const failure = new Error('A speaker drawing image could not be captured. Retry storage. ' + error.message);
      failure.cause = error;
      throw failure;
    }
  }
}
