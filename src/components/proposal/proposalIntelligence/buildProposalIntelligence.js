/**
 * buildProposalIntelligence.js
 * --------------------------------
 * Proposal Intelligence — the decision-making layer.
 *
 *   Engineering Authority  → project-specific facts
 *   Product Intelligence   → manufacturer knowledge
 *          ↓
 *   Proposal Intelligence  → editorial decisions (THIS MODULE)
 *          ↓
 *   Narrative Spine → Proposal Writing → Editorial Review → Publishing
 *
 * Proposal Intelligence receives Engineering Authority and Product
 * Intelligence and returns a single structured object of editorial
 * decisions. It does not write proposals. It does not generate HTML. It
 * does not produce paragraphs. It decides what the proposal should
 * communicate and why.
 *
 * RULES:
 *   - Never calculates RP22, bass, or any engineering.
 *   - Never invents specifications or engineering facts.
 *   - Only interprets existing knowledge from the two authority layers.
 *   - Every decision carries confidence.
 *   - Low engineering confidence produces cautious recommendations.
 *
 * Pure function. No GPT. No side effects.
 */

import { confidenceFloor, confidenceAverage, letterToNumeric, withDecisionConfidence } from './confidence';
import { deriveStrategy, deriveProposalFlow } from './deriveStrategy';
import { deriveMessages } from './deriveMessages';
import { deriveProjectStrengths, deriveHonestLimitations } from './deriveEvidence';
import { deriveProductHighlights, deriveUpgradeOpportunities } from './deriveProducts';
import { deriveImageStory, deriveAudienceAwareness } from './derivePresentation';

export const PROPOSAL_INTELLIGENCE_VERSION = '1.0';

/**
 * Build a complete Proposal Intelligence object.
 *
 * @param {Object} params
 * @param {Object} params.engineeringAuthority  — from buildEngineeringAuthority()
 * @param {Array}  [params.productIntelligence] — array of buildProductIntelligence() outputs
 * @returns {Object} Proposal Intelligence object (structured editorial decisions only)
 */
export function buildProposalIntelligence(params = {}) {
  const { engineeringAuthority, productIntelligence } = params;

  if (!engineeringAuthority) {
    return {
      schema_version: PROPOSAL_INTELLIGENCE_VERSION,
      status: 'unavailable',
      reason: 'no_engineering_authority',
      proposal_strategy: null,
      primary_messages: [],
      secondary_messages: [],
      project_strengths: [],
      honest_limitations: [],
      upgrade_opportunities: [],
      product_highlights: [],
      image_story: [],
      proposal_flow: [],
      audience_awareness: null,
      confidence: { overall: 0, engineering_floor: 0, product_average: 0, influenced_by: [] },
      meta: { has_engineering_authority: false, has_product_intelligence: false },
    };
  }

  // ── Confidence aggregation ──
  const engineeringFloor = computeEngineeringFloor(engineeringAuthority);
  const productAverage = computeProductAverage(productIntelligence);
  const overallConfidence = computeOverallConfidence(engineeringFloor, productAverage);
  const influencedBy = computeInfluences(engineeringAuthority, productIntelligence);

  const sharedInputs = { engineeringAuthority, productIntelligence, engineeringFloor };

  // ── Derive all editorial decisions ──
  const strategy = deriveStrategy(sharedInputs);
  const flow = deriveProposalFlow(sharedInputs);
  const { primary_messages, secondary_messages } = deriveMessages(sharedInputs);
  const project_strengths = deriveProjectStrengths(sharedInputs);
  const honest_limitations = deriveHonestLimitations(sharedInputs);
  const product_highlights = deriveProductHighlights(sharedInputs);
  const upgrade_opportunities = deriveUpgradeOpportunities(sharedInputs);
  const image_story = deriveImageStory(sharedInputs);
  const audience_awareness = deriveAudienceAwareness(sharedInputs);

  // ── Status ──
  const hasEngineering = !!engineeringAuthority?.room?.dimensions;
  const hasProducts = Array.isArray(productIntelligence) && productIntelligence.some((p) => p?.status === 'complete');
  const status = hasEngineering && hasProducts ? 'complete' : hasEngineering ? 'partial' : 'partial';

  return {
    schema_version: PROPOSAL_INTELLIGENCE_VERSION,
    status,
    proposal_strategy: strategy,
    primary_messages,
    secondary_messages,
    project_strengths,
    honest_limitations,
    upgrade_opportunities,
    product_highlights,
    image_story,
    proposal_flow: flow,
    audience_awareness,
    confidence: {
      ...withDecisionConfidence(overallConfidence),
      engineering_floor: engineeringFloor,
      product_average: productAverage,
      influenced_by: influencedBy,
    },
    meta: {
      has_engineering_authority: hasEngineering,
      has_product_intelligence: hasProducts,
      product_intelligence_count: Array.isArray(productIntelligence) ? productIntelligence.length : 0,
      narrative_goal: engineeringAuthority?.metadata?.narrative_goal || null,
      audience: engineeringAuthority?.metadata?.audience || null,
    },
  };
}

/** Extract the lowest confidence from the Engineering Authority. */
function computeEngineeringFloor(authority) {
  const values = [];
  if (!authority) return 0;

  if (authority.room?.confidence) values.push(authority.room.confidence);
  if (authority.system?.configuration?.confidence) values.push(authority.system.configuration.confidence);
  if (authority.rp22?.confidence) values.push(authority.rp22.confidence);
  if (authority.bass?.confidence) values.push(authority.bass.confidence);
  if (authority.viewing?.confidence) values.push(authority.viewing.confidence);

  return confidenceFloor(values);
}

/** Average confidence across all Product Intelligence objects. */
function computeProductAverage(productIntelligence) {
  if (!Array.isArray(productIntelligence)) return 0;
  const values = productIntelligence
    .filter((p) => p && p.status === 'complete')
    .map((p) => letterToNumeric(p.confidence?.overall || 'D'));
  return confidenceAverage(values);
}

/** Overall confidence = floor of engineering and product confidence. */
function computeOverallConfidence(engineeringFloor, productAverage) {
  if (engineeringFloor <= 0 && productAverage <= 0) return 0;
  if (engineeringFloor <= 0) return productAverage;
  if (productAverage <= 0) return engineeringFloor;
  return Math.min(engineeringFloor, productAverage);
}

/** List the confidence sources that influenced the overall confidence. */
function computeInfluences(authority, productIntelligence) {
  const influences = [];
  if (authority?.rp22?.confidence) influences.push('rp22_engineering');
  if (authority?.bass?.confidence) influences.push('bass_simulation');
  if (authority?.room?.confidence) influences.push('room_geometry');
  if (Array.isArray(productIntelligence) && productIntelligence.length > 0) {
    influences.push('product_intelligence');
  }
  return influences;
}