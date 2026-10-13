import React from 'react';
import ProposalImagePlacement from './ProposalImagePlacement';

/**
 * The photographs the design closes with, composed as ONE unit inside the
 * section that concludes the design.
 *
 * This is an existing editorial layout, not a new template: the images are
 * presented full width at one visual scale, each keeping its own caption, and
 * the block is placed as a single composition inside its section — so the
 * compositor measures it whole, keeps the pair together on its sheet, and moves
 * it to the section's own continuation sheet rather than splitting it across
 * sheets. Where the section already leads with a photograph, that photograph is
 * the first of the pair, so no image is ever composed twice.
 *
 * The images are the placements the plan decided on; nothing here chooses a
 * source, a crop or a page.
 *
 * @param {{placements: Array<Object>, lead: string}} props
 */
export default function ClosingPhotographPair({ placements = [], lead = '' }) {
  const images = (placements || []).filter((placement) => placement?.source_file_url);
  if (images.length === 0) return null;

  return (
    <div
      className={`pp-closing pp-closing--${images.length}`}
      data-editorial-composition="closing"
    >
      {lead ? (
        <div
          className="pp-body pp-closing__lead"
          dangerouslySetInnerHTML={{ __html: lead }}
        />
      ) : null}
      {images.map((placement) => (
        <ProposalImagePlacement key={placement.id} placement={placement} />
      ))}
    </div>
  );
}