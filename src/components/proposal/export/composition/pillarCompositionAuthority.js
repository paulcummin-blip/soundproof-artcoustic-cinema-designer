/**
 * pillarCompositionAuthority.js
 * -----------------------------
 * THE THREE PILLARS ARE ONE COMPOSITION GROUP.
 *
 * Spatial Resolution, Dynamic Range and Timbre Matching are one account of the
 * design, read under one shared heading. They are never paginated independently:
 * the layout chooses between the approved compositions below, using the measured
 * height of each pillar block and the area the accompanying image reserves — it
 * does not flow the three blocks and then give the image whatever is left.
 *
 * The approved compositions:
 *
 *   A  ALL THREE TOGETHER — the three blocks fit one sheet comfortably, and the
 *      image takes the sheet that follows at its reserved size.
 *   B  TWO + ONE WITH THE IMAGE — two blocks on the first sheet; the third block
 *      shares the next sheet with the image, which holds the lower part of it at
 *      its reserved size. The treatment a full-width interior image and copy of
 *      this length call for.
 *   C  ONE + IMAGE / TWO + IMAGE — only where more than one image is available
 *      and the measured blocks support it: one block with an image, then the
 *      remaining two with the other.
 *
 * WHICH ONE IS USED IS NOT DECIDED HERE. The measured compositor already
 * measures every block and every reserved image area, and allocates sheets by
 * measured height (fewest sheets, then least blank space), so the composition it
 * realises is read here and named — the same measurement decides, and this
 * module reports which approved composition that measurement produced. A page
 * plan that is none of the three is reported as unplanned rather than forced
 * into a label.
 *
 * Pure: reads page records, no DOM, no allocation.
 */

import { PILLAR_SECTION_TYPES } from '@/components/proposal/print/editorialComposition';

export const PILLAR_COMPOSITION = Object.freeze({
  ALL_THREE: 'A',
  TWO_THEN_ONE_WITH_IMAGE: 'B',
  ONE_WITH_IMAGE_THEN_TWO: 'C',
});

export const PILLAR_COMPOSITION_NOTE = Object.freeze({
  A: 'All three structures on one sheet; the image takes the following sheet at its reserved size.',
  B: 'Two structures on the first sheet; the third shares the next sheet with the image.',
  C: 'One structure with an image, then the remaining two with the other image.',
});

/** Whether a section type is one of the three presented structures. */
export function isPillarType(sectionType) {
  return PILLAR_SECTION_TYPES.includes(String(sectionType || ''));
}

/** The pillar types a page record carries, in document order. */
export function pillarTypesOf(page) {
  const listed = Array.isArray(page?.sections) ? page.sections : [];
  return listed.filter(isPillarType);
}

/** Whether a page record carries a full-width image at its reserved size. */
function hasFullWidth(page) {
  return (page?.roles || []).includes('full_width');
}

/**
 * The sheets the pillar group was composed on, in document order.
 *
 * @param {Array} pages — page records from the composition inventory
 */
export function pillarSheets(pages = []) {
  const list = Array.isArray(pages) ? pages : [];
  const sheets = list.filter((page) => pillarTypesOf(page).length > 0 || hasFullWidth(page));
  if (!sheets.length) return [];
  const first = list.findIndex((page) => pillarTypesOf(page).length > 0);
  if (first < 0) return [];
  // The group runs from the first pillar sheet to the last sheet that carries a
  // reserved full-width image before the document's next designed page.
  const last = sheets[sheets.length - 1];
  return list.slice(first, list.indexOf(last) + 1);
}

/**
 * Which approved composition the composition produced, or null where the
 * document carries no pillar group at all.
 *
 * @param {Array} pages — page records from the composition inventory
 * @returns {{ composition: string|null, note: string|null, sheets: Array<{ page: number, pillars: string[], fullWidth: boolean }> }}
 */
export function classifyPillarComposition(pages = []) {
  const sheets = pillarSheets(pages);
  if (!sheets.length) return { composition: null, note: null, sheets: [] };
  const shape = sheets.map((page) => ({
    page: page.page,
    pillars: pillarTypesOf(page),
    fullWidth: hasFullWidth(page),
  }));
  const pillarOnly = shape.filter((sheet) => sheet.pillars.length > 0);
  const opening = pillarOnly[0];
  let composition = null;
  if (opening && opening.pillars.length >= PILLAR_SECTION_TYPES.length && !opening.fullWidth) {
    composition = PILLAR_COMPOSITION.ALL_THREE;
  } else if (opening && opening.pillars.length === 2) {
    const withImage = pillarOnly.find((sheet) => sheet !== opening
      && sheet.pillars.length >= 1 && sheet.fullWidth);
    if (withImage) composition = PILLAR_COMPOSITION.TWO_THEN_ONE_WITH_IMAGE;
  } else if (opening && opening.pillars.length === 1 && opening.fullWidth) {
    const second = pillarOnly[1];
    if (second && second.pillars.length >= 2) composition = PILLAR_COMPOSITION.ONE_WITH_IMAGE_THEN_TWO;
  }
  return {
    composition,
    note: composition ? PILLAR_COMPOSITION_NOTE[composition] : null,
    sheets: shape,
  };
}

export default classifyPillarComposition;