/**
 * Proposal type definitions.
 *
 * Each type determines:
 *  - which Proposal Intelligence pipeline is executed later
 *  - how many versions the dealer must select (min/max)
 *  - the wizard step label shown to the dealer
 *
 * To add a new proposal type in the future (e.g. Product Proposal,
 * Upgrade Proposal, Commercial Summary, Technical Summary), append a new
 * entry here. The wizard renders types dynamically from this list, so no
 * wizard code changes are required — only a new pipeline implementation
 * would be needed when the type is ready to generate.
 */

export const PROPOSAL_TYPES = [
  {
    value: 'system_summary',
    label: 'System Design Summary',
    description: 'A client-facing sales summary for one design version, focused on Spatial Resolution, Dynamic Range and Timbre Matching.',
    minVersions: 1,
    maxVersions: 1,
  },
  {
    value: 'comparison',
    label: 'System Design Comparison',
    description: 'A client-facing comparison of two or more design versions, using the same report style and the same engineering evidence.',
    minVersions: 2,
    maxVersions: null,
  },
];

export function getProposalType(value) {
  return PROPOSAL_TYPES.find((t) => t.value === value) || null;
}

/**
 * Display label for a saved proposal's report type. A type that is no longer
 * offered in the wizard still has to read correctly on existing proposals.
 */
const LEGACY_TYPE_LABELS = {
  single: 'Design Proposal',
};

export function getProposalTypeLabel(value) {
  return getProposalType(value)?.label || LEGACY_TYPE_LABELS[value] || 'Design Report';
}

/**
 * Whether a report type can be built for a project holding `versionCount`
 * genuine design versions.
 *
 * The count decides only whether enough DISTINCT versions EXIST to build the
 * report — never how many the designer must then select, which is minVersions.
 * A single-version report is always available; a comparison needs at least two
 * genuine versions to exist before it is offered. An unknown count (still being
 * read) never offers the comparison, so it cannot appear and then be withdrawn.
 */
export function isProposalTypeAvailable(type, versionCount) {
  if (!type) return false;
  const min = Number.isFinite(type.minVersions) ? type.minVersions : 1;
  if (min <= 1) return true;
  if (!Number.isFinite(versionCount)) return false;
  return versionCount >= min;
}

/** The report types a project with this many genuine versions may build. */
export function availableProposalTypes(versionCount) {
  return PROPOSAL_TYPES.filter((type) => isProposalTypeAvailable(type, versionCount));
}