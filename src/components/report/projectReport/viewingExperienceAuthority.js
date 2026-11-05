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
 * result; this paragraph says what those figures mean for the audience — stated
 * with the actual screen size, seat count, viewing angle and RP23 level the
 * published evidence carries. No angle, no level and no seat count is restated.
 *
 * THE REGISTER. The copy is written as an experienced cinema designer explaining
 * the viewing decision to a client: clear, natural, confident, and grounded in
 * this project's own figures. It never uses poetic, abstract or artificial
 * descriptions of the experience — no "the picture fills the eye", no "carries
 * the same presence", no "reads at its intended scale", no "chosen by eye". The
 * actual screen size, seating arrangement, viewing angle and RP23 level carry the
 * story, and each project reads differently because its figures are different.
 *
 * Read-only and pure: the display is read from the design's own display authority
 * and the rows from the published per-row viewing results. Nothing is graded,
 * recalculated or inferred, and a design with no seating returns null.
 */

import { displayPhrase, isTvDisplay } from '@/components/models/screen/displayTypeAuthority';
import { viewingRows } from '@/shared/strengthStoryEvidence';

const rowLabel = (index, total) => {
  if (total <= 1) return 'the seating row';
  if (index === 0) return 'the front row';
  if (index === total - 1) return 'the rear row';
  return total === 3 ? 'the middle row' : `row ${index + 1}`;
};

const angleText = (row) => {
  if (row?.minAngleDeg == null && row?.maxAngleDeg == null) return null;
  const min = Math.round(Number(row.minAngleDeg));
  const max = Math.round(Number(row.maxAngleDeg));
  if (min === max) return `${min}°`;
  return `${min}° to ${max}°`;
};

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
  const totalSeats = rows.reduce((sum, row) => sum + Number(row.seats), 0);

  // The screen this design is built around, stated with its actual size and
  // format by the shared display authority.
  const screen = displayPhrase(projectDetails)
    || (projection ? 'The projection screen' : 'The display');

  // Sentence 1: the screen and the seating, with the actual seat count.
  const seatPhrase = severalRows
    ? `${rows.length} rows totalling ${totalSeats} seats`
    : `a single row of ${totalSeats} seat${totalSeats === 1 ? '' : 's'}`;
  const opening = `${screen} is paired with ${seatPhrase}.`;

  // Sentence 2: the viewing angle and RP23 level, stated as published.
  const levels = rows.map((row) => row.level).filter(Boolean);
  const consistentLevel = levels.length > 0 && levels.every((l) => l === levels[0]);

  let viewingResult;
  if (severalRows) {
    const perRow = rows.map((row, i) => {
      const angle = angleText(row);
      const level = row.level ? `RP23 ${row.level}` : null;
      const parts = [angle, level].filter(Boolean);
      return parts.length > 0 ? `${rowLabel(i, rows.length)} sees ${parts.join(' at ')}` : null;
    }).filter(Boolean);

    const allAngles = rows.flatMap((row) => [row.minAngleDeg, row.maxAngleDeg])
      .filter((v) => Number.isFinite(v));
    if (perRow.length > 0) {
      viewingResult = perRow.join(', ') + '.';
    } else if (allAngles.length > 0) {
      viewingResult = `Viewing angles range from ${Math.round(Math.min(...allAngles))}° to ${Math.round(Math.max(...allAngles))}°.`;
    } else {
      viewingResult = null;
    }
  } else {
    const angle = angleText(rows[0]);
    const level = rows[0]?.level ? `RP23 ${rows[0].level}` : null;
    const parts = [
      angle ? `a ${angle} horizontal viewing angle` : null,
      level,
    ].filter(Boolean);
    viewingResult = parts.length > 0
      ? `This provides ${parts.join(', ')} across all ${totalSeats} seat${totalSeats === 1 ? '' : 's'}.`
      : null;
  }

  // Sentence 3: the benefit, stated plainly without poetic language.
  const benefit = severalRows
    ? (consistentLevel
      ? 'The viewing experience stays consistent across the rows, with the screen size and seating positions considered together rather than treated as separate decisions.'
      : 'The viewing experience varies across the rows, as is expected with multiple seating positions in a room of this size.')
    : 'The screen size and seating position have been considered together, so the picture scale suits the room and the viewing distance works for the seats that are there.';

  // For a widescreen projection room, note the framing the aspect ratio gives.
  const framing = (projection && widescreen)
    ? 'The 2.35:1 screen shows widescreen films edge to edge, so the films that use the full frame fill the screen.'
    : null;

  return [opening, viewingResult, benefit, framing].filter(Boolean).join(' ');
}

export default buildViewingExperienceNarrative;