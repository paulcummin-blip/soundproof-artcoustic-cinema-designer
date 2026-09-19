/**
 * Canonical section definitions for the Proposal Editor.
 * Fixed 10 sections — every proposal, every time.
 * Dealers can hide and reorder but cannot add custom sections.
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
  return PROPOSAL_SECTIONS.find((s) => s.type === type) || null;
}

export function getDefaultSections() {
  return PROPOSAL_SECTIONS.map((s, i) => ({
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