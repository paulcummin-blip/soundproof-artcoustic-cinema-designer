/**
 * possibleDuplicates.js
 * ---------------------
 * Advisory detection of likely duplicate commercial project families.
 *
 * Conservative by design:
 *   · two projects must belong to the SAME account, and
 *   · at least TWO independent signals must agree.
 *
 * Signals: similar project name, similar client name, identical project
 * reference, created within a short window, similar room dimensions.
 *
 * Advisory only. Nothing is merged, grouped or written: this produces a list for
 * an admin to read. No writes of any kind.
 *
 * Pure: no React, no side effects.
 */

import { similarity, dayDiff, safeObject } from './reportingUtils';

const SIMILARITY_THRESHOLD = 0.8;
const DIMENSION_TOLERANCE_M = 0.15;
const CREATED_WITHIN_DAYS = 14;

/** Room dimensions from the active design state, then the legacy project fields. */
export function roomDimsOf(project, activeVersion) {
  const state = safeObject(activeVersion?.design_state) || {};
  const dims = safeObject(state.roomDims)
    || safeObject(project?.roomDims)
    || { widthM: project?.room_width, lengthM: project?.room_length, heightM: project?.room_height };
  const width = Number(dims?.widthM);
  const length = Number(dims?.lengthM);
  const height = Number(dims?.heightM);
  if (!Number.isFinite(width) || !Number.isFinite(length)) return null;
  return { widthM: width, lengthM: length, heightM: Number.isFinite(height) ? height : null };
}

/**
 * @param {Array} families — the filtered project families
 * @returns {Array<{ aId, aName, bId, bName, accountName, signals, score }>}
 */
export function detectPossibleDuplicates(families = []) {
  const duplicates = [];

  for (let i = 0; i < families.length; i += 1) {
    for (let j = i + 1; j < families.length; j += 1) {
      const a = families[i];
      const b = families[j];
      if (!a.accountId || a.accountId !== b.accountId) continue;

      const signals = [];
      if (similarity(a.name, b.name) >= SIMILARITY_THRESHOLD) signals.push('Similar project name');
      if (a.client && b.client && similarity(a.client, b.client) >= SIMILARITY_THRESHOLD) signals.push('Similar client name');
      if (a.reference && b.reference && a.reference.trim().toLowerCase() === b.reference.trim().toLowerCase()) {
        signals.push('Same project reference');
      }
      const gap = dayDiff(a.createdDate, b.createdDate);
      if (gap !== null && gap <= CREATED_WITHIN_DAYS) signals.push(`Created within ${CREATED_WITHIN_DAYS} days`);

      const dimsA = a.roomDims;
      const dimsB = b.roomDims;
      if (dimsA && dimsB
        && Math.abs(dimsA.widthM - dimsB.widthM) <= DIMENSION_TOLERANCE_M
        && Math.abs(dimsA.lengthM - dimsB.lengthM) <= DIMENSION_TOLERANCE_M
        && (dimsA.heightM === null || dimsB.heightM === null
          || Math.abs(dimsA.heightM - dimsB.heightM) <= DIMENSION_TOLERANCE_M)) {
        signals.push('Similar room dimensions');
      }

      if (signals.length < 2) continue;

      duplicates.push({
        aId: a.id,
        aName: a.name,
        aClient: a.client,
        bId: b.id,
        bName: b.name,
        bClient: b.client,
        accountName: a.accountName || a.dealerName || null,
        signals,
        score: signals.length,
      });
    }
  }

  return duplicates.sort((a, b) => b.score - a.score);
}

export const DUPLICATE_RULES = Object.freeze({
  SIMILARITY_THRESHOLD,
  DIMENSION_TOLERANCE_M,
  CREATED_WITHIN_DAYS,
});