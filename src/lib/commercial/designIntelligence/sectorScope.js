/**
 * sectorScope.js
 * ---------------
 * Sector filtering for the consolidated page.
 *
 * Reuses the existing country-first sector classification. "All Dealers"
 * is every non-internal family. The four principal sectors are
 * Premium Partners, Trade Accounts, Richer Sounds. Unclassified and
 * International are surfaced as visible counts. Internal (admin) projects
 * are excluded from dealer statistics and available as a separate view.
 *
 * Pure: no React, no side effects.
 */

import { safeArray, text } from '../projectReporting/reportingUtils';
import { isInternalFamily } from './buildConsolidatedReport';

export const SECTOR_TABS = [
  { key: 'all_dealers', label: 'All Dealers', description: 'Every dealer project (excludes internal/admin)' },
  { key: 'premium_partners', label: 'Premium Partners', description: 'UK Premium Partner dealers' },
  { key: 'trade_accounts', label: 'Trade Accounts', description: 'UK trade dealers' },
  { key: 'richer_sounds', label: 'Richer Sounds', description: 'Richer Sounds stores' },
  { key: 'international', label: 'International', description: 'Non-UK distributors and dealers' },
  { key: 'unclassified', label: 'Unclassified', description: 'Accounts needing admin review' },
  { key: 'internal', label: 'Internal', description: 'Sound Proof admin and internal projects' },
];

/** Filter families by the active sector tab. */
export function filterFamiliesBySector(families, sectorTabKey) {
  const list = safeArray(families);
  switch (sectorTabKey) {
    case 'all_dealers':
      return list.filter((f) => !isInternalFamily(f));
    case 'internal':
      return list.filter((f) => isInternalFamily(f));
    case 'premium_partners':
    case 'trade_accounts':
    case 'richer_sounds':
    case 'international':
    case 'unclassified':
      return list.filter((f) => !isInternalFamily(f) && f.sectorKey === sectorTabKey);
    default:
      return list;
  }
}

/** Count families per sector for the tab badges. */
export function sectorCounts(families) {
  const list = safeArray(families);
  const counts = {
    all_dealers: 0,
    premium_partners: 0,
    trade_accounts: 0,
    richer_sounds: 0,
    international: 0,
    unclassified: 0,
    internal: 0,
  };
  for (const family of list) {
    if (isInternalFamily(family)) {
      counts.internal += 1;
    } else {
      counts.all_dealers += 1;
      if (counts[family.sectorKey] !== undefined) counts[family.sectorKey] += 1;
    }
  }
  return counts;
}

/** Group families by dealer account for the drill-down. */
export function groupByDealer(families) {
  const list = safeArray(families);
  const map = new Map();
  for (const family of list) {
    if (!family.accountId) continue;
    if (!map.has(family.accountId)) {
      map.set(family.accountId, {
        accountId: family.accountId,
        dealerName: family.dealerName || family.accountName || 'Unnamed account',
        accountType: family.accountType || null,
        territory: family.territory || null,
        sectorKey: family.sectorKey || 'unclassified',
        families: [],
      });
    }
    map.get(family.accountId).families.push(family);
  }
  return [...map.values()].sort((a, b) =>
    String(a.dealerName).localeCompare(String(b.dealerName)));
}