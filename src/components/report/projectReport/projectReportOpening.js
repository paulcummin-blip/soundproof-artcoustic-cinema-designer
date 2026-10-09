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

import {
  buildProjectReportSummaryOpening,
  screenPhrase,
  seatingRowPhrase,
} from './projectReportSummaryOpening';
import { buildSpecificationConnections } from './adiDesignHighlights';

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

  const connections = buildSpecificationConnections({
    productsSelected,
    engineeringSummary,
    dolbyConfig: architecture,
  });
  const counts = connections?.counts || {};
  const speakers = (counts.lcr || 0) + (counts.surrounds || 0) + (counts.overheads || 0);

  const headline = architecture
    ? (speakers > 0
      ? `A ${architecture} cinema with ${speakers} discrete speakers`
      : `A ${architecture} cinema`)
    : (speakers > 0 ? `A cinema with ${speakers} discrete speakers` : null);

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
      productsSelected,
      seatingPositions,
      engineeringSummary,
    }),
  };
}

export default buildProjectReportOpening;