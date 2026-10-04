import { reportFirstPageMeta } from './reportFirstPageMeta.js';

// Physical A4 masthead dimensions shared by Visual and Technical exports.
export const REPORT_PRINT_HEADER = Object.freeze({
  logoWidthMm: 62,
  logoAspectRatio: 1024 / 480,
  logoUrl: 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/a8e555dac_Screenshot2025-08-31at135313.jpg',
  logoGapMm: 2,
  titleGapMm: 1.5,
  dividerGapMm: 2,
  bottomGapMm: 3,
});

/**
 * The two brand positioning lines every report cover carries, directly beneath
 * the Sound Proof logo. One source, so the on-screen cover and the exported PDF
 * cover state the same words in the same order.
 */
export const REPORT_STRAPLINE = Object.freeze({
  title: 'Professional Home Cinema Engineering',
  sub: 'Powered by Artcoustic Design Intelligence (ADI)',
});

/**
 * The first-page metadata line for a report's cover: Project · Client ·
 * Version · Reference · Date, composed by the shared builder so the Technical
 * Report, the Visual Report and their exported PDFs state one identity.
 *
 * @param {Object} project - the Project record
 * @param {{number?: number, name?: string}|null} [version] - the design version this report belongs to
 */
export function reportHeaderMetadata(project = {}, version = null) {
  return reportFirstPageMeta(project, version);
}