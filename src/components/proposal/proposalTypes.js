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
    value: 'single',
    label: 'Single Design Proposal',
    description: 'A proposal for a single design version of the selected project.',
    minVersions: 1,
    maxVersions: 1,
  },
  {
    value: 'comparison',
    label: 'Design Comparison',
    description: 'A side-by-side comparison of two or more design versions for the same project.',
    minVersions: 2,
    maxVersions: null,
  },
];

export function getProposalType(value) {
  return PROPOSAL_TYPES.find((t) => t.value === value) || null;
}