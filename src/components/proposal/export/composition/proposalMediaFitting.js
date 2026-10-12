/**
 * proposalMediaFitting.js
 * -----------------------
 * Proportional photograph fitting inside the one measured compositor.
 *
 * A photograph and its caption can be split by no rule, so a photograph that does
 * not fit the sheet it is measured against is reduced in height only, until the
 * pair fits the printable area it has. Nothing is cropped, stretched, reordered or
 * removed: the width follows the photograph's own proportions, and the caption is
 * never separated from it.
 *
 * Pure: DOM in, measurement out. No allocation happens here — the sheet a
 * photograph lands on is still decided by the measured partition.
 */

import { PX_PER_MM, setPrintStyle } from '@/components/proposal/export/composition/proposalPageGeometry';

/** The smallest a photograph is reduced to before the block is reported instead. */
export const MIN_PHOTOGRAPH_HEIGHT_MM = 40;
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
function applyProportionalHeight(image, heightMm) {
  setPrintStyle(image, 'height', `${heightMm.toFixed(1)}mm`);
  setPrintStyle(image, 'width', 'auto');
  setPrintStyle(image, 'max-width', '100%');
  setPrintStyle(image, 'margin', '0 auto');
  setPrintStyle(image, 'object-fit', 'contain');
}

/**
 * Reduce one photograph proportionally, and only as far as its sheet requires, so
 * that its unit fits the printable area it has alongside the units before it.
 *
 * @returns {boolean} whether the unit now fits.
 */
export function fitMediaUnit(unit, prefix, measureUnits) {
  if (unit?.tableId) return false;
  const photograph = unitPhotograph(unit);
  const image = copiedPhotograph(unit);
  if (!photograph || !image) return false;
  const rect = photograph.getBoundingClientRect?.();
  const renderedMm = (rect?.height || 0) / PX_PER_MM;
  if (!renderedMm) return false;
  let capMm = renderedMm;
  for (let attempt = 0; attempt <= ATTEMPTS; attempt += 1) {
    const measured = measureUnits([...prefix, unit]);
    if (measured.fits) return true;
    const overflowMm = Math.max(1, measured.usedMm - measured.availableMm);
    const nextMm = Math.min(capMm - 1, capMm - overflowMm - 1);
    if (nextMm < MIN_PHOTOGRAPH_HEIGHT_MM) return false;
    capMm = nextMm;
    applyProportionalHeight(image, capMm);
  }
  return measureUnits([...prefix, unit]).fits;
}