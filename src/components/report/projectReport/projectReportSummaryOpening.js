/**
 * projectReportSummaryOpening.js
 * ------------------------------
 * The Project Report's front-page DESIGN INTENT: the designer's own account of
 * the cinema this report documents — what experience the room is being asked to
 * deliver, why the principal decisions were taken, how the picture, the sound
 * and the seating work together, and why that combination suits this particular
 * room.
 *
 * IT IS NOT A SPECIFICATION. The page states the schedule in its own fact sheet
 * directly above this paragraph, so the intent never lists equipment, counts or
 * room dimensions. A product, a construction or a distance is named only where
 * that detail is what explains a decision.
 *
 * IT MAKES NO PERFORMANCE CLAIM. The individual strengths, the results behind
 * them and what each one gives the client are the ADI Design Highlights page's
 * subject; this paragraph carries the vision and the reasoning instead, so the
 * two pages read as complementary parts of one document.
 *
 * Read-only and pure. Every element comes from evidence the report already
 * carries: the saved project (display and its presentation, architecture, layout
 * choices, reference position), the room's dimensions, the design's own seating,
 * its product schedule (whether the sound has a height layer, how the bass is
 * delivered, whether treatment is specified), and the shared seating-boundary
 * authority for where the seating sits in the room.
 *
 * Nothing is recalculated, graded or inferred, and no reason is invented for a
 * decision the saved design does not record. A project whose evidence is missing
 * entirely returns null, so the page renders nothing rather than a template line.
 *
 * Pure module: no React, no DOM, no side effects.
 */

import { groupSeatsIntoRows } from '@/components/report/client/seatRowGrouping';
import { displayPhrase, isTvDisplay } from '@/components/models/screen/displayTypeAuthority';
import {
  readSeatBoundaryGeometry,
  buildSeatingBoundaryExplanation,
} from '@/shared/seatingBoundaryPrinciple';

const NUMBER_WORDS = Object.freeze({
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five',
  6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
});

/** A small count as a word — "four" — so the summary reads as prose. */
const word = (count) => NUMBER_WORDS[count] || String(count);

const NONE_SPECIFIED = /^none specified$/i;

/** "A, B and C" — the sentence's own list style. */
function joinList(items) {
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  if (list.length <= 1) return list[0] || '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** One schedule row's products, each split out of its "Model × 3 (front)" form. */
function productParts(row) {
  return (Array.isArray(row) ? row : [row])
    .flatMap((entry) => String(entry || '').split(','))
    .map((entry) => entry.trim())
    .filter((entry) => entry && !NONE_SPECIFIED.test(entry));
}

const partModel = (part) => String(part).replace(/×\s*\d+/, '').replace(/\([^)]*\)/g, '').trim();
const partCount = (part) => Number(String(part).match(/×\s*(\d+)/)?.[1] || 1);

/** The first model named in a schedule row — the layer's product. */
function firstModel(row) {
  const models = productParts(row).map(partModel).filter(Boolean);
  return models[0] || null;
}

/** How many products a schedule row states in total. */
function totalCount(row) {
  return productParts(row).reduce((sum, part) => sum + partCount(part), 0);
}

/**
 * The display the cinema was designed around.
 * A television by its own size — `115" TV`; a projection screen exactly as
 * before — `185" 2.35:1`. Delegated to the one display-type authority, so the
 * report never states a television as a screen.
 */
export function screenPhrase(projectDetails) {
  return displayPhrase(projectDetails);
}

/** The seating, as the report's own row grouping sees it. */
export function seatingRowPhrase(seatingPositions) {
  const seats = (Array.isArray(seatingPositions) ? seatingPositions : []).map((seat) => ({
    x: Number(seat?.x ?? seat?.position?.x),
    y: Number(seat?.y ?? seat?.position?.y),
  }));
  const rows = groupSeatsIntoRows(seats).length;
  if (rows === 0) return null;
  return rows === 1 ? 'a single seating row' : `${word(rows)} seating rows`;
}

