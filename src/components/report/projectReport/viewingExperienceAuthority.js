/**
 * viewingExperienceAuthority.js
 * -----------------------------
 * The Project Report's account of the VIEWING EXPERIENCE: what watching a film in
 * this room is actually like, and why the screen and the seating work together.
 *
 * WHERE IT BELONGS, EDITORIALLY. The ADI Design Highlights page states the
 * strongest results of the design, each with its own evidence. Where the per-row
 * viewing result is one of those stories, that page already makes the point and
 * this narrative is not built at all — the report never says the same thing
 * twice. Where the page is full with stronger stories, the viewing story is
 * developed here instead, beside the geometry table whose figures it explains.
 *
 * WHAT IT SAYS. The table prints each row's seats, its viewing angle and its RP23
 * result; this paragraph says what those figures mean for the audience — how the
 * picture reads from the seating, why the screen's shape and size suit the way
 * films are framed, and why the arrangement serves the whole audience rather than
 * one seat. No angle, no level and no seat count is restated.
 *
 * Read-only and pure: the display is read from the design's own display authority
 * and the rows from the published per-row viewing results. Nothing is graded,
 * recalculated or inferred, and a design with no seating returns null.
 */

import { isTvDisplay } from '@/components/models/screen/displayTypeAuthority';
import { viewingRows } from '@/shared/strengthStoryEvidence';

/**
 * The viewing experience, as one paragraph of report copy, or null where the
 * Highlights page states the viewing result itself or the design has no seating.
 */
export function buildViewingExperienceNarrative({
  projectDetails = null,
  seatingPositions = [],
  engineeringSummary = null,
  statedOnHighlightsPage = false,
} = {}) {
  if (statedOnHighlightsPage) return null;

  const rows = (viewingRows(engineeringSummary, seatingPositions) || [])
    .filter((row) => Number(row?.seats) > 0);
  if (rows.length === 0) return null;

  const projection = !isTvDisplay(projectDetails);
  const widescreen = String(projectDetails?.aspect_ratio || '').trim().startsWith('2.35');
  const severalRows = rows.length > 1;

  const fromTheSeats = severalRows
    ? 'The seating is arranged so the picture fills the eye from every row: the front row is close enough for the image to hold the attention without crowding it, and the rows behind keep a comfortable viewing distance rather than watching from the far end of a long room.'
    : 'The seating is positioned so the picture fills the eye: close enough for the image to hold the attention, and far enough back that the whole frame is read at once rather than scanned.';

  const screen = !projection
    ? 'The display is sized to the seating rather than the seating fitted around the display, so the picture reads with the same presence across the room.'
    : widescreen
      ? 'The 2.35:1 screen takes widescreen presentations edge to edge, so the films that use the full frame fill the screen instead of sitting inside a black border.'
      : 'The screen is sized to the seating, so the picture carries the same presence in either framing and the image is never pushed below the height the rows are set for.';

  const wholeAudience = severalRows
    ? 'The result is a room judged on how the whole audience sees the film: every row keeps a viewing distance that suits the screen, and no seat is treated as the compromise.'
    : 'The result is a viewing distance worked out from the screen size and the seating rather than chosen by eye, so the picture reads at its intended scale from the seats.';

  return [fromTheSeats, screen, wholeAudience].join(' ');
}

export default buildViewingExperienceNarrative;