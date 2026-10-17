/**
 * ImageFlowBlock
 * --------------
 * The project photographs that join ONE narrative section's page, composed
 * between that section's copy and the next section's.
 *
 * This is what replaces the standalone Project Images page: instead of a gallery
 * bolted onto the end of the document, a photograph (or two that share the page)
 * follows the copy it supports, so the pack reads as one brochure. The block is
 * one composition, so the measured compositor keeps a pair together on its sheet
 * where the sheet can hold both, and continues the second photograph onto the
 * section's own next sheet where it cannot — the photographs are never shrunk
 * below the share their presentation reserves and never cropped to fit.
 *
 * The layout is decided by the plan (proposalImageFlow), from the presentation
 * metadata the designer recorded; nothing here chooses a source, a page or a crop.
 *
 * @param {{placements: Array<Object>, layout: string, lead: string}} props
 */
import React from 'react';
import ProposalImagePlacement from '@/components/proposal/print/ProposalImagePlacement';
import { FLOW_IMAGE_LAYOUT } from '@/components/proposal/images/proposalImageFlow';

export default function ImageFlowBlock({ placements = [], layout = FLOW_IMAGE_LAYOUT.SINGLE, lead = '' }) {
  const images = (placements || []).filter((placement) => placement?.source_file_url);
  if (images.length === 0) return null;
  const resolved = Object.values(FLOW_IMAGE_LAYOUT).includes(layout)
    ? layout
    : FLOW_IMAGE_LAYOUT.SINGLE;
  const [leading, ...rest] = images;

  return (
    <div
      className={`pp-image-flow pp-image-flow--${resolved}`}
      data-editorial-composition="image_flow"
      data-flow-layout={resolved}
    >
      {lead ? (
        <div
          className="pp-body pp-image-flow__lead"
          dangerouslySetInnerHTML={{ __html: lead }}
        />
      ) : null}
      <div className={`pp-gallery pp-gallery--flow pp-gallery--flow-${resolved}`}>
        <ProposalImagePlacement placement={leading} />
        {rest.length > 0 ? (
          <div className="pp-image-flow__support">
            {rest.map((placement) => (
              <ProposalImagePlacement key={placement.id} placement={placement} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}