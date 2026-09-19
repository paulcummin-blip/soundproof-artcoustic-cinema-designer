/**
 * deriveStrategy.js
 * --------------------------------
 * Derive the proposal strategy and editorial flow.
 *
 * Strategy = the overall story the proposal should tell.
 * Flow     = the editorial order of emphasis (not page order).
 *
 * Pure function. No GPT. No side effects. No invention.
 */

import { withDecisionConfidence } from './confidence';

const STRATEGY_MAP = {
  luxury_cinema: 'luxury',
  family_media_room: 'balanced_family_cinema',
  reference_performance: 'reference_performance',
  best_value: 'best_value',
  future_proof: 'future_proof',
};

const FLOW_MAP = {
  luxury_cinema: [
    { section: 'room', emphasis: 'The space as a destination' },
    { section: 'system', emphasis: 'Complete immersive architecture' },
    { section: 'performance', emphasis: 'Validated engineering results' },
    { section: 'products', emphasis: 'Premium product selections' },
    { section: 'conclusion', emphasis: 'The investment in experience' },
  ],
  reference_performance: [
    { section: 'performance', emphasis: 'Measured engineering achievement' },
    { section: 'system', emphasis: 'System architecture enabling the results' },
    { section: 'room', emphasis: 'Room as the acoustic foundation' },
    { section: 'products', emphasis: 'Products chosen for accuracy' },
    { section: 'conclusion', emphasis: 'Reference-standard playback' },
  ],
  best_value: [
    { section: 'system', emphasis: 'Maximum capability per pound' },
    { section: 'performance', emphasis: 'Engineering results that matter' },
    { section: 'products', emphasis: 'Efficient product selections' },
    { section: 'room', emphasis: 'Practical room considerations' },
    { section: 'conclusion', emphasis: 'Value without compromise' },
  ],
  family_media_room: [
    { section: 'room', emphasis: 'A room for the whole family' },
    { section: 'system', emphasis: 'Accessible immersive entertainment' },
    { section: 'products', emphasis: 'Practical product selections' },
    { section: 'performance', emphasis: 'Everyday performance' },
    { section: 'conclusion', emphasis: 'Family entertainment for years' },
  ],
  future_proof: [
    { section: 'system', emphasis: 'Architecture designed to evolve' },
    { section: 'products', emphasis: 'Upgrade-ready foundation' },
    { section: 'performance', emphasis: 'Current capability with headroom' },
    { section: 'room', emphasis: 'Room ready for future expansion' },
    { section: 'conclusion', emphasis: 'An investment that grows' },
  ],
};

/**
 * Derive the proposal strategy from the narrative goal, validated against
 * engineering evidence. If the evidence does not support the intended
 * narrative, the strategy notes the gap rather than ignoring it.
 */
export function deriveStrategy({ engineeringAuthority, engineeringFloor }) {
  const metadata = engineeringAuthority?.metadata || {};
  const narrativeGoal = metadata.narrative_goal || 'luxury_cinema';
  const strategy = STRATEGY_MAP[narrativeGoal] || 'balanced';

  const rp22 = engineeringAuthority?.rp22 || {};
  const strengths = rp22.strengths || [];
  const weaknesses = rp22.weaknesses || [];
  const designRating = rp22.overall_design_rating;

  // Determine whether engineering evidence supports the strategy
  const hasHighAchievement = strengths.some((s) => s.achieved_level === 'L4' || s.achieved_level === 'L3');
  const hasSignificantWeakness = weaknesses.some((w) => w.achieved_level === 'FAIL' || w.achieved_level === 'L1');

  let evidenceSupported = true;
  let gapNote = null;

  if (strategy === 'reference_performance' && !hasHighAchievement) {
    evidenceSupported = false;
    gapNote = 'Reference performance narrative selected, but no L3/L4 RP22 parameters achieved — strategy should acknowledge current capability level.';
  }
  if (strategy === 'luxury' && hasSignificantWeakness) {
    evidenceSupported = true; // Luxury can coexist with limitations, but they must be acknowledged
    gapNote = 'Luxury narrative selected with significant RP22 weaknesses — honest limitations section is essential.';
  }

  const rationale = buildRationale(strategy, narrativeGoal, strengths, weaknesses, designRating);

  return {
    strategy,
    narrative_goal: narrativeGoal,
    evidence_supported: evidenceSupported,
    gap_note: gapNote,
    rationale,
    ...withDecisionConfidence(engineeringFloor),
  };
}

function buildRationale(strategy, narrativeGoal, strengths, weaknesses, designRating) {
  const strengthTitles = strengths.slice(0, 3).map((s) => s.title);
  const weaknessTitles = weaknesses.slice(0, 2).map((w) => w.title);

  return {
    intended_story: `Dealer selected a ${narrativeGoal.replace(/_/g, ' ')} narrative.`,
    key_strengths: strengthTitles,
    acknowledged_gaps: weaknessTitles,
    design_rating: designRating?.statement || null,
  };
}

/**
 * Derive the editorial flow — the order of emphasis, independent of the
 * document template. Different narratives lead with different emphases.
 */
export function deriveProposalFlow({ engineeringAuthority, engineeringFloor }) {
  const narrativeGoal = engineeringAuthority?.metadata?.narrative_goal || 'luxury_cinema';
  const flow = FLOW_MAP[narrativeGoal] || FLOW_MAP.luxury_cinema;

  return flow.map((step, index) => ({
    order: index + 1,
    section: step.section,
    emphasis: step.emphasis,
    ...withDecisionConfidence(engineeringFloor),
  }));
}