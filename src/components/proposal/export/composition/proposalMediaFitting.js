/**
 * proposalMediaFitting.js
 * -----------------------
 * Proportional photograph fitting inside the one measured compositor, and the
 * reserved area each photograph keeps while it is fitted.
 *
 * A photograph and its caption can be split by no rule, so a photograph that does
 * not fit the sheet it is measured against is reduced in height only, until the
 * pair fits the printable area it has. Nothing is cropped, stretched, reordered or
 * removed: the width follows the photograph's own proportions, and the caption is
 * never separated from it.
 *
 * THE IMAGE KEEPS ITS RESERVED AREA. Reduction stops at the floor the image's own
 * Library role reserves (proposalImageRoleAuthority): a full-width image holds a
 * substantial share of the sheet, a detail image holds enough to be read. Where
 * the image cannot reach its reserved size beside the copy it was measured with,
 * the fit REFUSES — and the copy moves to the next sheet instead, by the same
 * measured partition that allocates every other block. A photograph is never
 * reduced to an incidental strip to make the text above it fit.
 *
 * Pure: DOM in, measurement out. No allocation happens here — the sheet a
 * photograph lands on is still decided by the measured partition.
 */

import { PX_PER_MM, setPrintStyle } from '@/components/proposal/export/composition/proposalPageGeometry';
import { LEGACY_MIN_MEDIA_HEIGHT_MM, mediaFloorMm, imageRoleOf } from '@/components/proposal/export/composition/proposalImageRoleAuthority';

/**
 * The smallest a photograph is reduced to where its Library role reserves less
 * (or states nothing at all). An image with no role recorded keeps this floor.
 */
export const MIN_PHOTOGRAPH_HEIGHT_MM = LEGACY_MIN_MEDIA_HEIGHT_MM;
/** Reduction passes before the result is measured once more. */
const ATTEMPTS = 8;

/** Whether this unit is a media block that must stay whole. */
export function isMediaUnit(unit) {
  return Boolean(unit?.source?.matches?.('figure,.pp-media,img,svg,video'));
}

/** The photograph this unit carries, read from the live page so its real size is used. */
function unitPhotograph(unit) {
  const source = unit?.source;
  if (!source?.querySelector) return null;
  return source.matches('img') ? source : source.querySelector('img');
}

/** The same photograph inside the unit's own copy, which is what is written to. */
function copiedPhotograph(unit) {
  const node = unit?.node;
  if (!node?.querySelector) return null;
  return node.matches('img') ? node : node.querySelector('img');
}

/** Height only: the width follows the photograph's own proportions, and nothing is cropped. */
function applyProportionalHeight(image, heightMm, role) {
  setPrintStyle(image, 'height', `${heightMm.toFixed(1)}mm`);
  setPrintStyle(image, 'width', 'auto');
  setPrintStyle(image, 'max-width', '100%');
  setPrintStyle(image, 'margin', '0 auto');
  setPrintStyle(image, 'object-fit', 'contain');
  // The image trace: which Library role the layout consumed for this photograph,
  // and the height the composition reserved for it. Read back by the export
  // inventory; it decides nothing.
  if (image.dataset) {
    image.dataset.imageRole = role || 'unstated';
    image.dataset.imageReservedMm = heightMm.toFixed(1);
  }
}

/**
 * Reduce one photograph proportionally, and only as far as its own reserved area
 * allows, so that its unit fits the printable area it has alongside the units
 * before it.
 *
 * @param {{ floorMm?: number }} [options] — the reserved floor. Omitted, the
 *   image keeps the smallest floor a photograph has ever been reduced to.
 * @returns {boolean} whether the unit now fits. False means the reserved area
 *   could not be met, so the measured partition moves the block — the image is
 *   never taken below its floor to force it onto the sheet.
 */
export function fitMediaUnit(unit, prefix, measureUnits, options = {}) {
  if (unit?.tableId) return false;
  const photograph = unitPhotograph(unit);
  const image = copiedPhotograph(unit);
  if (!photograph || !image) return false;
  const rect = photograph.getBoundingClientRect?.();
  const renderedMm = (rect?.height || 0) / PX_PER_MM;
  if (!renderedMm) return false;
  const floorMm = Number(options.floorMm) || MIN_PHOTOGRAPH_HEIGHT_MM;
  const role = imageRoleOf(unit?.node);
  let capMm = renderedMm;
  for (let attempt = 0; attempt <= ATTEMPTS; attempt += 1) {
    const measured = measureUnits([...prefix, unit]);
    if (measured.fits) return true;
    // The reduction stops at the reserved floor. At the floor the fit REFUSES,
    // which is what moves the copy to the next sheet instead of taking the image
    // below the area its Library role reserves.
    if (capMm <= floorMm) return false;
    const overflowMm = Math.max(1, measured.usedMm - measured.availableMm);
    const nextMm = Math.max(floorMm, Math.min(capMm - 1, capMm - overflowMm - 1));
    if (nextMm >= capMm) return false;
    capMm = nextMm;
    applyProportionalHeight(image, capMm, role);
  }
  return measureUnits([...prefix, unit]).fits;
}

/**
 * The same fit, at the size this photograph's own Library role reserves.
 *
 * The printable height the frame allows is measured first, the role's share of it
 * is read as the floor, and the photograph is reduced only as far as that floor —
 * so the image keeps the area the designer asked for and the copy moves instead.
 *
 * @returns {boolean} whether the unit fitted at its reserved size.
 */
export function reserveMediaUnit(unit, prefix, measureUnits) {
  const budgetMm = measureUnits(prefix).availableMm;
  return fitMediaUnit(unit, prefix, measureUnits, {
    floorMm: mediaFloorMm(unit?.node, budgetMm),
  });
}