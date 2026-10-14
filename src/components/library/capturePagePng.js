import html2canvas from 'html2canvas';

/** Inspect the exact canvas encoding handed to jsPDF, without changing it. */
export function inspectCanvasPng(dataUrl) {
  const prefix = String(dataUrl || '').split(',')[0];
  if (prefix !== 'data:image/png;base64') {
    return { valid: false, prefix, reason: 'Canvas did not return PNG data (an empty or over-limit canvas returns data:,).' };
  }
  const bytes = atob(dataUrl.slice(prefix.length + 1));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes.charCodeAt(index) === value)) {
    return { valid: false, prefix, byteLength: bytes.length, reason: 'Missing PNG signature.' };
  }
  const uint32 = (offset) => ((bytes.charCodeAt(offset) * 16777216)
    + (bytes.charCodeAt(offset + 1) << 16) + (bytes.charCodeAt(offset + 2) << 8)
    + bytes.charCodeAt(offset + 3));
  let offset = 8;
  let width = null;
  let height = null;
  let hasData = false;
  let hasHeader = false;
  while (offset + 12 <= bytes.length) {
    const size = uint32(offset);
    const type = bytes.slice(offset + 4, offset + 8);
    const end = offset + size + 12;
    if (end > bytes.length) {
      return { valid: false, prefix, byteLength: bytes.length, width, height, reason: `Truncated ${type} chunk at byte ${offset}: ends at ${end}.` };
    }
    if (type === 'IHDR' && size === 13) {
      hasHeader = true;
      width = uint32(offset + 8);
      height = uint32(offset + 12);
    }
    if (type === 'IDAT') hasData = true;
    if (type === 'IEND') {
      const valid = hasHeader && width > 0 && height > 0 && hasData && size === 0 && end === bytes.length;
      return { valid, prefix, byteLength: bytes.length, width, height, reason: valid ? null : 'Invalid PNG dimensions, data, or closing chunk.' };
    }
    offset = end;
  }
  return { valid: false, prefix, byteLength: bytes.length, width, height, reason: 'PNG has no complete IEND chunk.' };
}

/** Preserve stage and page identity even when capture fails before a PDF exists. */
export function pageCaptureFailure(error, diagnostics) {
  const failure = new Error(`Library capture page ${diagnostics.pageNumber} (${diagnostics.heading || 'untitled'}), ${diagnostics.operation}: ${error?.message || error}`);
  failure.cause = error;
  failure.captureDiagnostics = diagnostics;
  return failure;
}

export default async function capturePagePng(element, pageNumber, options) {
  const diagnostics = {
    pageNumber,
    heading: element.querySelector('.pp-header__title')?.textContent?.trim() || null,
    pageClasses: element.className,
    producer: 'html2canvas page raster → canvas.toDataURL(image/png)',
    sourceImages: Array.from(element.querySelectorAll('img')).map((image) => ({
      src: image.getAttribute('src'), complete: image.complete,
      naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
    })),
    operation: 'page_raster',
  };
  let canvas;
  let dataUrl;
  try {
    // A page that measures nothing produces a 0 × 0 canvas, and toDataURL on that
    // canvas returns "data:," — an error with no measurement in it. It is named
    // here instead, so a capture can tell "nothing to draw" from "failed to draw".
    const rect = element?.getBoundingClientRect?.();
    diagnostics.pageWidth = Math.round((Number(rect?.width) || 0) * 100) / 100;
    diagnostics.pageHeight = Math.round((Number(rect?.height) || 0) * 100) / 100;
    if (diagnostics.pageWidth <= 0 || diagnostics.pageHeight <= 0) {
      diagnostics.operation = 'page_dimensions';
      diagnostics.zeroSize = true;
      throw new Error(`The page measures nothing (${diagnostics.pageWidth} × ${diagnostics.pageHeight} px).`);
    }
    canvas = await html2canvas(element, options);
    diagnostics.canvasWidth = canvas.width;
    diagnostics.canvasHeight = canvas.height;
    diagnostics.operation = 'canvas_dimensions';
    // The raster itself is checked before it is encoded: an empty canvas is
    // reported as an empty canvas, not as a mysterious missing PNG.
    if (!(canvas.width > 0) || !(canvas.height > 0)) {
      throw new Error(`The page raster came back as a ${canvas.width} × ${canvas.height} canvas.`);
    }
    diagnostics.operation = 'png_encoding';
    dataUrl = canvas.toDataURL('image/png');
    diagnostics.operation = 'png_validation';
    diagnostics.png = inspectCanvasPng(dataUrl);
    if (!diagnostics.png.valid) throw new Error(diagnostics.png.reason);
  } catch (error) {
    throw pageCaptureFailure(error, diagnostics);
  }
  return { canvas, dataUrl, diagnostics };
}