/**
 * ProjectImagesPage
 * -----------------
 * The Project Images page of the printed client specification pack.
 *
 * This page is image-led, and how many images it carries is decided by the one
 * measured compositor rather than by a fixed count: the page presents a
 * photograph only where the photograph actually fits on it, so a landscape pair
 * still shares a sheet while a tall pair continues onto a further image page.
 *
 *   designer's own photographs   shown at their own proportions, one full-width
 *                                column, each kept with its own caption
 *   other image pages            the established rows: a dominant image with its
 *                                supporting images below it
 *
 * Only the images the designer uploaded for this project are shown, in gallery
 * order. Nothing is generated here, and no placeholder imagery is ever used.
 *
 * Pure presentation: no fetching, no calculation.
 */

import React from 'react';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import ProposalGalleryFigure from '@/components/proposal/print/ProposalGalleryFigure';
import { imagePageKind } from '@/components/proposal/print/imagePageLayout';

export { IMAGES_PER_PAGE, imagePagesFor, imagePageKind } from '@/components/proposal/print/imagePageLayout';

export default function ProjectImagesPage({
  number,
  title = 'Project Images',
  kicker = 'Visualisation',
  images = [],
  preserveNatural = false,
  lead = '',
}) {
  if (!images.length) return null;
  // The images copy the writer wrote for this project, when no other page has
  // published it above the photographs. It is printed once, under the heading, so
  // no approved wording is lost when the project's photographs are composed here.
  const leadBlock = lead ? (
    <div className="pp-body pp-image-flow__lead" dangerouslySetInnerHTML={{ __html: lead }} />
  ) : null;
  // A heading is printed only where the document asked for one. The photographs
  // this page composes are part of the editorial flow, so the page carries no
  // portfolio heading of its own unless a dedicated gallery was requested.
  const header = title
    ? <ProposalPageHeader number={number} kicker={kicker} title={title} />
    : null;

  // A sheet of the designer's supporting images — the ones they marked Detail or
  // Cropped Detail. They are supporting evidence, never the page hero: the sheet
  // composes them smaller than the content column, side by side, each shown whole
  // at its own proportions and each keeping its own caption. A detail image is
  // never promoted to the full content width, and a sheet that genuinely cannot
  // hold its details is continued rather than resized against the choice.
  if (imagePageKind(images) === 'supporting') {
    return (
      <section className="proposal-print-section pp-page pp-page--images pp-page--supporting-images">
        {header}
        {leadBlock}
        <div className="pp-gallery pp-gallery--supporting">
          {images.map((asset) => (
            <ProposalGalleryFigure key={asset.id || asset.file_url} asset={asset}
              className="pp-gallery__figure--supporting" preserveNatural />
          ))}
        </div>
      </section>
    );
  }

  // The designer's own photographs print at their own proportions in one
  // full-width column, so a sheet carries only the photographs that actually fit
  // on it and each stays with its own caption.
  if (preserveNatural) {
    return (
      <section className="proposal-print-section pp-page pp-page--images">
        {header}
        {leadBlock}
        <div className={`pp-gallery pp-gallery--natural pp-gallery--${Math.min(images.length, 4)}`}>
          {images.map((asset) => (
            <ProposalGalleryFigure key={asset.id || asset.file_url} asset={asset} preserveNatural />
          ))}
        </div>
      </section>
    );
  }

  const [hero, ...supporting] = images;

  return (
    <section className="proposal-print-section pp-page pp-page--images">
      {header}
      {leadBlock}
      <div className={`pp-gallery pp-gallery--${images.length}`}>
        <ProposalGalleryFigure asset={hero} className="pp-gallery__hero" />
        {supporting.length > 0 && (
          <div className="pp-gallery__support">
            {supporting.map((asset) => (
              <ProposalGalleryFigure key={asset.id || asset.file_url} asset={asset} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}