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
 * Opportunity categories shown in the dealer table. These are NOT numeric
 * scores — they are human-readable labels. Follow-ups Due is separate and
 * date-driven (never assigned here).
 */
export const OPPORTUNITY_CATEGORIES = {
  OVERLOOKED: 'Overlooked',
  NEEDS_ATTENTION: 'Need Attention',
  EMERGING: 'Emerging',
  NO_CURRENT_OPPORTUNITY: 'No current opportunity',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
  NO_OPPORTUNITY: 'No opportunity detected',
};

/** Manual category values stored in DealerCategoryOverride. */
export const MANUAL_CATEGORY_VALUES = {
  OVERLOOKED: 'overlooked',
  NEEDS_ATTENTION: 'needs_attention',
  EMERGING: 'emerging',
  NO_CURRENT_OPPORTUNITY: 'no_current_opportunity',
};

/** Display labels for manual category values. */
export const MANUAL_CATEGORY_LABELS = {
  overlooked: 'Overlooked',
  needs_attention: 'Need Attention',
  emerging: 'Emerging',
  no_current_opportunity: 'No current opportunity',
};

/** Map manual category value to opportunity category label. */
export const MANUAL_TO_CATEGORY = {
  overlooked: 'Overlooked',
  needs_attention: 'Need Attention',
  emerging: 'Emerging',
  no_current_opportunity: 'No current opportunity',
};

/** Summary box filter keys. */
export const FILTER_KEYS = {
  ALL: 'all',
  OVERLOOKED: 'overlooked',
  NEEDS_ATTENTION: 'needs_attention',
  EMERGING: 'emerging',
  FOLLOW_UPS_DUE: 'follow_ups_due',
};

/** Display order for opportunity categories (lowest = highest priority). */
export const OPPORTUNITY_CATEGORY_PRIORITY = {
  OVERLOOKED: 1,
  NEEDS_ATTENTION: 2,
  EMERGING: 3,
  NO_CURRENT_OPPORTUNITY: 4,
  INSUFFICIENT_EVIDENCE: 5,
  NO_OPPORTUNITY: 6,
};