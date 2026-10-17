/**
 * ProjectImagesBlock
 * ------------------
 * The Project Images section of a client design report.
 *
 * It shows the images the designer uploaded or selected for the project, in
 * gallery order: one lead image full width, then the rest as an editorial grid
 * with their captions. It never writes narrative copy — the section is imagery
 * only. When nothing has been uploaded it says so, and nothing else.
 *
 * Used by the Proposal Editor preview and the exported PDF, so the two match.
 */

import React from 'react';
import { ASSET_SLOT, imagesInSlotOrder } from '@/components/proposal/assetSlotAuthority';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';
// The client-facing status of these visuals, from the one authority that also states
// it to the writer, so the label on the page and the rule the copy follows agree.
import { CONCEPT_RENDER_LABEL } from '@/shared/reportVisualContext';

export const NO_PROJECT_IMAGES_MESSAGE = 'No project images selected.';

/** The project's gallery images in slot order (the cover is not repeated here). */
export function projectGalleryImages(images = []) {
  return imagesInSlotOrder(images).filter(({ slot }) => slot !== ASSET_SLOT.COVER);
}

export default function ProjectImagesBlock({ images = [], className = '' }) {
  const gallery = projectGalleryImages(images);

  if (gallery.length === 0) {
    return (
      <p className={`proposal-images__empty text-[#8A8477] ${className}`.trim()} style={proposalRoleStyle('body')}>
        {NO_PROJECT_IMAGES_MESSAGE}
      </p>
    );
  }

  const [lead, ...rest] = gallery;

  return (
    <div className={`proposal-images ${className}`.trim()}>
      <figure className="proposal-images__figure proposal-images__lead">
        <img src={lead.asset.file_url} alt={lead.asset.caption || 'Project image'} />
        {lead.asset.caption ? (
          <figcaption className="proposal-images__caption text-[#625143]" style={proposalRoleStyle('caption')}>
            {lead.asset.caption}
          </figcaption>
        ) : null}
      </figure>

      {rest.length > 0 && (
        <div className="proposal-images__grid">
          {rest.map(({ asset }) => (
            <figure key={asset.id} className="proposal-images__figure">
              <img src={asset.file_url} alt={asset.caption || 'Project image'} />
              {asset.caption ? (
                <figcaption className="proposal-images__caption text-[#625143]" style={proposalRoleStyle('caption')}>
                  {asset.caption}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      )}

      {/* WHOSE STATUS IS CLEAR TO THE CLIENT: the images on this page are concept
          visuals, not approved interiors. One quiet line states it, so the narrative
          never has to carry a disclaimer. */}
      <p className="proposal-images__concept-note text-[#8A8477]" style={proposalRoleStyle('caption')}>
        {CONCEPT_RENDER_LABEL}
      </p>
    </div>
  );
}