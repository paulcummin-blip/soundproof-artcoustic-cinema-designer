// stage1CandidateGenerator.js
// Generates Stage 1 placement candidates per family and quantity.
// Point-source model: positions are acoustic centres. No cabinet dimensions.
// All coordinates are normalised (xNorm, yNorm).

import { FAMILY_IDS, FAMILY_SEEDS, ENABLED_FAMILIES } from "./stage1FamilyRegistry";
import { STAGE1_LOCAL_SEARCH, STAGE1_CANDIDATE_BUDGETS } from "./stage1Constants";
import { filterAProhibited } from "./stage1GeometryValidator";

const roundNorm = (v) => Math.round(v * 1000) / 1000;

function makeSource(xNorm, yNorm) {
  return { xNorm: roundNorm(xNorm), yNorm: roundNorm(yNorm) };
}

function makeCandidate(familyId, sources, searchTier = 1, symmetryState = "symmetric", seedDisplacement = 0) {
  const id = `${familyId}:${sources.map((s) => `${s.xNorm}_${s.yNorm}`).join("|")}`;
  return { id, familyId, sources, searchTier, symmetryState, seedDisplacement: roundNorm(seedDisplacement) };
}

// ── Parameterised symmetric families ───────────────────────────────────

function generateC_FRONT_PAIR() {
  const candidates = [];
  const { coarseRange, coarseStep, fineStep, fineRadius } = STAGE1_LOCAL_SEARCH;
  // Coarse search: q from 0.15 to 0.35
  for (let q = coarseRange.min; q <= coarseRange.max + 1e-9; q += coarseStep) {
    const sources = [makeSource(q, 0), makeSource(1 - q, 0)];
    const displacement = Math.abs(q - 0.25);
    candidates.push(makeCandidate(FAMILY_IDS.C_FRONT_PAIR, sources, 1, "symmetric", displacement));
  }
  return candidates;
}

function generateC_FRONT_PAIR_Fine(bestQ) {
  const { fineStep, fineRadius } = STAGE1_LOCAL_SEARCH;
  const candidates = [];
  for (let q = bestQ - fineRadius; q <= bestQ + fineRadius + 1e-9; q += fineStep) {
    if (q < 0.05 || q > 0.45) continue;
    const sources = [makeSource(q, 0), makeSource(1 - q, 0)];
    const displacement = Math.abs(q - 0.25);
    candidates.push(makeCandidate(FAMILY_IDS.C_FRONT_PAIR, sources, 1, "symmetric", displacement));
  }
  return candidates;
}

function generateRP22_F() {
  const candidates = [];
  // Exact midpoint pair
  candidates.push(makeCandidate(FAMILY_IDS.RP22_F, [makeSource(0.5, 0), makeSource(0.5, 1)], 1, "symmetric", 0));
  // Symmetric lateral offsets: (0.50±d, 0), (0.50±d, 1)
  for (const d of [0.05, 0.10, 0.15]) {
    const sources = [makeSource(0.5 - d, 0), makeSource(0.5 + d, 0), makeSource(0.5 - d, 1), makeSource(0.5 + d, 1)];
    // F is 2-sub: use paired lateral offset on front+rear
    const sources2 = [makeSource(0.5 - d, 0), makeSource(0.5 + d, 0)];
    candidates.push(makeCandidate(FAMILY_IDS.RP22_F, [makeSource(0.5, 0), makeSource(0.5, 1)], 1, "symmetric", 0));
  }
  // Limited common lateral shift: (0.50+s, 0), (0.50+s, 1)
  for (const s of [-0.10, -0.05, 0.05, 0.10]) {
    const sources = [makeSource(0.5 + s, 0), makeSource(0.5 + s, 1)];
    candidates.push(makeCandidate(FAMILY_IDS.RP22_F, sources, 1, "symmetric", Math.abs(s)));
  }
  // Deduplicate by id
  const seen = new Map();
  for (const c of candidates) seen.set(c.id, c);
  return Array.from(seen.values());
}

function generateRP22_G() {
  const candidates = [];
  // Search along length preserving L/R symmetry: (0, y), (1, y)
  const yPositions = [0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75];
  for (const y of yPositions) {
    const sources = [makeSource(0, y), makeSource(1, y)];
    const displacement = Math.abs(y - 0.50);
    candidates.push(makeCandidate(FAMILY_IDS.RP22_G, sources, 1, "symmetric", displacement));
  }
  return candidates;
}

function generateRP22_C() {
  const candidates = [];
  const { coarseRange, coarseStep } = STAGE1_LOCAL_SEARCH;
  for (let q = coarseRange.min; q <= coarseRange.max + 1e-9; q += coarseStep) {
    const sources = [
      makeSource(q, 0), makeSource(1 - q, 0),
      makeSource(q, 1), makeSource(1 - q, 1),
    ];
    const displacement = Math.abs(q - 0.25);
    candidates.push(makeCandidate(FAMILY_IDS.RP22_C, sources, 1, "symmetric", displacement));
  }
  return candidates;
}

