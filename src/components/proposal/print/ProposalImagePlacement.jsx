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
  IMAGE_PRESENTATION,
  objectPositionForFocalPoint,
} from '@/components/proposal/images/proposalImagePlacementAuthority';
// The concept-visual status, from the one authority that also states it to the writer.
import { CONCEPT_RENDER_FINISHES_LABEL, CONCEPT_RENDER_LABEL } from '@/shared/reportVisualContext';

/** How each editorial role is composed on the page. */
const TREATMENT = Object.freeze({
  [EDITORIAL_ROLE.LANDSCAPE_FEATURE]: 'landscape',
  [EDITORIAL_ROLE.CLOSING_FEATURE]: 'landscape',
  [EDITORIAL_ROLE.PORTRAIT_EDITORIAL]: 'portrait',
  [EDITORIAL_ROLE.SEATING_OPTION]: 'seating',
  [EDITORIAL_ROLE.COMPARISON_OPTION]: 'comparison',
});

export default function ProposalImagePlacement({
  placement,
  caption = null,
  className = '',
}) {
  if (!placement?.source_file_url) return null;
  const treatment = TREATMENT[placement.editorial_role] || 'landscape';
  const captionText = caption ?? placement.source_caption ?? null;
  const closingClass = placement.editorial_role === EDITORIAL_ROLE.CLOSING_FEATURE
    ? ' pp-media--closing-feature'
    : '';
  // The designer's own presentation choice, when one is recorded. No choice
  // recorded means the role treatment alone, exactly as before.
  const presentation = placement.image_presentation || null;
  const purpose = placement.image_purpose || null;
  // A drawing identified by its purpose is shown whole whatever presentation was
  // selected, so it takes the uncropped detail frame: the placement's own
  // crop_protected flag is the statement, and no page-fit decision overrides it.
  const protectedDrawing = placement.crop_protected === true;
  const effectivePresentation = protectedDrawing ? IMAGE_PRESENTATION.DETAIL : presentation;
  const presentationClass = effectivePresentation ? ` pp-media--presentation-${effectivePresentation}` : '';
  const detail = effectivePresentation === IMAGE_PRESENTATION.DETAIL;

  // The status of this visual, stated on the page: an option the client is being
  // offered shows interior finishes for illustration, and any other render is the
  // room experience. It is a statement about the file, never about what it contains.
  const conceptLabel = placement.editorial_role === EDITORIAL_ROLE.SEATING_OPTION
    || placement.editorial_role === EDITORIAL_ROLE.COMPARISON_OPTION
    ? CONCEPT_RENDER_FINISHES_LABEL
    : CONCEPT_RENDER_LABEL;

  return (
    <figure className={`pp-media pp-media--${treatment}${closingClass}${presentationClass} ${className}`.trim()}>
      <img
        src={placement.source_file_url}
        alt={captionText || ''}
        // A detail image is shown whole: the frame takes the image's own
        // aspect ratio and nothing is cropped, so a dimensioned drawing keeps
        // every dimension, label and annotation it carries. Where cropping is
        // permitted the crop keeps the part of the frame this placement is
        // framed on: centre / middle unless the designer chose otherwise.
        style={detail
          ? { objectFit: 'contain', objectPosition: '50% 50%' }
          : { objectPosition: objectPositionForFocalPoint(placement.focal_point) }}
        data-presentation={effectivePresentation || 'unstated'}
        data-selected-presentation={presentation || 'unstated'}
        data-purpose={purpose || 'unstated'}
        data-crops={detail ? 'no' : 'yes'}
      />
      {captionText ? <figcaption className="pp-media__caption">{captionText}</figcaption> : null}
      <p className="pp-media__note">{conceptLabel}</p>
    </figure>
  );
}