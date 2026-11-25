/** SVGs rasterised as images cannot load external image references.
 * Inline the original bytes in the isolated report clone; geometry stays intact.
 */
// Some existing branding files are served as application/octet-stream.
// Recognise their binary image signature, retaining every original byte.
export async function captureImageBlob(blob) {
  if (blob.type.startsWith('image/')) return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let type = null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) type = 'image/jpeg';
  else if ([137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) type = 'image/png';
  else if (String.fromCharCode(...bytes.slice(0,6)).match(/^GIF8[79]a$/)) type = 'image/gif';
  else if (String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') type = 'image/webp';
  if (!type) throw new Error('Drawing image returned no image. Retry storage.');
  return new Blob([bytes], { type });
}

export async function inlineSvgCaptureImages(scope, signal, { includeHtmlImages = false } = {}) {
  const cache = new Map();
  for (const image of scope.querySelectorAll(includeHtmlImages ? 'svg image, img' : 'svg image')) {
    signal?.throwIfAborted();
    const isHtmlImage = image.tagName?.toLowerCase() === 'img';
    const href = isHtmlImage
      ? image.currentSrc || image.getAttribute('src')
      : image.getAttribute('href') || image.getAttribute('xlink:href');
    if (!href || href.startsWith('data:')) continue;
    if (!cache.has(href)) {
      cache.set(href, (async () => {
        const response = await fetch(new URL(href, scope.baseURI).href, { signal });
        if (!response.ok) throw new Error('Drawing image request failed (' + response.status + '). Retry storage.');
        const blob = await captureImageBlob(await response.blob());
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
      if (isHtmlImage) {
        // Preserve the selected image's original bytes once for every page.
        // html2canvas otherwise creates a fresh image request for each raster.
        image.removeAttribute('srcset');
        image.setAttribute('src', dataUrl);
        if (typeof image.decode === 'function') await image.decode();
      } else {
        image.setAttribute('href', dataUrl);
        if (image.hasAttribute('xlink:href')) image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', dataUrl);
      }
    } catch (error) {
      const failure = new Error((includeHtmlImages ? 'A report image could not be captured. Retry PDF creation. ' : 'A speaker drawing image could not be captured. Retry storage. ') + error.message);
      failure.cause = error;
      throw failure;
    }
  }
}
