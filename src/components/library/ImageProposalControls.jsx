/**
 * ImageProposalControls
 * ---------------------
 * The designer's simple controls over ONE Library image, for the proposal:
 *
 *   Use in proposal / Hidden from proposal — whether the plan may place it
 *   Use as cover                          — swaps this image into the cover slot
 *   Seating option                        — groups it as a lifestyle alternative
 *   Focal point                           — which part of the frame the crop keeps
 *
 * These are presentation choices. Nothing here changes the stored file, the
 * caption, the scope, or any engineering value, and the only slot that moves is
 * the deliberate cover swap (both images are kept).
 */

import React from 'react';
import ImageComparisonControls from '@/components/library/ImageComparisonControls';
import {
  FOCAL_HORIZONTAL,
  FOCAL_VERTICAL,
  DEFAULT_FOCAL_POINT,
  IMAGE_PRESENTATION,
  IMAGE_PRESENTATION_HELP,
  IMAGE_PRESENTATION_LABELS,
  SEATING_STYLE,
  SEATING_STYLE_LABELS,
  assetFocalPoint,
  imagePresentationOf,
  presentationCropAllowed,
  seatingStyleOf,
} from '@/components/proposal/images/proposalImagePlacementAuthority';

/** The three presentation modes, in the order the card offers them. */
const PRESENTATION_OPTIONS = [
  IMAGE_PRESENTATION.FULL_WIDTH,
  IMAGE_PRESENTATION.DETAIL,
  IMAGE_PRESENTATION.CROPPED_DETAIL,
];

const FONT = { fontFamily: 'Didact Gothic, sans-serif' };

const SELECT_CLASS = 'w-full text-[11px] text-[#1B1A1A] bg-white border border-[#DCDBD6] rounded px-2 py-1 focus:outline-none focus:border-[#213428]';

const FOCAL_HORIZONTAL_OPTIONS = [
  { value: FOCAL_HORIZONTAL.LEFT, label: 'Left' },
  { value: FOCAL_HORIZONTAL.CENTRE, label: 'Centre' },
  { value: FOCAL_HORIZONTAL.RIGHT, label: 'Right' },
];

const FOCAL_VERTICAL_OPTIONS = [
  { value: FOCAL_VERTICAL.TOP, label: 'Top' },
  { value: FOCAL_VERTICAL.MIDDLE, label: 'Middle' },
  { value: FOCAL_VERTICAL.BOTTOM, label: 'Bottom' },
];

export default function ImageProposalControls({
  asset,
  canUseAsCover = false,
  // The comparison groups already named on this project, offered to this image's
  // comparison controls so two images are put in one group by name.
  comparisonGroupOptions = [],
  onUsageChange,
  onSeatingChange,
  onPresentationChange,
  onFocalChange,
  onComparisonChange,
  onUseAsCover,
}) {
  if (!asset) return null;

  const hidden = asset.usage === 'do_not_use';
  const seating = seatingStyleOf(asset) || '';
  const focal = assetFocalPoint(asset);
  const isDefaultFocal = focal.horizontal === DEFAULT_FOCAL_POINT.horizontal
    && focal.vertical === DEFAULT_FOCAL_POINT.vertical;
  // The presentation the designer has chosen, or '' where none is recorded: an
  // image with no preference keeps the treatment it always had.
  const presentation = imagePresentationOf(asset) || '';
  // The focal point only affects an image where cropping is permitted. A detail
  // image is never cropped, so its focal controls are inert and say so rather
  // than appearing to do something they no longer do.
  const focalApplies = presentationCropAllowed(presentation);

  return (
    <div className="mt-3 border-t border-[#EFECE4] pt-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.12em] text-[#A79E8C]" style={FONT}>
          Proposal
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onUsageChange(hidden ? 'gallery' : 'do_not_use')}
            className={`text-[11px] px-2 py-1 rounded border transition-colors ${
              hidden
                ? 'border-[#DCDBD6] text-[#8A8477] bg-white hover:text-[#625143]'
                : 'border-[#213428] text-[#213428] bg-[#F5F4F0]'
            }`}
            style={FONT}
          >
            {hidden ? 'Hidden from proposal' : 'Use in proposal'}
          </button>
          {canUseAsCover && !hidden && (
            <button
              type="button"
              onClick={onUseAsCover}
              className="text-[11px] px-2 py-1 rounded border border-[#DCDBD6] text-[#625143] bg-white hover:border-[#213428] hover:text-[#213428] transition-colors"
              style={FONT}
              title="Move this image into the cover slot"
            >
              Use as cover
            </button>
          )}
        </div>
      </div>

      {!hidden && (
        <>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] text-[#A79E8C] mb-1" style={FONT}>
              Seating option
            </label>
            <select
              value={seating}
              onChange={(event) => onSeatingChange(event.target.value)}
              className={SELECT_CLASS}
              style={FONT}
            >
              <option value="">Not a seating option</option>
              <option value={SEATING_STYLE.LOUNGE}>{SEATING_STYLE_LABELS[SEATING_STYLE.LOUNGE]}</option>
              <option value={SEATING_STYLE.RECLINER}>{SEATING_STYLE_LABELS[SEATING_STYLE.RECLINER]}</option>
            </select>
          </div>

          {/* IMAGE PRESENTATION — how this image is placed in the document: the
              large editorial image, a smaller whole drawing, or a smaller
              editorial crop. A stored choice, and a preference only: an image
              with none recorded is composed exactly as the document always
              composed it. */}
          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] text-[#A79E8C] mb-1" style={FONT}>
              Image presentation
            </label>
            <select
              value={presentation}
              onChange={(event) => onPresentationChange(event.target.value)}
              className={SELECT_CLASS}
              style={FONT}
            >
              <option value="">No preference (as composed today)</option>
              {PRESENTATION_OPTIONS.map((mode) => (
                <option key={mode} value={mode}>{IMAGE_PRESENTATION_LABELS[mode]}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] leading-snug text-[#8A8477]" style={FONT}>
              {presentation
                ? IMAGE_PRESENTATION_HELP[presentation]
                : 'This image is composed exactly as the proposal has always composed it.'}
            </p>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-[0.12em] text-[#A79E8C] mb-1" style={FONT}>
              Focal point{isDefaultFocal ? ' (centre / middle)' : ''}
            </label>
            <div className="flex items-center gap-2">
              <select
                value={focal.horizontal}
                onChange={(event) => onFocalChange({ focal_horizontal: event.target.value })}
                className={SELECT_CLASS}
                style={FONT}
              >
                {FOCAL_HORIZONTAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <select
                value={focal.vertical}
                onChange={(event) => onFocalChange({ focal_vertical: event.target.value })}
                className={SELECT_CLASS}
                style={FONT}
              >
                {FOCAL_VERTICAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* A comparison is a deliberate set the designer marks: one option of
              two or more shown together on their own page, in the designer's own
              words. Nothing is inferred, and nothing here changes the file, the
              caption or any engineering value. */}
          <ImageComparisonControls
            asset={asset}
            groupOptions={comparisonGroupOptions}
            onChange={(patch) => onComparisonChange(patch)}
          />
        </>
      )}
    </div>
  );
}