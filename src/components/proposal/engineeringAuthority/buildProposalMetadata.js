/**
 * buildProposalMetadata.js
 * --------------------------------
 * Layer 1 — Proposal metadata sub-authority.
 * Pure function. No GPT. No side effects.
 */

const GOAL_LABELS = {
  luxury_cinema: 'Luxury Cinema',
  family_media_room: 'Family Media Room',
  reference_performance: 'Reference Performance',
  best_value: 'Best Value',
  future_proof: 'Future Proof',
};

export function buildProposalMetadata(metadata = {}) {
  return {
    narrative_goal: metadata.narrative_goal || 'luxury_cinema',
    narrative_goal_label: GOAL_LABELS[metadata.narrative_goal] || 'Luxury Cinema',
    audience: metadata.audience || 'homeowner',
    language: metadata.language || 'en-GB',
    word_count: metadata.word_count || 'standard',
    tone: metadata.tone || 'professional',
  };
}