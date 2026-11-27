// Client-side first-page PDF thumbnail + page-count renderer for the
// Education Library bookshelf. Runs in the administrator's browser at upload
// and replace time (and on demand for recovery), so the persisted thumbnail
// lets the shelf load quickly without re-rendering every full PDF on each
// page open.
//
// The thumbnail is stored PRIVATELY (the caller passes an UploadPrivateFile
// function); readers mint a short-lived signed URL to display it, keeping the
// cover behind the login wall alongside the full PDF.
//
// Uses pdfjs-dist (installed). The worker is loaded via Vite's ?url import so
// it bundles as an asset.

import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Render width in CSS pixels for the thumbnail. High enough for a crisp cover,
// low enough to keep the persisted JPEG small.
const TARGET_RENDER_WIDTH = 600;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Thumbnail encoding failed.'))),
      type,
      quality,
    );
  });
}

/**
 * Render the first page of a PDF File/Blob to a JPEG thumbnail and read the
 * page count. Returns { thumbnailBlob, pageCount }.
 *
 * Throws if the PDF cannot be opened or rendered; the caller should treat a
 * throw as "thumbnail generation failed" and proceed with a placeholder.
 */
export async function renderPdfFirstPage(file) {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(3, TARGET_RENDER_WIDTH / baseViewport.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext('2d');
  // White background so transparent-page PDFs render as paper, not black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const thumbnailBlob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
  try {
    await pdf.cleanup();
    await pdf.destroy();
  } catch {
    // cleanup is best-effort
  }
  return { thumbnailBlob, pageCount };
}

/**
 * Convenience: render + upload the thumbnail to private storage, returning
 * { thumbnailFileUri, pageCount }. thumbnailFileUri is null if rendering or
 * upload failed.
 *
 * uploadPrivateFile is a function (imgFile) => Promise<{ file_uri }>, normally
 * `(imgFile) => base44.integrations.Core.UploadPrivateFile({ file: imgFile })`.
 */
export async function generatePdfThumbnail(file, uploadPrivateFile) {
  let thumbnailBlob = null;
  let pageCount = null;
  try {
    const result = await renderPdfFirstPage(file);
    thumbnailBlob = result.thumbnailBlob;
    pageCount = result.pageCount;
  } catch (err) {
    // Rendering failed — caller proceeds with a placeholder.
    console.warn('[education] thumbnail render failed:', err?.message || err);
  }
  let thumbnailFileUri = null;
  if (thumbnailBlob) {
    try {
      const imgFile = new File([thumbnailBlob], 'education-thumbnail.jpg', {
        type: 'image/jpeg',
      });
      const up = await uploadPrivateFile(imgFile);
      thumbnailFileUri = up?.file_uri || null;
    } catch (err) {
      console.warn('[education] thumbnail upload failed:', err?.message || err);
    }
  }
  return { thumbnailFileUri, pageCount };
}