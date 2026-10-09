/**
 * projectReportSummaryOpening.js
 * ------------------------------
 * The Project Report's Design Summary opening: ONE concise, project-specific
 * paragraph naming the cinema this report actually documents — its
 * architecture, its screen, its seating, the system that was specified, and the
 * strengths the published assessment genuinely supports.
 *
 * Read-only and pure. Every element comes from evidence the report already
 * carries:
 *   — the saved project, for the Dolby architecture and the screen;
 *   — the report's own product schedule, for the screen stage, surround/wide
 *     layer, overheads, subwoofers and acoustic treatment that were specified;
 *   — the seated rows, for the seating;
 *   — the published RP22 levels, for which strength may be claimed.
 *
 * Nothing is recalculated and no capability is claimed that the published
 * assessment does not support: a strength whose parameters are not genuinely
 * strong is left out of the sentence rather than hedged. A project whose
 * evidence is missing entirely returns null, so the report falls back to its
 * existing published statement.
 *
 * Pure module: no React, no DOM, no side effects.
 */

import { groupSeatsIntoRows } from '@/components/report/client/seatRowGrouping';
import { readReportParameter } from '@/components/report/reportParameterEvidence';

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

/** The published level of one parameter as a number 1–4, or null. */
function levelNumber(engineeringSummary, id) {
  const level = readReportParameter(engineeringSummary, id)?.level;
  const match = String(level ?? '').match(/^L?([1-4])$/);
  return match ? Number(match[1]) : null;
}

/** Whether every one of these parameters is published at least at `minimum`. */
function reached(engineeringSummary, ids, minimum) {
  return ids.every((id) => {
    const level = levelNumber(engineeringSummary, id);
    return level !== null && level >= minimum;
  });
}

/** The screen the cinema was designed around: 185" 2.35:1. */
function screenPhrase(projectDetails) {
  const size = Number(projectDetails?.screen_size);
  const aspect = String(projectDetails?.aspect_ratio || '').trim();
  const parts = [];
  if (Number.isFinite(size) && size > 0) parts.push(`${Math.round(size)}"`);
  if (aspect) parts.push(aspect);
  return parts.join(' ') || null;
}

/** The seating, as the report's own row grouping sees it. */
function seatingRowPhrase(seatingPositions) {
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
 * @param {Object}  [input.projectDetails]     — the saved project (architecture, screen)
 * @param {Object}  [input.productsSelected]    — the report's own product schedule
 * @param {Array}   [input.seatingPositions]    — the design's seating
 * @param {Object}  [input.engineeringSummary]  — the published engineering summary
 * @returns {string|null}
 */
export function buildProjectReportSummaryOpening({
  projectDetails = null,
  productsSelected = null,
  seatingPositions = [],
  engineeringSummary = null,
} = {}) {
  const architecture = String(projectDetails?.dolby_config || '').trim() || null;
  const screen = screenPhrase(projectDetails);
  const rows = seatingRowPhrase(seatingPositions);

  const lcr = firstModel(productsSelected?.lcr);
  const surrounds = firstModel(productsSelected?.surrounds);
  const overheads = firstModel(productsSelected?.overheads);

  const subwooferCount = totalCount(productsSelected?.subwoofers);
  const subwooferModels = [...new Set(productParts(productsSelected?.subwoofers).map(partModel).filter(Boolean))];
  const subwoofers = subwooferCount > 0
    ? `${word(subwooferCount)} ${subwooferModels.length === 1 ? `${subwooferModels[0]} ` : ''}subwoofer${subwooferCount === 1 ? '' : 's'}`
    : null;

  const treatmentCount = totalCount(productsSelected?.acoustic_treatment);
  const treatmentModel = firstModel(productsSelected?.acoustic_treatment);
  const treatment = (treatmentCount > 0 && treatmentModel)
    ? `${word(treatmentCount)} ${treatmentModel}${treatmentCount === 1 ? '' : 's'}`
    : null;

  const stages = [
    lcr && `a ${lcr} screen stage`,
    surrounds && `a ${surrounds} surround and wide layer`,
    overheads && `${overheads} overhead speakers`,
  ].filter(Boolean);

  const around = [];
  if (screen) around.push(`a ${screen} screen`);
  if (rows) around.push(rows);

  const opening = architecture ? `This ${architecture} cinema` : 'This cinema';
  const sentences = [];
  if (around.length > 0) {
    sentences.push(`${opening} is built around ${joinList(around)}${stages.length ? `, with ${joinList(stages)}` : ''}.`);
  } else if (stages.length > 0) {
    sentences.push(`${opening} is built on ${joinList(stages)}.`);
  }

  // A strength is stated only where the published assessment supports it.
  const strengths = [
    reached(engineeringSummary, [12, 13, 14], 2) && 'strong dynamic capability',
    reached(engineeringSummary, [16, 17], 2) && 'strong tonal consistency',
    reached(engineeringSummary, [19], 3) && 'excellent primary-seat bass response',
  ].filter(Boolean);

  const completing = [subwoofers, treatment].filter(Boolean);
  if (completing.length > 0) {
    const completingPhrase = joinList(completing);
    sentences.push(`${completingPhrase.charAt(0).toUpperCase()}${completingPhrase.slice(1)} complete the system${strengths.length ? `, giving the room ${joinList(strengths)}` : ''}.`);
  } else if (strengths.length > 0) {
    sentences.push(`The design delivers ${joinList(strengths)}.`);
  }

  return sentences.length > 0 ? sentences.join(' ') : null;
}

export default buildProjectReportSummaryOpening;