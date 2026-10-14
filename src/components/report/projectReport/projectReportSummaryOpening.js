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
import { displayPhrase, isTvDisplay, savedDiagonalInches } from '@/components/models/screen/displayTypeAuthority';
import {
  readSeatBoundaryGeometry,
  buildSeatingBoundaryExplanation,
} from '@/shared/seatingBoundaryPrinciple';
import { classifyProjectIntent } from '@/components/report/projectReport/projectIntentClassification';

const NUMBER_WORDS = Object.freeze({
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five',
  6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
});

/** A small count as a word — "four" — so the summary reads as prose. */
const word = (count) => NUMBER_WORDS[count] || String(count);

const NONE_SPECIFIED = /^none specified$/i;

/**
 * Whether this is a compact room — a design descriptor read from the room's own
 * floor area, never a performance statement. At or below 30 m² the cinema is
 * stated as compact; above it the word is simply not used, and a design whose
 * room dimensions are unknown is never called compact. Shared with the report's
 * opening authority, so the headline and the intent can never disagree.
 */
const COMPACT_FLOOR_AREA_M2 = 30;

export function isCompactRoom(roomDims) {
  const width = Number(roomDims?.widthM);
  const length = Number(roomDims?.lengthM);
  if (![width, length].every((value) => Number.isFinite(value) && value > 0)) return false;
  return width * length <= COMPACT_FLOOR_AREA_M2;
}

