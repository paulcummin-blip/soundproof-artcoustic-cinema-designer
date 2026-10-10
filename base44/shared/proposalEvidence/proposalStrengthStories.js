/**
 * proposalStrengthStories.js (shared)
 * -----------------------------------
 * The RANKED STRENGTH STORIES of one version, read from that version's canonical
 * Project Report `reportEvidence` through the ONE shared strength authority
 * (`selectStrengthStoriesFromReportEvidence`). The report's ADI Design Highlights
 * page runs the same authority over the same evidence, so a proposal can never
 * state a different set of strengths from the report it is built on.
 *
 * The writer is GIVEN this ranked list. It never decides for itself which
 * parameters matter: the selection has already decided eligibility, ordering and
 * every scope, and the writer turns the ranked stories into client-facing prose.
 *
 * What is NOT carried here: the canonical importance weights, the internal tier
 * labels and any design score. Ranking is already applied; only the ordered
 * stories travel onward.
 *
 * Pure: no React, no SDK, no GPT, no side effects.
 */

import { selectStrengthStoriesFromReportEvidence } from '../strengthEvidenceContext.js';
import { productEntries, modelCountLabel } from '../strengthStoryEvidence.js';

/** The stories a proposal may headline: the same headline set the report states. */
export const PROPOSAL_MAX_STORIES = 7;

/** The product layers that support each story, by the story's own id. */
const STORY_PRODUCT_LAYERS = Object.freeze({
  'dynamic-capability': ['lcr'],
  'tonal-consistency': ['lcr', 'surrounds'],
  'bass-output': ['subwoofers'],
  'low-frequency-extension': ['subwoofers'],
  'bass-extension-and-response': ['subwoofers'],
  'spatial-resolution': ['surrounds', 'overheads'],
  'immersive-layout': ['overheads', 'subwoofers'],
  'viewing-geometry': [],
  'product-selection': ['lcr', 'surrounds', 'overheads', 'subwoofers'],
});

const isParameterKey = (key) => /^P\d+$/.test(String(key));

/** The parameter IDs a story rests on: its members and its own evidence lines. */
function evidenceParameterIds(story) {
  const keys = [
    ...(story.members || []).map((member) => String(member?.key).toUpperCase()),
    ...(story.evidence || []).map((line) => String(line?.key).toUpperCase()),
    ...(story.sources || []).map((source) => String(source).split(':')[0].toUpperCase()),
  ];
  return [...new Set(keys.filter((key) => isParameterKey(key) || key === 'RP23'))];
}

/** The published values behind a story, read exactly as the evidence states them. */
function evidenceValues(story) {
  return (story.evidence || [])
    .filter((line) => line && line.key)
    .map((line) => ({ id: String(line.key), level: line.level ?? null, value: line.value ?? null }));
}

/** The products that deliver a story, from the frozen product schedule. */
function supportingProducts(story, productsSelected) {
  const layers = STORY_PRODUCT_LAYERS[story.id] || [];
  const out = [];
  for (const layer of layers) {
    const entries = productEntries(productsSelected, layer);
    const label = modelCountLabel(entries);
    if (label) out.push({ layer, models: label });
  }
  return out;
}

/** The canonical frozen display identity, in client-safe words. */
function displayContext(reportEvidence) {
  const screen = reportEvidence?.screen || {};
  const displayType = screen.display_type || null;
  const label = typeof screen.display_label === 'string' && screen.display_label.trim()
    ? screen.display_label.trim()
    : (displayType === 'tv' && screen.diagonal_inches ? `${screen.diagonal_inches}" TV` : null);
  return {
    display_type: displayType || 'projector_screen',
    label: label || (displayType === 'tv' ? 'TV' : 'projection screen'),
  };
}

/**
 * One version's ranked strength stories and the deterministic record of the
 * strengths the selection deliberately did not state, each with its reason.
 *
 * @param {Object} reportEvidence — a canonical Project Report `reportEvidence`
 * @returns {{ strength_stories: Array<Object>, omitted_stories: Array<Object> }}
 */
export function buildProposalStrengthStories(reportEvidence) {
  if (!reportEvidence || typeof reportEvidence !== 'object') {
    return { strength_stories: [], omitted_stories: [] };
  }
  const selection = selectStrengthStoriesFromReportEvidence(reportEvidence, {
    maxStories: PROPOSAL_MAX_STORIES,
  });
  const display = displayContext(reportEvidence);

  const strength_stories = selection.ranked.map((story, index) => ({
    story_id: story.id,
    rank: index + 1,
    title: story.title,
    category: story.category || null,
    level: story.level ?? null,
    scope: story.scope || 'room',
    // The sentence the story states, already assembled by the shared authority.
    statement: story.explanation || null,
    evidence_parameter_ids: evidenceParameterIds(story),
    evidence_values: evidenceValues(story),
    // Filled by the pack once the matching allowed claims are minted.
    allowed_claim_ids: [],
    supporting_products: supportingProducts(story, selection.sources.productsSelected),
    display_context: display,
  }));

  const omitted_stories = (selection.rejected || []).map((entry) => ({
    story_id: entry.id,
    reason: entry.reason,
  }));

  return { strength_stories, omitted_stories };
}

export default buildProposalStrengthStories;