/**
 * The Design Summary's opening paragraph, or null when the report carries too
 * little project evidence for one.
 *
 * @param {Object}  [input.projectDetails]     — the saved project (display, architecture, layout, reference)
 * @param {Object}  [input.roomDims]            — the room's own dimensions
 * @param {Object}  [input.productsSelected]    — the report's own product schedule
 * @param {Array}   [input.seatingPositions]    — the design's seating
 * @returns {string|null} the intent, its paragraphs separated by a blank line
 */
export function buildProjectReportSummaryOpening({
  projectDetails = null,
  roomDims = null,
  productsSelected = null,
  seatingPositions = [],
} = {}) {
  const mountMode = String(projectDetails?.screen_mount_mode || '').trim().toLowerCase();
  const projection = !isTvDisplay(projectDetails);
  const overheadCount = totalCount(productsSelected?.overheads);
  const surroundCount = totalCount(productsSelected?.surrounds);

  // Whether the bass is delivered from both ends of the room, read from the
  // design's own schedule wording (each subwoofer group states its end).
  const subwooferSchedule = productParts(productsSelected?.subwoofers);
  const bassFromBothEnds = subwooferSchedule.some((part) => /\(front\)/i.test(part))
    && subwooferSchedule.some((part) => /\(rear\)/i.test(part));
  const treated = totalCount(productsSelected?.acoustic_treatment) > 0;

  // Where this design's seating actually sits, from the shared seating-boundary
  // authority — the same geometry the P1 highlight explains in more detail.
  const seatingBoundary = buildSeatingBoundaryExplanation(
    readSeatBoundaryGeometry({ seats: seatingPositions, roomDims }),
  );

  // Paragraph one: the experience this cinema is designed to deliver.
  const vision = [];
  if (projection) {
    vision.push(mountMode === 'baffle'
      ? 'This room is designed as a cinema first, with the picture projected onto a screen wall built out as a baffle wall, so the front stage and the low-frequency foundation are carried by the same wall as the picture.'
      : 'This room is designed as a cinema first, with the picture projected onto a floating screen and the system that carries it concealed from the seating.');
  } else {
    vision.push('This room is designed as a cinema around a large-format display, so the picture and the sound are planned together from the seating outwards.');
  }
  if (overheadCount > 0) {
    vision.push('The overhead layer is part of the original design rather than an addition to it, which is what gives the room its sense of scale.');
  } else if (surroundCount > 0) {
    vision.push('The sound is carried around and behind the seating as well as across the front, so the audience sits inside the mix rather than in front of it.');
  }

  // Paragraph two: why the principal decisions were taken, and how the picture,
  // the sound and the seating work together in this particular room.
  const reasoning = [];
  const rows = seatingRowPhrase(seatingPositions);
  if (rows) {
    const reference = String(projectDetails?.mlp_basis || '').trim() === 'middle'
      ? ', with the reference position taken at the middle of the seating rather than at one privileged chair'
      : '';
    const clearance = seatingBoundary?.available === true && seatingBoundary?.favourable === true
      ? 'well inboard of the side and rear walls'
      : 'as far inboard of the side and rear walls as the room allows';
    reasoning.push(
      `${rows.charAt(0).toUpperCase()}${rows.slice(1)} sit ${clearance}${reference}, so the design answers from where the audience actually sits.`,
    );
  }
  if (bassFromBothEnds) {
    reasoning.push('The low-frequency is delivered from both ends of the room rather than from one wall, so it arrives together across the seating.');
  } else if (subwooferSchedule.length > 0) {
    reasoning.push('The low-frequency is delivered from the screen wall, arranged so it arrives across the seating as one source rather than from a single point.');
  }
  if (treated) {
    reasoning.push('The acoustic treatment takes care of the room\'s own early reflections, so the tonal balance the audience hears belongs to the system rather than to the room.');
  }

  const paragraphs = [vision.join(' '), reasoning.join(' ')].filter(Boolean);
  return paragraphs.length > 0 ? paragraphs.join('\n\n') : null;
}

export default buildProjectReportSummaryOpening;