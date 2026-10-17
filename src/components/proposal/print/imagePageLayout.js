/**
 * imagePageLayout.js
 * ------------------
 * How the project gallery is laid out across the printed image pages.
 *
 * The Image Library presentation field is the authority, so a page is grouped by
 * the WEIGHT the designer gave each image rather than by a count:
 *   - a Full Width image never shares a sheet: it is the page, and the page is
 *     built around it;
 *   - Detail images are supporting evidence and share a sheet with the other
 *     supporting images, never with a Full Width image and never in the hero
 *     slot;
 *   - images with nothing recorded keep the established grouping exactly (up to
 *     three share a page; beyond three the gallery continues on further pages),
 *     because a page must never change under a stored photograph just because a
 *     field was added;
 *   - a page that cannot hold a composition properly is continued rather than
 *     resized against the designer's choice.
 *
 * Pure: no React, no fetching, no side effects.
 */

import {
  COMPOSITION_WEIGHT,
  presentationComposition,
} from '@/components/proposal/images/proposalImagePlacementAuthority';

/** The most images with nothing recorded that one page carries. */
export const IMAGES_PER_PAGE = 3;

/** The most supporting images one sheet carries, side by side. */
export const SUPPORTING_IMAGES_PER_PAGE = 2;

/** The weight one sheet carries: what kind of page it is. */
export function imagePageKind(images = []) {
  const list = (Array.isArray(images) ? images : []).filter(Boolean);
  if (list.length === 0) return 'empty';
  const weights = list.map((asset) => presentationComposition(asset).weight);
  if (weights.every((weight) => weight === COMPOSITION_WEIGHT.PRIMARY)) return 'feature';
  if (weights.every((weight) => weight === COMPOSITION_WEIGHT.SUPPORTING)) return 'supporting';
  return 'photographs';
}

/** The most images one sheet of this weight carries. */
export function imagesPerPageFor(weight) {
  return weight === COMPOSITION_WEIGHT.SUPPORTING ? SUPPORTING_IMAGES_PER_PAGE : IMAGES_PER_PAGE;
}

/**
 * The images grouped into pages, in gallery order, by the weight the designer
 * gave each one.
 *
 * A page never mixes weights: a Full Width image takes a sheet of its own, the
 * supporting images share theirs, and images with nothing recorded keep the
 * established grouping.
 *
 * @param {Array} images
 * @returns {Array<Array>}
 */
export function imagePagesFor(images = []) {
  const list = Array.isArray(images) ? images : [];
  if (list.length === 0) return [];

  const pages = [];
  let run = { weight: null, images: [] };
  const flushRun = () => {
    while (run.images.length) {
      pages.push(run.images.splice(0, imagesPerPageFor(run.weight)));
    }
    run = { weight: null, images: [] };
  };

  list.forEach((asset) => {
    const weight = presentationComposition(asset).weight;
    // The designer's Full Width choice is the page: it is never grouped with
    // another image, so the composition is built around it.
    if (weight === COMPOSITION_WEIGHT.PRIMARY) {
      flushRun();
      pages.push([asset]);
      return;
    }
    if (run.weight && run.weight !== weight) flushRun();
    run.weight = weight;
    run.images.push(asset);
    if (run.images.length >= imagesPerPageFor(weight)) flushRun();
  });
  flushRun();
  return pages;
}

export default imagePagesFor;