/**
 * Proposal lifecycle status definitions, display, and transitions.
 *
 * The lifecycle has two layers:
 *   1. Content-generation states: draft → generating → generated
 *   2. Business lifecycle states:  generated → edited → issued → accepted → archived
 *
 * Legacy statuses 'reviewed' and 'sent' are retained for backward compatibility
 * and map to 'edited' and 'issued' respectively for display purposes.
 */

// Ordered lifecycle stages (for progression UI)
export const LIFECYCLE_STAGES = [
  'draft',
  'generating',
  'generated',
  'edited',
  'issued',
  'accepted',
  'archived',
];

// Legacy status → lifecycle equivalent (for display normalisation)
const LEGACY_MAP = {
  reviewed: 'edited',
  sent: 'issued',
};

// Display config per lifecycle status
const STATUS_CONFIG = {
  draft: {
    label: 'Draft',
    badgeClass: 'bg-[#DCDBD6] text-[#3E4349] border-transparent',
    dotClass: 'bg-[#8A8477]',
  description: 'Proposal created, not yet generated.',
  },
  generating: {
    label: 'Generating',
    badgeClass: 'bg-[#FFF8E1] text-[#8B6914] border-[#E6C44E]',
    dotClass: 'bg-[#E6C44E] animate-pulse',
    description: 'AI is generating the proposal content.',
  },
  generated: {
    label: 'Generated',
    badgeClass: 'bg-[#E3F2FD] text-[#1565C0] border-[#90CAF9]',
    dotClass: 'bg-[#42A5F5]',
    description: 'Initial AI output complete and ready for review.',
  },
  edited: {
    label: 'Edited',
    badgeClass: 'bg-[#E8F5E9] text-[#2E7D32] border-[#A5D6A7]',
    dotClass: 'bg-[#66BB6A]',
    description: 'Manually reviewed or modified by the designer.',
  },
  issued: {
    label: 'Issued',
    badgeClass: 'bg-[#E0F7F4] text-[#00695C] border-[#80CBC4]',
    dotClass: 'bg-[#26A69A]',
    description: 'Client-facing proposal sent or published.',
  },
  accepted: {
    label: 'Accepted',
    badgeClass: 'bg-[#213428] text-[#C1B6AD] border-transparent',
    dotClass: 'bg-[#213428]',
    description: 'Client accepted the proposal.',
  },
  archived: {
    label: 'Archived',
    badgeClass: 'bg-[#F5F4F0] text-[#8A8477] border-[#DCDBD6]',
    dotClass: 'bg-[#A79E8C]',
    description: 'Completed or closed.',
  },
};

/**
 * Normalise a raw status to its lifecycle equivalent.
 * Legacy statuses map to their modern equivalent.
 */
export function normaliseStatus(rawStatus) {
  if (!rawStatus) return 'draft';
  if (LEGACY_MAP[rawStatus]) return LEGACY_MAP[rawStatus];
  if (STATUS_CONFIG[rawStatus]) return rawStatus;
  return 'draft';
}

/**
 * Get display config for a raw status (normalises first).
 */
export function getStatusConfig(rawStatus) {
  const status = normaliseStatus(rawStatus);
  return STATUS_CONFIG[status] || STATUS_CONFIG.draft;
}

/**
 * Get the display label for a raw status.
 */
export function getStatusLabel(rawStatus) {
  return getStatusConfig(rawStatus).label;
}

/**
 * Valid next stages from a given status.
 * Used for lifecycle progression dropdowns.
 */
export function getNextStages(rawStatus) {
  const status = normaliseStatus(rawStatus);
  const idx = LIFECYCLE_STAGES.indexOf(status);
  if (idx === -1 || idx === LIFECYCLE_STAGES.length - 1) return [];
  return LIFECYCLE_STAGES.slice(idx + 1);
}

/**
 * Check if a transition from one status to another is valid.
 */
export function canTransitionTo(fromStatus, toStatus) {
  return getNextStages(fromStatus).includes(toStatus);
}

/**
 * Check if the proposal is in a "generating" state (content still being written).
 */
export function isGenerating(rawStatus) {
  return normaliseStatus(rawStatus) === 'generating';
}

/**
 * Check if the proposal is archived (read-only).
 */
export function isArchived(rawStatus) {
  return normaliseStatus(rawStatus) === 'archived';
}