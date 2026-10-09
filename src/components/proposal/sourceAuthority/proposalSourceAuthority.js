/**
 * proposalSourceAuthority.js
 * --------------------------
 * THE source identity for proposal generation: which report a proposal is
 * built from, where that report is generated, and the URL a blocked version is
 * sent to.
 *
 * Sound Proof has ONE report — the Project Report. It carries the visual and
 * technical content, the P1–P21 evidence, the drawings, the products and the
 * bass evidence, and it is the only report source a proposal is gated on.
 *
 * Readiness itself is derived by the ONE authority beside this module
 * (proposalReadinessAuthority.js, mirrored by
 * base44/shared/proposalReadinessAuthority.js for the server gate) — this module
 * states the identity, the route and the URL only.
 *
 * Pure: no React, no side effects, no reads.
 */

export const PROPOSAL_SOURCE_REPORT = Object.freeze({
  /** The ONE report a proposal is built from. */
  PROJECT: 'project',
  /** Legacy report identities: retained so historical records stay readable. */
  VISUAL: 'visual',
  TECHNICAL: 'technical',
});

/** Where the report a proposal is built from is generated. */
export const PROPOSAL_SOURCE_REPORT_ROUTE = Object.freeze({
  project: '/RP22ClientReport',
  visual: '/RP22ClientReport',
  technical: '/RP22Report',
});

/** The blocking message, shown verbatim whenever a proposal cannot be generated. */
export const PROPOSAL_SOURCE_REQUIRED_MESSAGE =
  'Create the Project Report for every selected version before creating a proposal. This ensures the proposal uses the current project data and RP22 results.';

/** The one-line rule, for documentation and tests. */
export const PROPOSAL_SOURCE_RULE =
  'No current Project Report = no proposal.';

/**
 * The report page URL for a blocked version, carrying the project and version so
 * the report is generated for exactly the version the proposal needs.
 *
 * @param {Object} params
 * @param {string} params.route
 * @param {string|null} params.projectId
 * @param {string|null} params.versionId
 * @returns {string}
 */
export function buildReportActionUrl({ route, projectId, versionId }) {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  if (versionId) params.set('versionId', versionId);
  const query = params.toString();
  return query ? `${route}?${query}` : route;
}