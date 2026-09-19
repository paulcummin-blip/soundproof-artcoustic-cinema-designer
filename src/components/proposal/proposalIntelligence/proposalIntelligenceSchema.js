/**
 * Proposal Intelligence — output schema definition.
 *
 * Documents the shape of the object returned by buildProposalIntelligence.
 * This is a contract, not runtime validation — the module always returns
 * this shape.
 */

export const PROPOSAL_INTELLIGENCE_SCHEMA = {
  schema_version: 'string (e.g. "1.0")',
  status: 'complete | partial | unavailable',

  proposal_strategy: {
    strategy: 'string — luxury | balanced_family_cinema | reference_performance | best_value | future_proof',
    narrative_goal: 'string — the dealer-selected narrative goal',
    evidence_supported: 'boolean — does engineering evidence support this strategy?',
    gap_note: 'string | null — acknowledged gap between narrative and evidence',
    rationale: {
      intended_story: 'string',
      key_strengths: 'string[]',
      acknowledged_gaps: 'string[]',
      design_rating: 'string | null',
    },
    confidence: 'number (0.0–0.99)',
    confidence_letter: 'A | B | C | D',
  },

  primary_messages: [
    {
      rank: 'number (1–3)',
      message: 'string — short editorial decision, not proposal copy',
      why: 'string — why this message matters',
      evidence: 'string — traceable reference to the source field',
      confidence: 'number (0.0–0.99)',
      confidence_letter: 'A | B | C | D',
    },
  ],

  secondary_messages: [
    {
      message: 'string',
      why: 'string',
      evidence: 'string',
      confidence: 'number',
      confidence_letter: 'string',
    },
  ],

  project_strengths: [
    {
      strength: 'string — what to celebrate (engineering evidence only)',
      evidence: 'string',
      confidence: 'number',
      confidence_letter: 'string',
    },
  ],

  honest_limitations: [
    {
      limitation: 'string — the compromise',
      professional_framing: 'string — how to acknowledge it professionally',
      confidence: 'number',
      confidence_letter: 'string',
    },
  ],

  upgrade_opportunities: [
    {
      opportunity: 'string',
      engineering_benefit: 'string — why it would help',
      confidence: 'number',
      confidence_letter: 'string',
    },
  ],

  product_highlights: [
    {
      product_id: 'string',
      product_name: 'string',
      role: 'string | null',
      highlight: 'string — the product story',
      why_deserves_coverage: 'string',
      confidence: 'number',
      confidence_letter: 'string',
    },
  ],

  image_story: [
    {
      section: 'string — cover | executive_summary | system_overview | room_images | performance | construction',
      editorial_intent: 'string — why an image belongs here',
      available: 'boolean — whether a matching asset exists',
      asset_type: 'string | null',
      confidence: 'number',
      confidence_letter: 'string',
    },
  ],

  proposal_flow: [
    {
      order: 'number',
      section: 'string — room | system | performance | products | conclusion',
      emphasis: 'string — what to emphasise in this section',
      confidence: 'number',
      confidence_letter: 'string',
    },
  ],

  audience_awareness: {
    audience: 'string — homeowner | architect | interior_designer | commercial',
    emphasis_shifts: 'string[] — how emphasis changes for this audience',
    confidence: 'number',
    confidence_letter: 'string',
  },

  confidence: {
    confidence: 'number — overall Proposal Intelligence confidence',
    confidence_letter: 'string',
    engineering_floor: 'number — lowest engineering confidence used',
    product_average: 'number — average product intelligence confidence',
    influenced_by: 'string[] — which authority layers influenced the confidence',
  },

  meta: {
    has_engineering_authority: 'boolean',
    has_product_intelligence: 'boolean',
    product_intelligence_count: 'number',
    narrative_goal: 'string | null',
    audience: 'string | null',
  },
};