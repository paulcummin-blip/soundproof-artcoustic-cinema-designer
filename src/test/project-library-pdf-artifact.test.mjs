/**
 * project-library-pdf-artifact.test.mjs
 * -------------------------------------
 * ACCEPTANCE — the stored PDF is the document, and only the PDF decides that a
 * document exists.
 *
 * BOUNDARY. jsPDF is stubbed, so the one PDF authority and the text render are
 * exercised without a browser, a canvas or a print dialog. Nothing here asserts a
 * raster, a thumbnail or a page image: those are the preview, and the whole point
 * of this suite is that they never decide whether a document is stored.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('jspdf', () => ({ jsPDF: class {} }));

const {
  PDF_SIGNATURE,
  PDF_RENDERING,
  PREVIEW_STATUS,
  inspectPdfArtifact,
  assertPdfArtifact,
} = await import('../components/library/pdfArtifactAuthority.js');
const { pdfSafeText, renderTextPagesToPdf } = await import('../components/library/compositionTextPdf.js');

/** A PDF blob, as the capture hands it to storage. */
const pdfBlob = (bytes = '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n') => new Blob([bytes], { type: 'application/pdf' });

/** A recording stand-in for a jsPDF instance. */
const pdfStub = (lines = 1) => {
  const calls = { addPage: 0, text: [], fonts: [] };
  return {
    calls,
    addPage() { calls.addPage += 1; },
    setFont(name, style) { calls.fonts.push(`${name}:${style}`); },
    setFontSize() {},
    splitTextToSize: (text) => Array.from({ length: lines }, (_entry, index) => `${text} ${index}`),
    text(line, x, y) { calls.text.push({ line, x, y }); },
  };
};

/** One leaf element, as readPageTextBlocks reads it out of the capture document. */
const leaf = (text) => ({
  children: [],
  textContent: text,
  getBoundingClientRect: () => ({ top: 0, left: 0, width: 120, height: 12 }),
});

/** A composed page carrying one block of copy. */
const page = (text) => ({ querySelectorAll: () => [leaf(text)], ownerDocument: null });

describe('PDF artifact authority', () => {
  it('1. valid PDF bytes are a document, on their own three facts only', async () => {
    const report = await inspectPdfArtifact(pdfBlob());
    expect(report.valid).toBe(true);
    expect(report.byteLength).toBeGreaterThan(0);
    expect(report.signature.startsWith(PDF_SIGNATURE)).toBe(true);
    // No raster, thumbnail, canvas or page count is part of the verdict.
    expect(Object.keys(report).sort()).toEqual(['byteLength', 'reason', 'signature', 'valid']);
  });

  it('2. no PDF at all is refused — that is the only missing-document case', async () => {
    const report = await inspectPdfArtifact(null);
    expect(report.valid).toBe(false);
    expect(report.byteLength).toBe(0);
  });

  it('3. a zero-byte artifact is refused', async () => {
    const report = await inspectPdfArtifact(new Blob([], { type: 'application/pdf' }));
    expect(report.valid).toBe(false);
    expect(report.reason).toContain('empty');
  });

  it('4. bytes that are not a PDF are refused, and said so with the signature found', async () => {
    const report = await inspectPdfArtifact(new Blob(['<html>not a pdf</html>']));
    expect(report.valid).toBe(false);
    expect(report.reason).toContain('<html');
  });

  it('5. assertPdfArtifact passes valid bytes through and throws on nothing', async () => {
    await expect(assertPdfArtifact(pdfBlob())).resolves.toMatchObject({ valid: true });
    const failure = await assertPdfArtifact(new Blob([''])).catch((error) => error);
    expect(failure).toBeTruthy();
    expect(failure.pdfArtifact.valid).toBe(false);
  });

  it('6. the vocabularies are the ones the record and the Library row state', () => {
    expect(PDF_RENDERING).toEqual({ PAGE_IMAGE: 'page_raster', TEXT_VECTOR: 'text_vector' });
    expect(PREVIEW_STATUS).toEqual({ AVAILABLE: 'available', PARTIAL: 'partial', UNAVAILABLE: 'unavailable' });
  });
});

describe('the text copy of the composed pages', () => {
  it('7. the document’s own characters are kept, and nothing unrenderable is drawn', () => {
    expect(pdfSafeText('Sub 12 → ±0 dB · 3 × 2.35:1 · 20 °C')).toBe('Sub 12 ±0 dB · 3 × 2.35:1 · 20 °C');
    expect(pdfSafeText('Bass — “quoted” … café')).toBe('Bass - "quoted" ... café');
    expect(pdfSafeText('score 98\uD83C\uDFA5')).toBe('score 98');
    expect(pdfSafeText(null)).toBe('');
  });

  it('8. every composed page gets its own sheet, in the document’s own order', () => {
    const pdf = pdfStub();
    const result = renderTextPagesToPdf(
      pdf,
      [page('Cover'), page('System Options Summary'), page('Overall Design')],
      { widthMm: 210, heightMm: 297, marginMm: 12 },
    );

    expect(result.pageCount).toBe(3);
    expect(pdf.calls.addPage).toBe(2);
    expect(pdf.calls.text.map((entry) => entry.line)).toEqual([
      'Cover 0',
      'System Options Summary 0',
      'Overall Design 0',
    ]);
    expect(result.continuations).toBe(0);
  });

  it('9. a sheet whose copy does not fit continues onto a further sheet rather than dropping it', () => {
    const pdf = pdfStub(120);
    const result = renderTextPagesToPdf(
      pdf,
      [page('a long page of copy')],
      { widthMm: 210, heightMm: 297, marginMm: 12 },
    );

    // Nothing is lost: the overflow is written, and stated as a continuation.
    expect(result.pageCount).toBeGreaterThan(1);
    expect(result.continuations).toBeGreaterThan(0);
    expect(pdf.calls.text.length).toBe(120);
  });
});