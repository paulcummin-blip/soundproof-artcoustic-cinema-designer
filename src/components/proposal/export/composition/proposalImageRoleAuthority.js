/**
 * proposalImageRoleAuthority.js
 * -----------------------------
 * THE LIBRARY ROLE AS LAYOUT AUTHORITY.
 *
 * The designer already states, on each image's own Library card, how that image
 * is meant to be presented in the proposal: FULL WIDTH, DETAIL or CROPPED DETAIL.
 * That choice is metadata the document must obey, and this module is the one
 * place it is turned into a layout requirement.
 *
 *   FULL WIDTH      a major page element. It is composed at the full content
 *                   width and reserves a substantial share of the page: never a
 *                   thumbnail, never a narrow centred image, never what is left
 *                   over after the text has taken its space. Where the copy and
 *                   the image cannot both have their room, the COPY MOVES.
 *   DETAIL          the supporting presentation: smaller, and where it is a
 *                   drawing it is shown whole (never cropped). It keeps a
 *                   reserved share of the page too, so supporting material is
 *                   still large enough to be read.
 *   CROPPED DETAIL  the same reserved share as DETAIL, with cropping permitted.
 *
 * UNSTATED IS NOT A ROLE. An image with nothing recorded keeps exactly the
 * behaviour it had before this field existed: the legacy floor below, which is
 * the smallest the compositor has ever reduced a photograph to. Nothing is
 * re-composed merely because a field was added.
 *
 * The share is a MINIMUM RESERVED AREA, not a target height: a photograph whose
 * own proportions already give it more room keeps it, nothing is ever upscaled,
 * and nothing is cropped to reach the floor.
 *
 * Pure: reads element metadata, measures nothing, allocates nothing.
 */

import { IMAGE_PRESENTATION, PRESENTATION_WIDTH_PERCENT } from '@/components/proposal/images/proposalImagePlacementAuthority';

/**
 * The smallest a photograph has ever been reduced to. An image with no Library
 * role recorded keeps this floor, so the module changes nothing for it.
 */
export const LEGACY_MIN_MEDIA_HEIGHT_MM = 40;

/**
 * The share of the printable page area each role reserves before any text is
 * flowed. A full-width image is a major page element: it holds at least two
 * fifths of the printable height when it shares a sheet, which is what stops a
 * hero image from ending up as an incidental strip under the copy.
 */
export const ROLE_MIN_PAGE_SHARE = Object.freeze({
  [IMAGE_PRESENTATION.FULL_WIDTH]: 0.40,
  [IMAGE_PRESENTATION.DETAIL]: 0.22,
  [IMAGE_PRESENTATION.CROPPED_DETAIL]: 0.22,
});

/** How each role is named in the export's own image trace. */
export const IMAGE_ROLE_LABEL = Object.freeze({
  [IMAGE_PRESENTATION.FULL_WIDTH]: 'Full Width',
  [IMAGE_PRESENTATION.DETAIL]: 'Detail',
  [IMAGE_PRESENTATION.CROPPED_DETAIL]: 'Cropped Detail',
});

const ROLES = Object.values(IMAGE_PRESENTATION);

/** The Library role recorded on a placed image, or null where none is recorded. */
export function imageRoleOf(node) {
  if (!node || node.nodeType !== 1) return null;
  const frame = node.matches?.('.pp-media') ? node : node.querySelector?.('.pp-media') || node.closest?.('.pp-media');
  const recorded = frame?.dataset?.presentation || node.dataset?.presentation || null;
  return ROLES.includes(recorded) ? recorded : null;
}

/** The designer's stated purpose for a placed image, for the trace only. */
export function imagePurposeOf(node) {
  if (!node || node.nodeType !== 1) return null;
  const frame = node.matches?.('.pp-media') ? node : node.querySelector?.('.pp-media') || node.closest?.('.pp-media');
  const recorded = frame?.dataset?.purpose || null;
  return recorded && recorded !== 'unstated' ? recorded : null;
}

/** The section a placed image sits in, for the trace only. */
export function imageSectionOf(node) {
  const section = node?.closest?.('[data-editorial-section]');
  return section?.dataset?.editorialSection || null;
}

/** The content-width share the role is composed at (100% full width, 58% detail). */
export function roleWidthPercent(role) {
  return PRESENTATION_WIDTH_PERCENT[role] || PRESENTATION_WIDTH_PERCENT[IMAGE_PRESENTATION.FULL_WIDTH];
}

/**
 * The height this role reserves on a sheet with this much printable height.
 * An unstated role returns the legacy floor.
 */
export function imageRoleFloorMm({ role, budgetMm }) {
  const share = ROLE_MIN_PAGE_SHARE[role];
  const budget = Number(budgetMm) || 0;
  if (!share || budget <= 0) return LEGACY_MIN_MEDIA_HEIGHT_MM;
  return Math.max(LEGACY_MIN_MEDIA_HEIGHT_MM, share * budget);
}

/** The floor one placed unit keeps, read from its own Library role. */
export function mediaFloorMm(node, budgetMm) {
  return imageRoleFloorMm({ role: imageRoleOf(node), budgetMm });
}

/**
 * Whether a placed image is the full-width presentation: a page element in its
 * own right, which stands on its own sheet rather than being tied to the copy
 * around it, and is never reduced to fit beside it.
 */
export function isFullWidthMedia(node) {
  return imageRoleOf(node) === IMAGE_PRESENTATION.FULL_WIDTH;
}

/**
 * One photograph's role trace, for the export inventory: which Library role the
 * layout consumed, and the geometry the composition actually gave it.
 */
export function imageRoleRecord(image, page) {
  const source = image?.closest?.('.pp-media') || image;
  const rect = image?.getBoundingClientRect?.() || { width: 0, height: 0 };
  const role = imageRoleOf(image);
  return {
    src: image?.getAttribute?.('src') || null,
    role: role || 'unstated',
    roleLabel: role ? IMAGE_ROLE_LABEL[role] : 'Unstated',
    purpose: imagePurposeOf(image),
    section: imageSectionOf(image),
    widthPercent: roleWidthPercent(role),
    renderedWidthMm: Math.round((rect.width || 0) / (96 / 25.4) * 10) / 10,
    renderedHeightMm: Math.round((rect.height || 0) / (96 / 25.4) * 10) / 10,
    reservedMm: source?.dataset?.imageReservedMm ? Number(source.dataset.imageReservedMm) : null,
    page,
  };
}

export default mediaFloorMm;