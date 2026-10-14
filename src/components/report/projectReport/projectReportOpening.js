/**
 * projectReportOpening.js
 * -----------------------
 * The Project Report's opening statement: the short, project-specific headline
 * the report leads with, and the one supporting line of facts beneath it.
 *
 * Both are derived from evidence the report already carries — the saved
 * project's Dolby architecture and screen, the room, the seating, and the
 * report's own specification schedule — so the opening names THIS cinema and can
 * never state a generic template line.
 *
 * Read-only and pure. The speaker count comes from the same
 * specification-connection authority the Highlights page and the System &
 * Products page use, so the opening can never disagree with them, and it is the
 * same count those pages state (no discrete channel authority is re-declared
 * here). Nothing is recalculated, re-graded or inferred; when the evidence is
 * too thin for a headline the report simply opens on its design summary
 * paragraph alone.
 *
 * Pure module: no React, no DOM, no side effects.
 */

import { classifyProjectIntent } from '@/components/report/projectReport/projectIntentClassification';
import {
  buildProjectReportSummaryOpening,
  isCompactRoom,
  scaledScreenPhrase,
  screenPhrase,
  seatingRowPhrase,
} from './projectReportSummaryOpening';

/** The room, stated as its three dimensions in metres. */
function roomPhrase(roomDims) {
  const width = Number(roomDims?.widthM);
  const length = Number(roomDims?.lengthM);
  const height = Number(roomDims?.heightM);
  if (![width, length, height].every((value) => Number.isFinite(value) && value > 0)) return null;
  return `${width.toFixed(2)} × ${length.toFixed(2)} × ${height.toFixed(2)} m room`;
}

/**
 * The Project Report's opening: the headline, the supporting facts line, and the
 * design summary paragraph the page closes on.
 *
 * @param {Object} [input.projectDetails]     — the saved project (architecture, screen)
 * @param {Object} [input.roomDims]           — the saved room dimensions in metres
 * @param {Object} [input.productsSelected]   — the report's own product schedule
 * @param {Array}  [input.seatingPositions]   — the design's seating
 * @param {Object} [input.engineeringSummary] — the published engineering summary
 * @returns {{ headline: string|null, supportingLine: string|null, intent: string|null }}
 */
export function buildProjectReportOpening({
  projectDetails = null,
  roomDims = null,
  productsSelected = null,
  seatingPositions = [],
  engineeringSummary = null,
} = {}) {
  const architecture = String(projectDetails?.dolby_config || '').trim() || null;

  // The headline leads with the design's intent — the cinema this room is and
  // the display it is built around — rather than with a channel count. The
  // speaker count is a fact the fact sheet already states; it is not the story.
  // The display comes from the report's one display authority, so a television
  // is named as a television, and 'compact' is read from the room's own floor
  // area and simply absent from a larger room.
  const display = screenPhrase(projectDetails);
  const compact = isCompactRoom(roomDims) ? 'compact ' : '';

  // A media-lounge television design leads as the room it is rather than as a
  // cinema, read from the one project-intent authority; a projection design, and a
  // television design the designer has explicitly marked as a dedicated cinema,
  // keep the cinema headline.
  // The size descriptor is the shared large-display rule: a television is
  // described as large only from 77" upwards, so a media room built around a
  // smaller set names the television itself.
  const headline = classifyProjectIntent({ projectDetails }).isMediaLounge && display
    ? `A relaxed high-performance media room built around a ${scaledScreenPhrase(projectDetails)}`
    : architecture
      ? (display
        ? `A ${compact}${architecture} cinema designed around a ${display}`
        : `A ${compact}${architecture} cinema`)
      : (display ? `A ${compact}cinema designed around a ${display}` : null);

  const supportingLine = [
    screenPhrase(projectDetails),
    roomPhrase(roomDims),
    seatingRowPhrase(seatingPositions),
  ].filter(Boolean).join(' · ') || null;

  return {
    headline,
    supportingLine,
    intent: buildProjectReportSummaryOpening({
      projectDetails,
      roomDims,
      productsSelected,
      seatingPositions,
    }),
  };
}

export default buildProjectReportOpening;