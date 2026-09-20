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
import { buildSnapshotViewing } from './snapshotViewing';

export const ENGINEERING_AUTHORITY_VERSION = '1.0';

/**
 * Build a complete Engineering Authority object.
 *
 * @param {Object} params
 * @param {Object} params.project               — Project entity (merged with version design_state)
 * @param {Object} [params.version]             — ProjectVersion entity
 * @param {Object} params.engineeringSummary    — Published canonical summary
 * @param {Object} [params.designRating]         — Compatibility envelope carrying engineeringSummary
 * @param {Array}  [params.placedSpeakers]      — Array of placed speaker objects
 * @param {Array}  [params.seats]               — Array of seating positions
 * @param {Object} [params.primarySeatingPosition] — MLP coordinates
 * @param {Array}  [params.proposalAssets]      — ProposalAsset entities
 * @param {Object} [params.brandAsset]          — BrandAsset entity
 * @param {Object} [params.proposalMetadata]   — { narrative_goal, audience, word_count, language, tone }
 * @param {Object} [params.assumedLevels]       — { p15, p21 } assumed RP22 levels
 * @param {Object} [params.assessmentModes]     — { p12Mode, p13Mode } RP22 assessment basis
 * @returns {Object} Complete Engineering Authority object
 */
export function buildEngineeringAuthority(params = {}) {
  const {
    project,
    version,
    engineeringSummary: explicitEngineeringSummary,
    designRating,
    placedSpeakers,
    seats,
    primarySeatingPosition,
    proposalAssets,
    brandAsset,
    proposalMetadata,
    assumedLevels,
    assessmentModes,
  } = params;

  const engineeringSummary = explicitEngineeringSummary || designRating?.engineeringSummary || null;
  if (!engineeringSummary) {
    throw new Error('Published canonical engineering summary is required.');
  }

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
    rp22: buildRp22Authority(engineeringSummary, null, null, null, assessmentModes || {}),
    bass: buildBassAuthority(engineeringSummary),
    viewing: buildSnapshotViewing(engineeringSummary),
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

export { CONFIDENCE, SOURCE } from './confidence';

// Stage 2A: Frozen Engineering Snapshot
export { buildEngineeringSnapshot, ENGINEERING_SNAPSHOT_VERSION } from './buildEngineeringSnapshot';
export { useEngineeringSnapshot } from './useEngineeringSnapshot';
export { useVersionedEngineeringSnapshot } from './useVersionedEngineeringSnapshot';
export { buildSnapshotCategoryFloors } from './snapshotCategoryFloors';
export { buildSnapshotDpi } from './snapshotDpi';
export { buildSnapshotP19 } from './snapshotP19';
export { buildSnapshotP20 } from './snapshotP20';
export { buildSnapshotViewing } from './snapshotViewing';
export { buildSnapshotPricing } from './snapshotPricing';
export { buildSnapshotSeats } from './snapshotSeats';
export { buildSnapshotIdentity } from './snapshotIdentity';