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

export function reportHeaderMetadata(project = {}) {
  return [project.name, project.project_reference?.trim() ? `Ref: ${project.project_reference.trim()}` : null]
    .filter(Boolean).join(' · ');
}