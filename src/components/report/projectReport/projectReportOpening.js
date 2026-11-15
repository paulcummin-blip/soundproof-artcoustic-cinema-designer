/**
 * projectReportOpening.js
 * -----------------------
 * The Project Report's opening statement: the short, project-specific headline
 * the report leads with, and the design summary paragraph the page closes on.
 *
 * THE HEADLINE describes the actual design — the system format and the display
 * it is built around — never an imagined mood or lifestyle. It avoids generic
 * praise (relaxed, high-performance, large) and uses 'discreet' only where the
 * speaker selection (on-wall or in-ceiling, not freestanding) genuinely supports
 * that description. Each project's headline reads differently because its
 * system format and display are different; no fixed template is imposed.
 *
 * The screen, the room and the seating are deliberately NOT restated under the
 * headline: each is a fact the page's own fact sheet states once, directly below
 * it.
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
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';
import {
  buildProjectReportSummaryOpening,
  isCompactRoom,
  screenPhrase,
} from './projectReportSummaryOpening';

/**
 * Extract the bare model name from a productsSelected entry such as
 * "Q8-5 × 3" or "C4-1 × 2 centre cabinets (vertical)".
 */
function modelFromProductEntry(entry) {
  if (!entry) return null;
  return String(entry).replace(/\s*×\s*\d+.*$/, '').trim() || null;
}

/**
 * Whether the design's LCR and surround speakers are on-wall or in-ceiling
 * (discreet) rather than freestanding floor-standers. Every named model must
 * resolve to a known Artcoustic model — all of which are on-wall or
 * in-ceiling — for the description to apply; an unknown or competitor model is
 * never assumed discreet.
 */
function isDiscreetSpeakerSelection(productsSelected) {
  if (!productsSelected) return false;
  const lcr = Array.isArray(productsSelected.lcr) ? productsSelected.lcr : [];
  const surrounds = Array.isArray(productsSelected.surrounds) ? productsSelected.surrounds : [];
  const names = [...lcr, ...surrounds].map(modelFromProductEntry).filter(Boolean);
  if (names.length === 0) return false;
  return names.every((name) => {
    const meta = getSpeakerModelMeta(name);
    return meta && !meta.notFound;
  });
}

/**
 * The grammatical article before a display phrase. Display sizes are read as
 * English numbers, so 'an' is needed before a size whose reading starts with a
 * vowel sound: 83" (eighty-three), 85" (eighty-five), etc.
 */
function articleBefore(display) {
  if (!display) return 'a';
  const s = String(display).replace(/^large\s+/i, '').trim();
  const match = s.match(/^(\d+)/);
  if (match) {
    const n = parseInt(match[1], 10);
    // eight, eleven, eighteen, eighty-something — vowel-initial readings.
    if (n === 8 || n === 11 || n === 18 || (n >= 80 && n < 90)) return 'an';
    return 'a';
  }
  return /^[aeiou]/i.test(s) ? 'an' : 'a';
}

/**
 * The Project Report's opening: the headline, and the design summary paragraph
 * the page closes on.
 *
 * @param {Object} [input.projectDetails]     — the saved project (architecture, screen)
 * @param {Object} [input.roomDims]           — the saved room dimensions in metres
 * @param {Object} [input.productsSelected]   — the report's own product schedule
 * @param {Array}  [input.seatingPositions]   — the design's seating
 * @param {Object} [input.engineeringSummary] — the published engineering summary
 * @returns {{ headline: string|null, intent: string|null }}
 */
export function buildProjectReportOpening({
  projectDetails = null,
  roomDims = null,
  productsSelected = null,
  seatingPositions = [],
  engineeringSummary = null,
  // The design's client-facing system format, resolved by the report page from
  // the one shared format authority (bed . ACTIVE subs . overheads). The project's
  // own Dolby configuration is the fallback, never a second construction rule.
  systemFormat = null,
} = {}) {
  // The decoder layout is never a fallback in client-facing copy: the report
  // states the client's system format (9.3.6) or states nothing.
  const architecture = String(systemFormat || '').trim() || null;

  // The display the design is built around, from the report's one display
  // authority — a television is named as a television, a projection screen as a
  // screen. 'large' is never added: the display's own size is specific enough.
  const display = screenPhrase(projectDetails);
  const compact = isCompactRoom(roomDims) ? 'compact ' : '';
  const isLounge = classifyProjectIntent({ projectDetails }).isMediaLounge && !!display;

  // 'Discreet' is used only where the speaker selection supports it — on-wall or
  // in-ceiling speakers, not freestanding floor-standers — and only for a media
  // lounge, where the discreet installation is a defining characteristic.
  const discreet = isLounge && isDiscreetSpeakerSelection(productsSelected) ? 'discreet ' : '';
  const article = articleBefore(display);

  // The headline describes the design itself: the system format and the display
  // it is built around. A media lounge reads as a 'cinema system' (the design,
  // not a lifestyle); a projection or explicitly dedicated cinema reads as a
  // 'cinema designed around' its display. No fixed template — the available
  // details shape the sentence.
  const headline = isLounge
    ? (architecture
      ? `A ${discreet}${architecture} cinema system built around ${article} ${display}`
      : `A ${discreet}cinema system built around ${article} ${display}`)
    : architecture
      ? (display
        ? `A ${compact}${architecture} cinema designed around ${article} ${display}`
        : `A ${compact}${architecture} cinema`)
      : (display ? `A ${compact}cinema designed around ${article} ${display}` : null);

  return {
    headline,
    intent: buildProjectReportSummaryOpening({
      projectDetails,
      roomDims,
      productsSelected,
      seatingPositions,
    }),
  };
}

export default buildProjectReportOpening;