/**
 * Engineering Authority — Layer 1
 * --------------------------------
 * The permanent engineering interface between Sound Proof and GPT.
 *
 * This module assembles a complete Engineering Authority object for a
 * selected Project Version. It is the sole input to all future proposal
 * intelligence layers (Design Intelligence, Narrative Spine, Writing, Editorial).
 *
 * ARCHITECTURE RULES:
 *   - Never calculates using GPT.
 *   - Never generates proposal wording.
 *   - Never generates marketing language.
 *   - Never invents engineering interpretation.
 *   - Always deterministic.
 *   - Always testable.
 *   - Always reproducible.
 *
 * Every statement in a generated proposal must be traceable back to
 * this object.
 */

import { buildProjectAuthority } from './buildProjectAuthority';
import { buildRoomAuthority } from './buildRoomAuthority';
import { buildSystemAuthority } from './buildSystemAuthority';
import { buildRp22Authority } from './buildRp22Authority';
import { buildBassAuthority } from './buildBassAuthority';
import { buildProductAuthority } from './buildProductAuthority';
import { buildImageAuthority } from './buildImageAuthority';
import { buildDealerAuthority } from './buildDealerAuthority';
import { buildProposalMetadata } from './buildProposalMetadata';

export const ENGINEERING_AUTHORITY_VERSION = '1.0';

/**
 * Build a complete Engineering Authority object.
 *
 * @param {Object} params
 * @param {Object} params.project               — Project entity (merged with version design_state)
 * @param {Object} [params.version]             — ProjectVersion entity
 * @param {Object} [params.analysisResult]      — From useRP22AnalysisEngine
 * @param {Object} [params.completedBassAuthority]    — From useCompletedBassAuthority
 * @param {Object} [params.completedBassPresentation] — From buildComplianceBassPresentation
 * @param {Object} [params.designRating]        — From useAppDesignRating
 * @param {Array}  [params.placedSpeakers]      — Array of placed speaker objects
 * @param {Array}  [params.seats]               — Array of seating positions
 * @param {Object} [params.primarySeatingPosition] — MLP coordinates
 * @param {Array}  [params.proposalAssets]      — ProposalAsset entities
 * @param {Object} [params.brandAsset]          — BrandAsset entity
 * @param {Object} [params.proposalMetadata]   — { narrative_goal, audience, word_count, language, tone }
 * @param {Object} [params.assumedLevels]       — { p15, p21 } assumed RP22 levels
 * @returns {Object} Complete Engineering Authority object
 */
export function buildEngineeringAuthority(params = {}) {
  const {
    project,
    version,
    analysisResult,
    completedBassAuthority,
    completedBassPresentation,
    designRating,
    placedSpeakers,
    seats,
    primarySeatingPosition,
    proposalAssets,
    brandAsset,
    proposalMetadata,
    assumedLevels,
  } = params;

  const projectAuthority = buildProjectAuthority(project, version);
  const dealerAuthority = buildDealerAuthority(brandAsset);

  // Backfill dealer company name into project authority
  projectAuthority.dealer_company = dealerAuthority.company_name;

  return {
    schema_version: ENGINEERING_AUTHORITY_VERSION,
    generated_at: new Date().toISOString(),

    project: projectAuthority,
    room: buildRoomAuthority(project, version),
    system: buildSystemAuthority(project, version, placedSpeakers),
    rp22: buildRp22Authority(analysisResult, designRating, seats, assumedLevels || {
      p15: project?.assumed_p15_level || null,
      p21: project?.assumed_p21_level || null,
    }),
    bass: buildBassAuthority(completedBassAuthority, completedBassPresentation),
    products: buildProductAuthority(project, version, placedSpeakers),
    images: buildImageAuthority(proposalAssets),
    dealer: dealerAuthority,
    metadata: buildProposalMetadata(proposalMetadata || {
      narrative_goal: project?.narrative_goal,
    }),
  };
}

// Re-export sub-authorities for testing and independent consumption
export {
  buildProjectAuthority,
  buildRoomAuthority,
  buildSystemAuthority,
  buildRp22Authority,
  buildBassAuthority,
  buildProductAuthority,
  buildImageAuthority,
  buildDealerAuthority,
  buildProposalMetadata,
};

export { CONFIDENCE } from './confidence';