function generateRP22_C_Fine(bestQ) {
  const { fineStep, fineRadius } = STAGE1_LOCAL_SEARCH;
  const candidates = [];
  for (let q = bestQ - fineRadius; q <= bestQ + fineRadius + 1e-9; q += fineStep) {
    if (q < 0.05 || q > 0.45) continue;
    const sources = [
      makeSource(q, 0), makeSource(1 - q, 0),
      makeSource(q, 1), makeSource(1 - q, 1),
    ];
    const displacement = Math.abs(q - 0.25);
    candidates.push(makeCandidate(FAMILY_IDS.RP22_C, sources, 1, "symmetric", displacement));
  }
  return candidates;
}

function generateRP22_E() {
  const candidates = [];
  // Exact corners
  candidates.push(makeCandidate(FAMILY_IDS.RP22_E, [
    makeSource(0, 0), makeSource(1, 0), makeSource(0, 1), makeSource(1, 1),
  ], 1, "symmetric", 0));
  // Small symmetric movement along both walls: (d, d), (1-d, d), (d, 1-d), (1-d, 1-d)
  for (const d of [0.02, 0.05, 0.08]) {
    candidates.push(makeCandidate(FAMILY_IDS.RP22_E, [
      makeSource(d, d), makeSource(1 - d, d), makeSource(d, 1 - d), makeSource(1 - d, 1 - d),
    ], 1, "symmetric", d));
  }
  // Along front/rear walls only: (d, 0), (1-d, 0), (d, 1), (1-d, 1)
  for (const d of [0.02, 0.05]) {
    candidates.push(makeCandidate(FAMILY_IDS.RP22_E, [
      makeSource(d, 0), makeSource(1 - d, 0), makeSource(d, 1), makeSource(1 - d, 1),
    ], 1, "symmetric", d));
  }
  return candidates;
}

function generateRP22_D() {
  const candidates = [];
  const { coarseRange, coarseStep } = STAGE1_LOCAL_SEARCH;
  for (let q = coarseRange.min; q <= coarseRange.max + 1e-9; q += coarseStep) {
    const sources = [
      makeSource(0, q), makeSource(1, q),
      makeSource(0, 1 - q), makeSource(1, 1 - q),
    ];
    const displacement = Math.abs(q - 0.25);
    candidates.push(makeCandidate(FAMILY_IDS.RP22_D, sources, 1, "symmetric", displacement));
  }
  return candidates;
}

function generateRP22_D_Fine(bestQ) {
  const { fineStep, fineRadius } = STAGE1_LOCAL_SEARCH;
  const candidates = [];
  for (let q = bestQ - fineRadius; q <= bestQ + fineRadius + 1e-9; q += fineStep) {
    if (q < 0.05 || q > 0.45) continue;
    const sources = [
      makeSource(0, q), makeSource(1, q),
      makeSource(0, 1 - q), makeSource(1, 1 - q),
    ];
    const displacement = Math.abs(q - 0.25);
    candidates.push(makeCandidate(FAMILY_IDS.RP22_D, sources, 1, "symmetric", displacement));
  }
  return candidates;
}

// ── One-sub generation ──────────────────────────────────────────────────

function generateOneSub() {
  const candidates = [];
  const { frontWallRange, coarseStep } = STAGE1_LOCAL_SEARCH;

  // Priority 1: Front wall
  // Front midpoint
  candidates.push(makeCandidate(FAMILY_IDS.ONE_FRONT_MID, [makeSource(0.50, 0)], 1, "symmetric", 0));
  // Front quarter positions
  candidates.push(makeCandidate(FAMILY_IDS.ONE_FRONT_QUARTER, [makeSource(0.25, 0)], 1, "symmetric", 0));
  candidates.push(makeCandidate(FAMILY_IDS.ONE_FRONT_QUARTER, [makeSource(0.75, 0)], 1, "symmetric", 0));
  // Local front-wall search
  for (let x = frontWallRange.min; x <= frontWallRange.max + 1e-9; x += coarseStep) {
    if (Math.abs(x - 0.25) < 0.005 || Math.abs(x - 0.50) < 0.005 || Math.abs(x - 0.75) < 0.005) continue;
    const displacement = Math.min(Math.abs(x - 0.25), Math.abs(x - 0.50), Math.abs(x - 0.75));
    const familyId = displacement < 0.05 ? FAMILY_IDS.ONE_FRONT_QUARTER : FAMILY_IDS.ONE_BOUNDARY_CUSTOM;
    candidates.push(makeCandidate(familyId, [makeSource(x, 0)], 1, "symmetric", displacement));
  }

  // Priority 2: Rear / Side wall
  candidates.push(makeCandidate(FAMILY_IDS.ONE_REAR_MID, [makeSource(0.50, 1)], 2, "symmetric", 0));
  for (const y of [0.25, 0.75]) {
    candidates.push(makeCandidate(FAMILY_IDS.ONE_SIDE_QUARTER, [makeSource(0, y)], 2, "symmetric", 0));
    candidates.push(makeCandidate(FAMILY_IDS.ONE_SIDE_QUARTER, [makeSource(1, y)], 2, "symmetric", 0));
  }

  // Deduplicate
  const seen = new Map();
  for (const c of candidates) seen.set(c.id, c);
  return Array.from(seen.values());
}

