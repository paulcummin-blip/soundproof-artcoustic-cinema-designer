/**
 * selectClientP7FrontWides
 * -------------------------
 * Pure selector for the P7 Front Wide Placement Visual Report page.
 *
 * Reads the canonical P7 level and per-side deviation data from
 * analysisResult.gradedParameters.primary[7]. Extracts front wide
 * positions (LW, RW), FL/FR positions, and RSP for the plan-view diagram.
 *
 * Returns null when no front wides are present — the Visual Report omits
 * the P7 page entirely in that case.
 *
 * No local re-grading — the P7 level comes directly from the canonical authority.
 */

import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

function normalizeRole(role) {
  return getCanonicalRole(role);
}

function getSpeakerPos(s) {
  if (!s) return null;
  if (s.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y)) {
    return { x: s.position.x, y: s.position.y };
  }
  if (s.pos && Number.isFinite(s.pos.x) && Number.isFinite(s.pos.y)) {
    return { x: s.pos.x, y: s.pos.y };
  }
  if (Number.isFinite(s.x) && Number.isFinite(s.y)) {
    return { x: s.x, y: s.y };
  }
  return null;
}

/**
 * @param {Object} analysisResult - from useRP22AnalysisEngine
 * @param {Array} placedSpeakers - actual placed speaker array
 * @param {Object} rsp - { x, y, z } reference seating position
 * @returns {Object|null} P7 front wide data or null if no wides
 */
export function selectClientP7FrontWides(analysisResult, placedSpeakers, rsp) {
  if (!analysisResult || !Array.isArray(placedSpeakers)) return null;

  // Find front wides
  const lwSpeaker = placedSpeakers.find((s) => normalizeRole(s?.role) === "LW");
  const rwSpeaker = placedSpeakers.find((s) => normalizeRole(s?.role) === "RW");

  const lwPos = getSpeakerPos(lwSpeaker);
  const rwPos = getSpeakerPos(rwSpeaker);

  // No wides → no P7 page
  if (!lwPos || !rwPos) return null;

  // Find FL/FR for the diagram
  const flSpeaker = placedSpeakers.find((s) => normalizeRole(s?.role) === "FL");
  const frSpeaker = placedSpeakers.find((s) => normalizeRole(s?.role) === "FR");
  const flPos = getSpeakerPos(flSpeaker);
  const frPos = getSpeakerPos(frSpeaker);

  // Canonical P7 result
  const p7Param = analysisResult?.gradedParameters?.primary?.[7];
  if (!p7Param) return null;

  const level = p7Param.level || null;
  const maxDeviation = Number.isFinite(p7Param.value) ? p7Param.value : null;
  const perSide = p7Param.perSide || null;

  // Median reference point (midpoint of LW and RW)
  const medianPoint = {
    x: (lwPos.x + rwPos.x) / 2,
    y: (lwPos.y + rwPos.y) / 2,
  };

  // RSP position
  const rspX = Number(rsp?.x);
  const rspY = Number(rsp?.y);
  const rspValid = Number.isFinite(rspX) && Number.isFinite(rspY);

  return {
    level,
    maxDeviation,
    perSide,
    lwPos,
    rwPos,
    flPos,
    frPos,
    medianPoint,
    rsp: rspValid ? { x: rspX, y: rspY } : null,
  };
}