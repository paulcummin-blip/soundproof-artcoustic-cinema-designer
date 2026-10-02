/**
 * pipelineComposition.js
 * ----------------------
 * How the Artcoustic forecast splits across the dealer groups management plans
 * around: Premium Partners, Richer Sounds and the rest of the Trade.
 *
 * The group comes from the account's own dealer_group and is never guessed: an
 * account with no group, or a group outside the three named here, is counted as
 * Trade. A project carries no group of its own, so it is counted by the account
 * that owns it.
 *
 * Rules unchanged from the rest of the reporting layer:
 *   · forecast projects only
 *   · counted versions only — value and units come from the counted version
 *   · one project counted once
 *   · Artcoustic catalogue products only: retail ex VAT, trade derived from it
 *   · a group with no valued project reports no value rather than zero
 *
 * Pure: no React, no side effects, no entity access.
 */

import { safeArray, text } from './reportingUtils';
import { tradeValueOf } from './artcousticForecast';
import { catalogueRetailFor, catalogueUnitsFor } from './pipelineAge';

/** The three groups, in reading order. Trade is the catch-all. */
export const COMPOSITION_GROUPS = [
  { key: 'premium_partners', label: 'Premium Partners', dealerGroups: ['PREMIUM_PARTNER'] },
  { key: 'richer_sounds', label: 'Richer Sounds', dealerGroups: ['RICHER_SOUNDS'] },
  { key: 'trade', label: 'Trade', dealerGroups: [] },
];

/** The group a project is counted in, from its account's dealer_group. */
export function compositionGroupKeyOf(family) {
  const group = text(family?.accountGroup).toUpperCase();
  const match = COMPOSITION_GROUPS.find((entry) => entry.dealerGroups.includes(group));
  return match ? match.key : 'trade';
}

const shareOf = (part, whole) => (whole > 0 ? part / whole : null);

/**
 * The forecast split across the dealer groups.
 *
 * @param {Array} families — forecast project families
 * @param {Object} [options]
 * @param {Object} [options.unitsByProjectId] — counted catalogue units per project
 * @param {Object} [options.retailByProjectId] — Artcoustic retail ex VAT per project
 * @returns {Object} rows (one per group), totals and any currency note
 */
export function buildCompositionSummary(families = [], {
  unitsByProjectId = null,
  retailByProjectId = null,
} = {}) {
  const included = safeArray(families);

  const rawRows = COMPOSITION_GROUPS.map((group) => {
    const inGroup = included.filter((family) => compositionGroupKeyOf(family) === group.key);
    const retailValues = inGroup
      .map((family) => catalogueRetailFor(retailByProjectId, family.id))
      .filter((value) => value !== null);
    const retail = retailValues.length > 0
      ? retailValues.reduce((sum, value) => sum + value, 0)
      : null;

    return {
      key: group.key,
      label: group.label,
      count: inGroup.length,
      projectIds: inGroup.map((family) => family.id),
      valuedCount: retailValues.length,
      noValueCount: inGroup.length - retailValues.length,
      retail,
      trade: retail === null ? null : tradeValueOf(retail),
      units: inGroup.reduce((sum, family) => sum + catalogueUnitsFor(unitsByProjectId, family.id), 0),
    };
  });

  const allRetail = included
    .map((family) => catalogueRetailFor(retailByProjectId, family.id))
    .filter((value) => value !== null);
  const totalRetail = allRetail.length > 0 ? allRetail.reduce((sum, value) => sum + value, 0) : null;
  const currencies = new Set(included.map((family) => family?.countedCurrency).filter(Boolean));

  const rows = rawRows.map((row) => ({
    ...row,
    shareOfCount: shareOf(row.count, included.length),
    shareOfRetail: shareOf(row.retail ?? 0, totalRetail ?? 0),
  }));

  return {
    rows,
    totals: {
      count: included.length,
      retail: totalRetail,
      trade: totalRetail === null ? null : tradeValueOf(totalRetail),
      units: included.reduce((sum, family) => sum + catalogueUnitsFor(unitsByProjectId, family.id), 0),
      valuedCount: allRetail.length,
      noValueCount: included.length - allRetail.length,
      currency: currencies.size === 1 ? [...currencies][0] : null,
      mixedCurrency: currencies.size > 1,
    },
  };
}