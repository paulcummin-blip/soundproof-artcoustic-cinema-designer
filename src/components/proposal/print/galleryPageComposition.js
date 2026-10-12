/**
 * galleryPageComposition.js
 * -------------------------
 * The presentation step that follows allocation for the project image pages.
 *
 * A gallery is composed photograph by photograph by the one measured compositor,
 * so a sheet can end up carrying one, two or three of them. This module labels
 * each composed sheet with the photographs it actually received, and keeps the
 * established Artcoustic presentation for that count — a single photograph is the
 * page, two are a dominant photograph with one below it.
 *
 * Pure DOM: it measures nothing and allocates nothing.
 */

const COUNT_CLASS = /^pp-gallery--\d+$/;
/** Marks a gallery whose photographs print at their own proportions. */
export const NATURAL_GALLERY_CLASS = 'pp-gallery--natural';
/** The most photographs one sheet presents before a further image page is used. */
const MAX_LABELLED = 4;

/** Every photograph on one composed sheet, in printed order. */
export function galleryFigures(gallery) {
  return [...gallery.querySelectorAll('.pp-gallery__figure')];
}

/**
 * Label one composed image page for the photographs it received, keeping every
 * photograph in order with its own caption.
 *
 * The count label is set from what the sheet actually carries, so nothing here
 * imposes a two-image count and nothing here changes a photograph's size: the
 * natural column's gap is the same whatever the sheet holds.
 */
export function normalizeGalleryPage(page) {
  const gallery = page.querySelector('.pp-gallery');
  // Only a gallery of the designer's own photographs is composed photograph by
  // photograph. A fixed-row gallery keeps the label and the rows it was designed
  // with, so its printed heights never change under it.
  if (!gallery?.classList.contains(NATURAL_GALLERY_CLASS)) return;
  const figures = galleryFigures(gallery);
  if (!figures.length) return;
  [...gallery.classList].filter((name) => COUNT_CLASS.test(name))
    .forEach((name) => gallery.classList.remove(name));
  gallery.classList.add(`pp-gallery--${Math.min(figures.length, MAX_LABELLED)}`);
  // One full-width column: a photograph that has a sheet of its own is presented
  // as the page rather than left in a supporting row, and every photograph stays
  // with its own caption.
  figures.forEach((figure) => gallery.append(figure));
  [...gallery.querySelectorAll('.pp-gallery__support')]
    .forEach((row) => { if (!row.children.length) row.remove(); });
}