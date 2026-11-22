/**
 * accountManagementConfig.js
 * ----------------------------
 * Centralised, configurable thresholds for the Account Management view.
 *
 * These thresholds determine WHEN a recorded signal becomes an actionable
 * follow-up opportunity. They are deliberately conservative so the dashboard
 * does not present every inactive account as an immediate follow-up.
 *
 * Adjust these values to tune sensitivity. All times are in DAYS.
 * Pure: no React, no side effects.
 */

export const ACCOUNT_MANAGEMENT_THRESHOLDS = {
  /** Days after a dealer is approved (soundproof_eligible set) before flagging
   *  "approved but not activated" as an onboarding follow-up. */
  approvedNotActivatedDays: 14,

  /** Days after a dealer activates Sound Proof before flagging "activated but
   *  no projects" as an onboarding follow-up. */
  activatedNoProjectsDays: 30,

  /** Minimum days of inactivity before flagging "previously engaged but no
   *  recorded new activity" as a relationship review. Only applies when
   *  reliable dated project evidence exists. */
  noActivityMinDays: 60,

  /** Maximum days of inactivity — beyond this, the signal is no longer
   *  surfaced as a live opportunity (the relationship is presumed cold). */
  noActivityMaxDays: 90,

  /** Minimum number of dated projects in the recent period to qualify as
   *  "developing project activity" (emerging opportunity). */
  emergingMinRecentProjects: 2,

  /** Recent period for emerging activity detection, in months. */
  emergingRecentMonths: 3,

  /** Comparison period for emerging activity detection, in months. */
  emergingComparisonMonths: 6,

  /** Page size for the dealer table (client-side pagination). */
  dealerTablePageSize: 50,
};

/** Days in milliseconds for date arithmetic. */
export const DAY_MS = 86400000;

/**
 * Transparent action categories shown in the dealer table.
 * These are NOT numeric scores — they are human-readable labels that
 * describe why a dealer appears in the management view.
 */
export const ACTION_CATEGORIES = {
  FOLLOW_UP_DUE: 'Follow-up due',
  DEVELOPING_OPPORTUNITY: 'Developing opportunity',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
  NO_OPPORTUNITY: 'No opportunity detected',
};

/** Display order for categories (lowest number = highest priority). */
export const CATEGORY_PRIORITY = {
  FOLLOW_UP_DUE: 1,
  DEVELOPING_OPPORTUNITY: 2,
  INSUFFICIENT_EVIDENCE: 3,
  NO_OPPORTUNITY: 4,
};