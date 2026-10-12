import React from 'react';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';

export default function ProposalGalleryFigure({ asset, className = '', preserveNatural = false }) {
  if (!asset?.file_url) return null;
  return (
    <figure className={`pp-gallery__figure ${className}`.trim()}>
      <img src={asset.file_url} alt={asset.caption || 'Project image'}
        style={preserveNatural ? { height: 'auto', maxHeight: '200mm', objectFit: 'contain' } : undefined} />
      {asset.caption ? (
        <figcaption className="pp-gallery__caption" style={proposalRoleStyle('caption')}>
          {asset.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}