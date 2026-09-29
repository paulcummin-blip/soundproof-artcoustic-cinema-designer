/**
 * Section definitions for the Proposal Editor.
 * Dealers can hide and reorder but cannot add custom sections.
 *
 * PROPOSAL_SECTIONS below is the legacy ten-section set. It is no longer
 * offered for new reports, and is kept only so proposals saved before the two
 * report types were merged still open correctly.
 */

export const PROPOSAL_SECTIONS = [
  { type: 'cover', key: 'cover', label: 'Cover', defaultTitle: 'Cover', canHide: false, canEditBody: false },
  { type: 'executive_summary', key: 'executive_summary', label: 'Executive Summary', defaultTitle: 'Executive Summary', canHide: true, canEditBody: true },
  { type: 'design_philosophy', key: 'design_philosophy', label: 'Design Philosophy', defaultTitle: 'Design Philosophy', canHide: true, canEditBody: true },
  { type: 'system_overview', key: 'system_overview', label: 'System Overview', defaultTitle: 'System Overview', canHide: true, canEditBody: true },
  { type: 'room_images', key: 'room_images', label: 'Room Images', defaultTitle: 'Room Images', canHide: true, canEditBody: true },
  { type: 'performance', key: 'performance', label: 'Performance', defaultTitle: 'Performance', canHide: true, canEditBody: true },
  { type: 'products', key: 'products', label: 'Products', defaultTitle: 'Products', canHide: true, canEditBody: true },
  { type: 'comparison', key: 'comparison', label: 'Comparison', defaultTitle: 'Comparison', canHide: true, canEditBody: true },
  { type: 'conclusion', key: 'conclusion', label: 'Conclusion', defaultTitle: 'Conclusion', canHide: true, canEditBody: true },
  { type: 'appendix', key: 'appendix', label: 'Appendix', defaultTitle: 'Appendix', canHide: true, canEditBody: true },
];

/**
 * Canonical section definitions for both current report types — the System
 * Design Summary and the System Design Comparison.
 * These are client-facing reports built around the three core RP22 design
 * structures. They are not general proposal documents, so they do not use the
 * legacy proposal section set above.
 */
export const SYSTEM_SUMMARY_SECTIONS = [
  { type: 'cover', key: 'cover', label: 'Cover', defaultTitle: 'Cover', canHide: false, canEditBody: false },
  { type: 'system_design_summary', key: 'system_design_summary', label: 'System Design Summary', defaultTitle: 'System Design Summary', canHide: true, canEditBody: true },
  { type: 'spatial_resolution', key: 'spatial_resolution', label: 'Spatial Resolution', defaultTitle: 'Spatial Resolution', canHide: true, canEditBody: true },
  { type: 'dynamic_range', key: 'dynamic_range', label: 'Dynamic Range', defaultTitle: 'Dynamic Range', canHide: true, canEditBody: true },
  { type: 'timbre_matching', key: 'timbre_matching', label: 'Timbre Matching', defaultTitle: 'Timbre Matching', canHide: true, canEditBody: true },
  { type: 'key_performance_highlights', key: 'key_performance_highlights', label: 'Key Performance Highlights', defaultTitle: 'Key Performance Highlights', canHide: true, canEditBody: true },
  { type: 'overall_design', key: 'overall_design', label: 'Overall Design', defaultTitle: 'Overall Design', canHide: true, canEditBody: true },
  { type: 'room_images', key: 'room_images', label: 'Project Images', defaultTitle: 'Project Images', canHide: true, canEditBody: true },
];

/** Every section definition, from both report types. */
export const ALL_SECTION_DEFS = [...PROPOSAL_SECTIONS, ...SYSTEM_SUMMARY_SECTIONS];

/**
 * The section set for a report type. Mirrors the section vocabulary the
 * backend generators use, so the editor shows exactly the sections a report
 * was generated with.
 */
export function getSectionsForProposalType(proposalType) {
  // Both current report types share the System Design structure. Only legacy
  // 'single' proposals use the old ten-section set.
  return proposalType === 'single' ? PROPOSAL_SECTIONS : SYSTEM_SUMMARY_SECTIONS;
}

export const NARRATIVE_GOALS = [
  { value: 'luxury_cinema', label: 'Luxury Cinema', description: 'Premium home cinema experience' },
  { value: 'family_media_room', label: 'Family Media Room', description: 'Accessible family entertainment' },
  { value: 'reference_performance', label: 'Reference Performance', description: 'Audiophile-grade accuracy' },
  { value: 'best_value', label: 'Best Value', description: 'Cost-conscious quality' },
  { value: 'future_proof', label: 'Future Proof', description: 'Investment in upgradeability' },
];

export const REGENERATION_ACTIONS = [
  { value: 'rewrite', label: 'Rewrite', icon: 'PenLine' },
  { value: 'refine', label: 'Refine', icon: 'RefreshCw' },
  { value: 'expand', label: 'Expand', icon: 'Plus' },
  { value: 'shorten', label: 'Shorten', icon: 'Minus' },
  { value: 'technical', label: 'Technical', icon: 'Wrench' },
  { value: 'client_friendly', label: 'Client Friendly', icon: 'Home' },
];

export function getSectionDef(type) {
  return ALL_SECTION_DEFS.find((s) => s.type === type) || null;
}

export function getDefaultSections() {
  return SYSTEM_SUMMARY_SECTIONS.map((s, i) => ({
    section_type: s.type,
    section_key: s.key,
    title: s.defaultTitle,
    body: '',
    dealer_notes: '',
    order_index: i,
    is_enabled: true,
    locked: false,
  }));
}