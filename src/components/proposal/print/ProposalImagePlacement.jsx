/**
 * ProposalImagePlacement
 * ----------------------
 * One placed image in the designed client specification pack.
 *
 * The placement IS the treatment: the same stored source can appear as a
 * dominant full-width landscape and, later in the document, as a smaller
 * portrait accent beside the copy, because a placement carries its own crop role
 * and focal point. No image is ever copied, re-uploaded or re-cropped into a
 * second file to achieve that.
 *
 * Used by the printed pack and by the editor preview, so the two read alike.
 * Pure presentation: no fetching, no calculation, no writing.
 */

import React from 'react';
import {
  EDITORIAL_ROLE,
  objectPositionForFocalPoint,
} from '@/components/proposal/images/proposalImagePlacementAuthority';

/** How each editorial role is composed on the page. */
const TREATMENT = Object.freeze({
  [EDITORIAL_ROLE.LANDSCAPE_FEATURE]: 'landscape',
  [EDITORIAL_ROLE.CLOSING_FEATURE]: 'landscape',
  [EDITORIAL_ROLE.PORTRAIT_EDITORIAL]: 'portrait',
  [EDITORIAL_ROLE.SEATING_OPTION]: 'seating',
});

export default function ProposalImagePlacement({
  placement,
  caption = null,
  className = '',
}) {
  if (!placement?.source_file_url) return null;
  const treatment = TREATMENT[placement.editorial_role] || 'landscape';
  const captionText = caption ?? placement.source_caption ?? null;

  return (
    <figure className={`pp-media pp-media--${treatment} ${className}`.trim()}>
      <img
        src={placement.source_file_url}
        alt={captionText || ''}
        // The crop keeps the part of the frame this placement is framed on:
        // centre / middle unless the designer chose otherwise.
        style={{ objectPosition: objectPositionForFocalPoint(placement.focal_point) }}
      />
      {captionText ? <figcaption className="pp-media__caption">{captionText}</figcaption> : null}
    </figure>
  );
}