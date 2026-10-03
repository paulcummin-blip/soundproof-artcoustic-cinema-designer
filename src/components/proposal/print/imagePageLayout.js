/**
 * imagePageLayout.js
 * ------------------
 * How the project gallery is laid out across the printed image pages.
 *
 * The rule, so images never shrink into thumbnails:
 *   - up to three images share one image page;
 *   - beyond three, the gallery continues on further image pages;
 *   - each page lays its own images out by how many it carries (a single image
 *     is the page, two images are a dominant image plus one supporting image,
 *     three images are a hero image plus two supporting images).
 *
 * Pure: no React, no fetching, no side effects.
 */

/** The most images one page carries before a further image page is used. */
export const IMAGES_PER_PAGE = 3;

/**
 * The images grouped into pages, in gallery order.
 *
 * @param {Array} images
 * @returns {Array<Array>}
 */
export function imagePagesFor(images = []) {
  const list = Array.isArray(images) ? images : [];
  if (list.length === 0) return [];
  if (list.length <= IMAGES_PER_PAGE) return [list];
  const pages = [];
  for (let index = 0; index < list.length; index += IMAGES_PER_PAGE) {
    pages.push(list.slice(index, index + IMAGES_PER_PAGE));
  }
  return pages;
}

export default imagePagesFor;