import React from 'react';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';
import { SOURCE_PROPORTION_STYLE } from '@/components/proposal/images/proposalImagePlacementAuthority';

/** A photograph shown at its own proportions: no fixed height, no crop, no stretch. */
const NATURAL_PRESENTATION = SOURCE_PROPORTION_STYLE;

export default function ProposalGalleryFigure({ asset, className = '', preserveNatural = false }) {
  if (!asset?.file_url) return null;
  return (
    <figure className={`pp-gallery__figure ${className}`.trim()}>
      <img src={asset.file_url} alt={asset.caption || 'Project image'}
        style={preserveNatural ? NATURAL_PRESENTATION : undefined} />
      {asset.caption ? (
        <figcaption className="pp-gallery__caption" style={proposalRoleStyle('caption')}>
          {asset.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}