/** A count as the sentence's opening word: "Six Abfuser panels…". */
function countWord(count) {
  const text = word(count);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/**
 * Where the low-frequency support is stated to come from, read from the design's
 * own subwoofer schedule — the rear, the screen wall, both ends, or the
 * subwoofers alone where the schedule records no side. The intent never claims a
 * position the design does not state.
 */
function bassSupportPhrase(subwooferSchedule) {
  const hasRear = subwooferSchedule.some((part) => /\(rear\)/i.test(part));
  const hasFront = subwooferSchedule.some((part) => /\(front\)/i.test(part));
  if (hasRear && hasFront) return 'from both ends of the room';
  if (hasRear) return 'from the rear subwoofers';
  if (hasFront) return 'from the screen wall';
  return 'from the subwoofers';
}

/**
 * The same question for a lounge / media room, stated with the product itself
 * where the schedule records a single subwoofer group — "from two rear SUB2-12
 * subwoofers". A schedule carrying more than one group keeps the side alone, so
 * a mixed arrangement is never summarised as one product.
 */
function statedBassPhrase(subwooferSchedule) {
  const parts = productParts(subwooferSchedule);
  if (parts.length === 1) {
    const model = partModel(parts[0]);
    const count = partCount(parts[0]);
    const side = /\(rear\)/i.test(parts[0]) ? 'rear ' : /\(front\)/i.test(parts[0]) ? 'front ' : '';
    if (model) return `from ${word(count)} ${side}${model} subwoofer${count === 1 ? '' : 's'}`;
  }
  return bassSupportPhrase(subwooferSchedule);
}

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

/**
 * THE large-display wording rule: a television is described as large only from
 * 77" upwards, so a smaller set is stated as the television it is — `65" TV`,
 * never a large 65" TV — and a television whose own size is not recorded is
 * never called large either. The rule concerns televisions only: a projection
 * screen's scale is not re-worded here, and the size is read from the display's
 * one saved diagonal authority, never measured or inferred.
 */
const LARGE_TV_DIAGONAL_INCHES = 77;

/** Whether this design's display may be described as large. */
export function isLargeDisplay(projectDetails) {
  if (!isTvDisplay(projectDetails)) return true;
  const diagonal = Number(savedDiagonalInches(projectDetails));
  return Number.isFinite(diagonal) && diagonal >= LARGE_TV_DIAGONAL_INCHES;
}

/** The display with its size descriptor, where one is warranted. */
export function scaledScreenPhrase(projectDetails) {
  const phrase = screenPhrase(projectDetails);
  if (!phrase) return null;
  return isLargeDisplay(projectDetails) ? `large ${phrase}` : phrase;
}

/** How many seating rows the report's own row grouping sees. */
export function seatingRowCount(seatingPositions) {
  const seats = (Array.isArray(seatingPositions) ? seatingPositions : []).map((seat) => ({
    x: Number(seat?.x ?? seat?.position?.x),
    y: Number(seat?.y ?? seat?.position?.y),
  }));
  return groupSeatsIntoRows(seats).length;
}

/** The seating, as the report's own row grouping sees it. */
export function seatingRowPhrase(seatingPositions) {
  const rows = seatingRowCount(seatingPositions);
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

  // Paragraph one: the design as it is intended, in the designer's own voice —
  // the display and the seating the room is built around, and what carries the
  // sound. A layer the design does not have is never described: a 5.1 system is
  // a deliberate 5.1 system, not an immersive one with something missing.
  const architecture = String(projectDetails?.dolby_config || '').trim() || null;
  const vision = [];
  const rowPhrase = seatingRowPhrase(seatingPositions);
  const display = displayPhrase(projectDetails);
  const builtAround = [display ? `a ${display}` : null, rowPhrase].filter(Boolean);
  const compact = isCompactRoom(roomDims) ? 'compact ' : '';
  // THE PROJECT INTENT RULE, read from the one classification authority: a
  // television system is a media lounge — a relaxed, high-performance media room —
  // not a dedicated cinema, and a projection room built as a cinema keeps its
  // dedicated-cinema language. The intent reads as a lounge only where the display
  // the room is built around can actually be named, so no copy ever states a
  // television or a cinema it cannot name.
  const mediaRoom = classifyProjectIntent({ projectDetails }).isMediaLounge && !!display;
  if (mediaRoom) {
    const system = architecture ? `${architecture} system` : 'surround system';
    const displayScale = isLargeDisplay(projectDetails) ? 'large ' : '';
    vision.push(`This is a relaxed high-performance media room built around a ${displayScale}${display}. It is designed for sport, box sets, films and music, with a sensible ${system} that keeps the room comfortable while still delivering impact when needed.`);
  } else if (builtAround.length > 0) {
    vision.push(`This room is designed as a ${compact}dedicated cinema around ${joinList(builtAround)}, with the picture, the front stage, the sound around the seating and the low-frequency support planned together around the way the room will actually be used.`);
  } else if (projection) {
    vision.push(mountMode === 'baffle'
      ? 'This room is designed as a cinema first, with the picture projected onto a screen wall built out as a baffle wall, so the front stage and the low-frequency foundation are carried by the same wall as the picture.'
      : 'This room is designed as a cinema first, with the picture projected onto a floating screen and the system that carries it concealed from the seating.');
  } else {
    vision.push('This room is designed as a cinema, with the picture and the sound planned together from the seating outwards.');
  }
  if (overheadCount > 0) {
    vision.push('The overhead layer is part of the original design rather than an addition to it, which is what gives the room its sense of scale.');
  } else if (surroundCount > 0 && !mediaRoom) {
    vision.push('The sound is carried around and behind the seating as well as across the front, so the audience sits inside the surround field rather than in front of it.');
  }

  // Paragraph two: why the principal decisions were taken, and how the picture,
  // the sound and the seating work together in this particular room.
  const reasoning = [];
  const rowCount = seatingRowCount(seatingPositions);
  if (mediaRoom) {
    // The everyday account, for the room this system is actually used in. The
    // seating is a fact the page's own fact sheet states; it is not the story
    // here, so the arrangement is not argued a second time in the paragraph.
    const focus = [
      productParts(productsSelected?.lcr).length > 0 && 'clear dialogue from the screen',
      surroundCount > 0 && 'surround movement around the seating',
      subwooferSchedule.length > 0 && `useful bass support ${statedBassPhrase(subwooferSchedule)}`,
    ].filter(Boolean);
    if (focus.length > 0) reasoning.push(`The system gives ${joinList(focus)}.`);
  } else {
    if (rowCount > 0) {
      const reference = String(projectDetails?.mlp_basis || '').trim() === 'middle'
        ? ', with the reference position taken at the middle of the seating rather than at one privileged chair'
        : '';
      const clearance = seatingBoundary?.available === true && seatingBoundary?.favourable === true
        ? 'well inboard of the side and rear walls'
        : 'as far inboard of the side and rear walls as the room allows';
      const subject = rowCount === 1
        ? 'The single seating row sits'
        : `The ${word(rowCount)} seating rows sit`;
      reasoning.push(`${subject} ${clearance}${reference}, so the design answers from where the audience actually sits.`);
    }
    // What the system is there to do, stated only for the layers this design
    // actually has, and saying which end the bass is delivered from.
    const focus = [
      productParts(productsSelected?.lcr).length > 0 && 'clear dialogue and effects from the screen',
      surroundCount > 0 && 'convincing surround movement around the seating',
      subwooferSchedule.length > 0 && `controlled low-frequency support ${bassSupportPhrase(subwooferSchedule)}`,
    ].filter(Boolean);
    if (focus.length > 0) {
      const layerLabel = architecture ? `The ${architecture} system` : 'The system';
      reasoning.push(`${layerLabel} concentrates on ${joinList(focus)}.`);
    }
  }
  if (treated) {
    const treatmentParts = productParts(productsSelected?.acoustic_treatment);
    const treatmentModel = partModel(treatmentParts[0]) || 'acoustic treatment';
    const treatmentQty = totalCount(productsSelected?.acoustic_treatment);
    const panels = `${countWord(treatmentQty)} ${treatmentModel} panel${treatmentQty === 1 ? '' : 's'}`;
    reasoning.push(mediaRoom
      ? `${panels} help control the strongest reflections, keeping the room clear, natural and inviting.`
      : `${panels} ${treatmentQty === 1 ? 'is' : 'are'} included to manage the strongest early reflections, so the room stays clear and comfortable rather than overly live.`);
  }

  const paragraphs = [vision.join(' '), reasoning.join(' ')].filter(Boolean);
  return paragraphs.length > 0 ? paragraphs.join('\n\n') : null;
}

export default buildProjectReportSummaryOpening;