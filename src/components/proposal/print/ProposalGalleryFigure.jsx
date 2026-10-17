import React from 'react';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';
import {
  IMAGE_PRESENTATION,
  SOURCE_PROPORTION_STYLE,
  imagePresentationOf,
} from '@/components/proposal/images/proposalImagePlacementAuthority';

/** A photograph shown at its own proportions: no fixed height, no crop, no stretch. */
const NATURAL_PRESENTATION = SOURCE_PROPORTION_STYLE;

export default function ProposalGalleryFigure({ asset, className = '', preserveNatural = false }) {
  if (!asset?.file_url) return null;
  // The Library presentation is the authority: an image the designer marked FULL
  // WIDTH is shown exactly as uploaded — full content width, its own height, its
  // own proportions — whatever composition the page hands it. Nothing is cropped
  // to fit a fixed frame.
  const natural = preserveNatural || imagePresentationOf(asset) === IMAGE_PRESENTATION.FULL_WIDTH;
  return (
    <figure className={`pp-gallery__figure ${className}`.trim()}>
      <img src={asset.file_url} alt={asset.caption || 'Project image'}
        style={natural ? NATURAL_PRESENTATION : undefined} />
      {asset.caption ? (
        <figcaption className="pp-gallery__caption" style={proposalRoleStyle('caption')}>
          {asset.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}