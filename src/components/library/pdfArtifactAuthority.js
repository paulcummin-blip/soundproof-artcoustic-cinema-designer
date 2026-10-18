/**
 * pdfArtifactAuthority.js
 * -----------------------
 * WHAT MAKES A STORED FILE A DOCUMENT.
 *
 * Project Library stores the exported PDF. Exactly one thing decides whether a
 * document exists: valid PDF bytes. Never a rasterised page, never a thumbnail,
 * never a canvas dimension, never a preview screenshot.
 *
 * The check is deliberately the minimum that can establish the file, and nothing
 * more:
 *
 *   - the value exists
 *   - its byte length is greater than zero
 *   - its first bytes are the PDF signature `%PDF-`
 *
 * The signature is read back from the artifact's own bytes, so a zero-length or
 * truncated upload can never be recorded as a document. Nothing here renders,
 * rasterises, measures a page or touches storage.
 *
 * The two vocabularies below are the only ones used for the preview, and they are
 * stated here so the capture, the stored record and the Library row cannot drift
 * apart.
 *
 * Pure: no DOM, no canvas, no network, no records.
 */

/** The PDF file signature every conforming PDF begins with. */
export const PDF_SIGNATURE = '%PDF-';

/** How the stored PDF's own pages were rendered. */
export const PDF_RENDERING = Object.freeze({
  /** The composed sheets painted as page images — the faithful copy. */
  PAGE_IMAGE: 'page_raster',
  /** The same composed pages rendered as text, because no sheet could be painted. */
  TEXT_VECTOR: 'text_vector',
});

/**
 * What the stored copy's PAGE PREVIEW is.
 *
 * This is a statement about the preview alone. It never says a document is
 * missing: the stored PDF is the document, whatever this says.
 */
export const PREVIEW_STATUS = Object.freeze({
  /** Every sheet has a page image. */
  AVAILABLE: 'available',
  /** Some sheets could not be painted; the rest are stored. */
  PARTIAL: 'partial',
  /** No sheet could be painted: the copy carries the document's text and no page images. */
  UNAVAILABLE: 'unavailable',
});

/** The first bytes of a blob as text, or null when they cannot be read back. */
async function readSignature(blob, length = PDF_SIGNATURE.length) {
  if (!blob || typeof blob.slice !== 'function') return null;
  const head = blob.slice(0, length);
  if (typeof head.text === 'function') {
    try {
      return await head.text();
    } catch {
      // Fall through to the reader below rather than failing the document.
    }
  }
  // An older browser without Blob.text(): the same bytes, read the long way round,
  // so a document is never refused because of how its header was read.
  const FileReaderImpl = typeof FileReader !== 'undefined' ? FileReader : null;
  if (!FileReaderImpl) return null;
  return new Promise((resolve) => {
    const reader = new FileReaderImpl();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsText(head);
  });
}

/**
 * Inspect an artifact against the minimum a document must satisfy.
 *
 * @param {Blob|File|null} blob — the PDF bytes Project Library would store
 * @returns {Promise<{valid: boolean, byteLength: number, signature: string|null, reason: string|null}>}
 */
export async function inspectPdfArtifact(blob) {
  if (!blob) {
    return { valid: false, byteLength: 0, signature: null, reason: 'No PDF was produced, so there is no document to store.' };
  }
  const byteLength = Number(blob.size) || 0;
  if (byteLength <= 0) {
    return { valid: false, byteLength, signature: null, reason: 'The PDF is empty (zero bytes).' };
  }
  const signature = await readSignature(blob);
  if (signature === null) {
    return { valid: false, byteLength, signature: null, reason: 'The PDF bytes could not be read back, so the file cannot be verified.' };
  }
  if (!signature.startsWith(PDF_SIGNATURE)) {
    return {
      valid: false,
      byteLength,
      signature,
      reason: `The stored file is not a PDF: it begins with "${signature}".`,
    };
  }
  return { valid: true, byteLength, signature, reason: null };
}

/**
 * The verified artifact, or a thrown error carrying the report.
 *
 * @throws {Error} with `pdfArtifact` holding the inspection report
 */
export async function assertPdfArtifact(blob) {
  const report = await inspectPdfArtifact(blob);
  if (report.valid) return report;
  const error = new Error(report.reason || 'The exported PDF could not be verified.');
  error.pdfArtifact = report;
  throw error;
}

export default inspectPdfArtifact;