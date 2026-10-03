/**
 * ProjectImagesPage
 * -----------------
 * The Project Images page of the printed client specification pack.
 *
 * This page is image-led: one image dominates it and the supporting images sit
 * below, rather than the images reading as thumbnails in a report. The layout is
 * decided by how many images the page carries:
 *
 *   1 image   one near full-page image
 *   2 images  a dominant image with one supporting image below it
 *   3 images  one hero image with two supporting images side by side below it
 *   4+ images several image pages rather than shrinking every image
 *
 * Only the images the designer uploaded for this project are shown, in gallery
 * order. Nothing is generated here, and no placeholder imagery is ever used.
 *
 * Pure presentation: no fetching, no calculation.
 */

import React from 'react';
import ProposalPageHeader from '@/components/proposal/print/ProposalPageHeader';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';

export { IMAGES_PER_PAGE, imagePagesFor } from '@/components/proposal/print/imagePageLayout';

function GalleryFigure({ asset, className = '' }) {
  if (!asset?.file_url) return null;
  return (
    <figure className={`pp-gallery__figure ${className}`.trim()}>
      <img src={asset.file_url} alt={asset.caption || 'Project image'} />
      {asset.caption ? (
        <figcaption className="pp-gallery__caption" style={proposalRoleStyle('caption')}>
          {asset.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export default function ProjectImagesPage({
  number,
  title = 'Project Images',
  kicker = 'Visualisation',
  images = [],
}) {
  if (!images.length) return null;
  const [hero, ...supporting] = images;

  return (
    <section className="proposal-print-section pp-page pp-page--images">
      <ProposalPageHeader number={number} kicker={kicker} title={title} />
      <div className={`pp-gallery pp-gallery--${images.length}`}>
        <GalleryFigure asset={hero} className="pp-gallery__hero" />
        {supporting.length > 0 && (
          <div className="pp-gallery__support">
            {supporting.map((asset) => (
              <GalleryFigure key={asset.id || asset.file_url} asset={asset} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}