/**
 * sectorClassification.js
 * ----------------------
 * Country-first sector classification for the Commercial Intelligence dashboard.
 *
 * Sector precedence is COUNTRY FIRST: a non-UK account belongs only to
 * International, regardless of its dealer_group. Within UK, accounts are
 * classified by dealer_group into Premium Partners, Trade Accounts, and
 * Richer Sounds. Accounts with missing or unrecognized territory are
 * Unclassified — never silently folded into UK.
 *
 * Pure: no React, no side effects, no entity access.
 */

import { text } from '../projectReporting/reportingUtils';

export const SECTORS = [
  { key: 'premium_partners', label: 'Premium Partners', description: 'UK Premium Partner dealers' },
  { key: 'trade_accounts', label: 'Trade Accounts', description: 'UK trade dealers' },
  { key: 'richer_sounds', label: 'Richer Sounds', description: 'Richer Sounds stores' },
  { key: 'international', label: 'International', description: 'All non-UK accounts — distributors and dealers' },
];

export const UNCLASSIFIED_SECTOR = {
  key: 'unclassified',
  label: 'Unclassified',
  description: 'Accounts with missing or unrecognized territory',
};

/** Normalize a territory string to a canonical country code for classification. */
export function normalizeTerritory(territory) {
  const raw = text(territory).toUpperCase().trim();
  if (!raw) return null;
  // Exact UK
  if (raw === 'UK' || raw === 'GB' || raw === 'UNITED KINGDOM') return 'UK';
  // Anything else is non-UK. Multi-territory strings like "UK/IE" are not
  // purely UK, so they surface as unclassified rather than being silently
  // counted as UK or split across sectors.
  if (raw.includes('/') || raw.includes(',')) return 'MIXED';
  return raw;
};

/** Is this territory verifiably UK? */
export function isUkTerritory(territory) {
  return normalizeTerritory(territory) === 'UK';
};

/**
 * Classify one account into a sector key.
 *
 * Country-first: non-UK → 'international'. UK → dealer_group. Missing or
 * mixed territory → 'unclassified'.
 */
export function sectorKeyForAccount(account) {
  const territory = normalizeTerritory(account?.territory);
  if (territory === null || territory === 'MIXED') return 'unclassified';
  if (territory !== 'UK') return 'international';

  const dealerGroup = account?.dealer_group;
  if (dealerGroup === 'PREMIUM_PARTNER') return 'premium_partners';
  if (dealerGroup === 'RICHER_SOUNDS') return 'richer_sounds';
  if (dealerGroup === 'OTHER_DEALER') return 'trade_accounts';
  // UK account with no dealer_group or an unrecognized one: unclassified
  // within UK, not International. We surface it so the admin can fix it.
  return 'unclassified';
};

/**
 * Group accounts by sector. Returns a map of sectorKey → Account[].
 * Includes 'unclassified' for accounts that cannot be placed.
 */
export function groupAccountsBySector(accounts) {
  const buckets = {
    premium_partners: [],
    trade_accounts: [],
    richer_sounds: [],
    international: [],
    unclassified: [],
  };
  for (const account of Array.isArray(accounts) ? accounts : []) {
    const key = sectorKeyForAccount(account);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(account);
  }
  return buckets;
};

/** All sector keys in display order, including unclassified. */
export const ALL_SECTOR_KEYS = [
  'premium_partners',
  'trade_accounts',
  'richer_sounds',
  'international',
  'unclassified',
];

/** The display definition for a sector key. */
export function sectorDefinitionByKey(key) {
  if (key === 'unclassified') return UNCLASSIFIED_SECTOR;
  return SECTORS.find((sector) => sector.key === key) || UNCLASSIFIED_SECTOR;
};

/**
 * Whether a project is eligible for UK commercial outcome tracking.
 * The project's account must be verifiably UK. Projects without an account
 * (admin-created internal projects) are not UK-tracked.
 */
export function isUkOutcomeEligible(project, accountsById) {
  if (!project?.account_id) return false;
  const account = accountsById?.get(project.account_id);
  if (!account) return false;
  return isUkTerritory(account.territory);
};