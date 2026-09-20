/**
 * buildEngineeringSnapshot.js
 * --------------------------------
 * The frozen Engineering Snapshot builder.
 *
 * Assembles one version-safe, canonical engineering snapshot from the SAME
 * settled authorities already used by Room Designer / Compliance / Design Rating:
 *   - summariseEngineeringResults    → engineeringSummary
 *   - usePriceCalculation             → priceCalculation
 *   - versioned project metadata      → room/system/products
 *
 * The backend must NOT independently reconstruct engineering results from raw
 * Project fields. This snapshot IS the engineering truth.
 *
 * Pure function. No React. No side effects. No re-calculation. No re-grading.
 */

import { buildProjectAuthority } from './buildProjectAuthority';
import { buildRoomAuthority } from './buildRoomAuthority';
import { buildSystemAuthority } from './buildSystemAuthority';
import { buildProductAuthority } from './buildProductAuthority';
import { buildDealerAuthority } from './buildDealerAuthority';
import { buildImageAuthority } from './buildImageAuthority';
import { buildProposalMetadata } from './buildProposalMetadata';
import { buildRp22Authority } from './buildRp22Authority';
import { buildBassAuthority } from './buildBassAuthority';

import { buildSnapshotIdentity } from './snapshotIdentity';
import { buildSnapshotCategoryFloors } from './snapshotCategoryFloors';
import { buildSnapshotDpi } from './snapshotDpi';
import { buildSnapshotP19 } from './snapshotP19';
import { buildSnapshotP20 } from './snapshotP20';
import { buildSnapshotViewing } from './snapshotViewing';
import { buildSnapshotPricing } from './snapshotPricing';
import { buildSnapshotSeats } from './snapshotSeats';

export const ENGINEERING_SNAPSHOT_VERSION = '1.0';

/**
 * Build a complete frozen Engineering Snapshot.
 *
 * @param {Object} params
 * @param {string} params.projectId — REQUIRED, no fallback
 * @param {string} params.versionId — REQUIRED, no fallback
 * @param {Object} params.project — Project entity (shared metadata)
 * @param {Object} params.version — ProjectVersion entity (design_state authority)
 * @param {Object} params.mergedProject — mergeProjectAndVersion(project, version) result
 * @param {Object} params.engineeringSummary — the published canonical engineering summary
 * @param {Object} params.designRating — compatibility envelope carrying engineeringSummary
 * @param {Array}  params.seats — canonical seating positions
 * @param {Array}  params.placedSpeakers — placed speaker objects
 * @param {Object} params.priceCalculation — from usePriceCalculation
 * @param {Array}  [params.proposalAssets] — ProposalAsset entities
 * @param {Object} [params.brandAsset] — BrandAsset entity
 * @param {Object} [params.proposalMetadata] — { narrative_goal, audience, ... }
 * @param {Object} [params.assumedLevels] — { p15, p21 }
 * @param {Object} [params.assessmentModes] — { p12Mode, p13Mode }
 * @returns {Object} Frozen Engineering Snapshot
 */
export function buildEngineeringSnapshot(params = {}) {
  const {
    projectId,
    versionId,
    project,
    version,
    mergedProject,
    completedBassAuthority,
    designRating,
    engineeringSummary: explicitEngineeringSummary,
    seats,
    placedSpeakers,
    priceCalculation,
    proposalAssets,
    brandAsset,
    proposalMetadata,
    assumedLevels,
    assessmentModes,
  } = params;

  // ── 1. Version ID is required — no fallback ──
  if (!projectId || !versionId) {
    return {
      schema_version: ENGINEERING_SNAPSHOT_VERSION,
      available: false,
      error: 'projectId and versionId are required for an Engineering Snapshot.',
      identity: { projectId: projectId || null, versionId: versionId || null, generatedAt: new Date().toISOString() },
    };
  }

  const engineeringSummary = explicitEngineeringSummary || designRating?.engineeringSummary || null;
  if (!engineeringSummary) {
    return {
      schema_version: ENGINEERING_SNAPSHOT_VERSION,
      available: false,
      error: 'Published canonical engineering summary is required.',
      identity: { projectId, versionId, generatedAt: new Date().toISOString() },
    };
  }

  // ── 2. Version-merged design state is metadata only ──
  const designProject = mergedProject || project;

  // ── 3. Identity ──
  const identity = buildSnapshotIdentity({
    projectId,
    versionId,
    completedBassAuthority,
    designRating,
  });

  // ── 4. Project / Version / Dealer ──
  const projectAuthority = buildProjectAuthority(project, version);
  const dealerAuthority = buildDealerAuthority(brandAsset);
  projectAuthority.dealer_company = dealerAuthority.company_name;

  // ── 5. Room / System / Products (from version-merged design state) ──
  const room = buildRoomAuthority(designProject, version);
  const system = buildSystemAuthority(designProject, version, placedSpeakers);
  const products = buildProductAuthority(designProject, version, placedSpeakers);

  // ── 6. Seats (canonical priority, no RSP→Primary inference) ──
  const seatsSnapshot = buildSnapshotSeats(seats);

  // ── 7. RP22 (parameter headlines + assumed; category floors from published authority) ──
  const rp22Authority = buildRp22Authority(
    engineeringSummary,
    null,
    null,
    null,
    assessmentModes || {},
  );

  const categoryFloors = buildSnapshotCategoryFloors(engineeringSummary);
  const dpi = buildSnapshotDpi(engineeringSummary);

  // ── 8. Bass — passive reads from the canonical engineering summary ──
  const bassAuthority = buildBassAuthority(engineeringSummary);
  const p19Snapshot = buildSnapshotP19(engineeringSummary);
  const p20Snapshot = buildSnapshotP20(engineeringSummary);

  // ── 9. Viewing / RP23 — passive read from the same publication ──
  const viewing = buildSnapshotViewing(engineeringSummary);

  // ── 10. Pricing (separate from engineering) ──
  const pricing = buildSnapshotPricing(priceCalculation);

  // ── 11. Images ──
  const images = buildImageAuthority(proposalAssets);

  // ── 12. Metadata ──
  const metadata = buildProposalMetadata(proposalMetadata || {
    narrative_goal: project?.narrative_goal,
  });

  // ── 13. Constraints (key design compromises from product authority) ──
  const constraints = [];

  return Object.freeze({
    schema_version: ENGINEERING_SNAPSHOT_VERSION,
    available: true,
    identity,
    project: projectAuthority,
    version: {
      id: version?.id || versionId,
      name: version?.version_name || 'Current Design',
      number: version?.version_number || 1,
    },
    room,
    seats: seatsSnapshot,
    system,
    rp22: {
      overall: rp22Authority.overall_design_rating,
      categories: categoryFloors,
      dpi,
      parameter_headlines: rp22Authority.all_parameters,
      strengths: rp22Authority.strengths,
      weaknesses: rp22Authority.weaknesses,
      assessment_basis: rp22Authority.assessment_basis,
      assumed: rp22Authority.assumed_parameters,
    },
    bass: {
      available: bassAuthority.available,
      p14: bassAuthority.p14,
      p18: bassAuthority.p18,
      p19: p19Snapshot,
      p20: p20Snapshot,
      subwoofer_strategy_summary: bassAuthority.subwoofer_strategy_summary,
    },
    viewing,
    products: products.products,
    product_coherence: products.system_coherence,
    pricing,
    images,
    dealer: dealerAuthority,
    metadata,
    constraints,
  });
}