/**
 * dealerOpportunities.js
 * -----------------------
 * Evidence-backed observations for the Dealer Opportunities section.
 *
 * Each observation is derived from a concrete, checkable field — never
 * from an inference about engagement or design adequacy. A project is
 * flagged only when a specific data gap or reviewable characteristic is
 * present.
 *
 * Pure: no React, no side effects.
 */

import { safeArray, text } from '../projectReporting/reportingUtils';

function activeVariationOf(family) {
  return safeArray(family?.variations).find((v) => v.isActive) || safeArray(family?.variations)[0] || null;
}

/**
 * Build evidence-backed opportunity flags for a set of families.
 *
 * Flags:
 *   · incomplete_pricing — active version has unpriced lines
 *   · no_live_value — live design value could not be calculated
 *   · no_quoted_snapshot — no frozen proposal pricing snapshot
 *   · no_publication — engineering not published for active version
 *   · missing_room_dims — room dimensions unconfirmed or invalid
 *   · unclassified_status — project status could not be mapped
 *
 * @param {Array} families
 * @returns {Array<{ family, flags: string[] }>}
 */
export function buildDealerOpportunities(families) {
  const list = safeArray(families);
  const results = [];

  for (const family of list) {
    const flags = [];
    const variation = activeVariationOf(family);

    if ((family.unpricedLineCount || 0) > 0) {
      flags.push({
        key: 'incomplete_pricing',
        label: 'Incomplete pricing',
        detail: `${family.unpricedLineCount} unpriced product line(s) in the active version`,
      });
    }

    if (family.liveValue === null && (family.livePriceListAvailable !== false)) {
      flags.push({
        key: 'no_live_value',
        label: 'No current design value',
        detail: 'The active version has no priced products',
      });
    }

    if (family.quotedValue === null) {
      flags.push({
        key: 'no_quoted_snapshot',
        label: 'No quoted snapshot',
        detail: 'No frozen proposal pricing snapshot for this project',
      });
    }

    if (!variation?.publicationSummary) {
      flags.push({
        key: 'no_publication',
        label: 'Engineering not published',
        detail: 'No valid current engineering publication for the active version',
      });
    }

    if (!family.roomDims) {
      flags.push({
        key: 'missing_room_dims',
        label: 'Missing room dimensions',
        detail: 'Room dimensions are unconfirmed or invalid',
      });
    }

    if (family.bucket === 'unclassified') {
      flags.push({
        key: 'unclassified_status',
        label: 'Unclassified status',
        detail: `Status "${family.rawStatusLabel}" could not be mapped to a commercial stage`,
      });
    }

    if (flags.length > 0) {
      results.push({
        family: {
          id: family.id,
          name: family.name,
          client: family.client,
          dealerName: family.dealerName || family.accountName,
          accountId: family.accountId,
        },
        flags,
      });
    }
  }

  return results;
}