// ── Two-sub fallback ────────────────────────────────────────────────────

function generateTwoSubFallback() {
  const candidates = [];
  // Rear quarter pair
  candidates.push(makeCandidate(FAMILY_IDS.TWO_SYMMETRIC_BOUNDARY_CUSTOM, [makeSource(0.25, 1), makeSource(0.75, 1)], 2, "symmetric", 0));
  // Symmetric front/rear boundary pair (offset from F)
  for (const d of [0.10, 0.20]) {
    candidates.push(makeCandidate(FAMILY_IDS.TWO_SYMMETRIC_BOUNDARY_CUSTOM, [makeSource(0.5 - d, 0), makeSource(0.5 + d, 1)], 2, "symmetric", d));
  }
  return candidates;
}

// ── Four-sub fallback ────────────────────────────────────────────────────

function generateFourSubFallback() {
  const candidates = [];
  // Custom symmetric boundary: front/rear midpoints + side midpoints (not B — different topology)
  candidates.push(makeCandidate(FAMILY_IDS.FOUR_SYMMETRIC_BOUNDARY_CUSTOM, [
    makeSource(0.25, 0), makeSource(0.75, 0), makeSource(0.25, 1), makeSource(0.75, 1),
  ], 2, "symmetric", 0));
  // Mixed: front quarter + rear midpoint pair
  candidates.push(makeCandidate(FAMILY_IDS.FOUR_SYMMETRIC_BOUNDARY_CUSTOM, [
    makeSource(0.20, 0), makeSource(0.80, 0), makeSource(0.20, 1), makeSource(0.80, 1),
  ], 2, "symmetric", 0.05));
  return candidates;
}

// ── Main generation entry point ─────────────────────────────────────────

const FAMILY_GENERATORS = {
  [FAMILY_IDS.C_FRONT_PAIR]: generateC_FRONT_PAIR,
  [FAMILY_IDS.RP22_F]: generateRP22_F,
  [FAMILY_IDS.RP22_G]: generateRP22_G,
  [FAMILY_IDS.RP22_C]: generateRP22_C,
  [FAMILY_IDS.RP22_E]: generateRP22_E,
  [FAMILY_IDS.RP22_D]: generateRP22_D,
};

/**
 * Generate all coarse candidates for a given quantity.
 * Applies A-prohibition filter and budget caps.
 * @param {number} quantity — 1, 2, or 4
 * @returns {{ candidates: Array, rejected: Array, familyCoverage: object }}
 */
export function generateStage1Candidates(quantity) {
  let candidates = [];
  const rejected = [];

  if (quantity === 1) {
    candidates = generateOneSub();
  } else if (quantity === 2) {
    for (const familyId of ENABLED_FAMILIES[2]) {
      const gen = FAMILY_GENERATORS[familyId];
      if (gen) candidates.push(...gen());
    }
    candidates.push(...generateTwoSubFallback());
  } else if (quantity === 4) {
    for (const familyId of ENABLED_FAMILIES[4]) {
      const gen = FAMILY_GENERATORS[familyId];
      if (gen) candidates.push(...gen());
    }
    candidates.push(...generateFourSubFallback());
  }

  // A-prohibition filter
  const { accepted, rejected: aRejected } = filterAProhibited(candidates);
  rejected.push(...aRejected);

  // Budget cap
  const budget = STAGE1_CANDIDATE_BUDGETS[quantity]?.normal || 100;
  const capped = accepted.slice(0, budget);

  // Family coverage
  const familyCoverage = {};
  for (const c of capped) {
    familyCoverage[c.familyId] = (familyCoverage[c.familyId] || 0) + 1;
  }

  return { candidates: capped, rejected, familyCoverage };
}

/**
 * Generate fine-search candidates around the best parameterised family candidate.
 * @param {string} familyId — family to fine-search
 * @param {number} bestParam — best parameterised value (q)
 * @returns {Array} fine candidates
 */
export function generateFineCandidates(familyId, bestParam) {
  if (familyId === FAMILY_IDS.C_FRONT_PAIR) return generateC_FRONT_PAIR_Fine(bestParam);
  if (familyId === FAMILY_IDS.RP22_C) return generateRP22_C_Fine(bestParam);
  if (familyId === FAMILY_IDS.RP22_D) return generateRP22_D_Fine(bestParam);
  return [];
}