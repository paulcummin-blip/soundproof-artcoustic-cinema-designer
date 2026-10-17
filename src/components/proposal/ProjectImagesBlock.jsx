/**
 * ProjectImagesBlock
 * ------------------
 * The Project Images section of a client design report.
 *
 * The Image Library presentation field is the authority here, so each image is
 * composed at the weight the designer gave it, in gallery order: a Full Width
 * image is a dominant block of its own at the full content width, a Detail image
 * is supporting evidence composed smaller than the content column, and an image
 * with nothing recorded keeps the composition this block has always given it (a
 * lead image full width, then the rest as an editorial grid with their captions).
 * The two are never normalised against each other: a Detail image is never
 * promoted to the full content width. It never writes narrative copy — the
 * section is imagery only. When nothing has been uploaded it says so.
 *
 * Used by the Proposal Editor preview and the exported PDF, so the two match.
 */

import React from 'react';
import { ASSET_SLOT, imagesInSlotOrder } from '@/components/proposal/assetSlotAuthority';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';
import {
  COMPOSITION_WEIGHT,
  presentationComposition,
} from '@/components/proposal/images/proposalImagePlacementAuthority';

export const NO_PROJECT_IMAGES_MESSAGE = 'No project images selected.';

/** The project's gallery images in slot order (the cover is not repeated here). */
export function projectGalleryImages(images = []) {
  return imagesInSlotOrder(images).filter(({ slot }) => slot !== ASSET_SLOT.COVER);
}

/**
 * The gallery split into consecutive runs of ONE composition weight, in gallery
 * order, so each run is composed for what it is and the reading order is kept.
 */
export function imageCompositionRuns(gallery = []) {
  const runs = [];
  (Array.isArray(gallery) ? gallery : []).forEach((entry) => {
    const weight = presentationComposition(entry.asset).weight;
    const current = runs[runs.length - 1];
    if (current && current.weight === weight) {
      current.entries.push(entry);
      return;
    }
    runs.push({ weight, entries: [entry] });
  });
  return runs;
}

function GalleryFigure({ entry, className = '' }) {
  const { asset } = entry;
  return (
    <figure className={`proposal-images__figure ${className}`.trim()}>
      <img src={asset.file_url} alt={asset.caption || 'Project image'} />
      {asset.caption ? (
        <figcaption className="proposal-images__caption text-[#625143]" style={proposalRoleStyle('caption')}>
          {asset.caption}
        </figcaption>
      ) : null}
    </figure>
  );
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

  return (
    <div className={`proposal-images ${className}`.trim()}>
      {imageCompositionRuns(gallery).map((run) => {
        const firstKey = run.entries[0].asset.id || run.entries[0].asset.file_url;
        // The designer's Full Width choice: a dominant block of its own, at the
        // full content width, never reduced to a supporting slot.
        if (run.weight === COMPOSITION_WEIGHT.PRIMARY) {
          return run.entries.map((entry) => (
            <GalleryFigure key={entry.asset.id || entry.asset.file_url} entry={entry}
              className="proposal-images__figure--feature proposal-images__lead" />
          ));
        }
        // The designer's supporting images: composed smaller than the content
        // column and never promoted to it.
        if (run.weight === COMPOSITION_WEIGHT.SUPPORTING) {
          return (
            <div key={`supporting:${firstKey}`} className="proposal-images__support">
              {run.entries.map((entry) => (
                <GalleryFigure key={entry.asset.id || entry.asset.file_url} entry={entry}
                  className="proposal-images__figure--supporting" />
              ))}
            </div>
          );
        }
        // Nothing recorded: the established treatment, unchanged.
        const [lead, ...rest] = run.entries;
        return (
          <React.Fragment key={`photographs:${firstKey}`}>
            <GalleryFigure entry={lead} className="proposal-images__lead" />
            {rest.length > 0 && (
              <div className="proposal-images__grid">
                {rest.map((entry) => (
                  <GalleryFigure key={entry.asset.id || entry.asset.file_url} entry={entry} />
                ))}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}