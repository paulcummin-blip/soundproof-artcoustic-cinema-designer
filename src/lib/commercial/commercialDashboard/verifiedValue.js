/**
 * verifiedValue.js
 * ----------------
 * Verified frozen retail value authority for the Commercial Intelligence
 * dashboard.
 *
 * The dashboard accepts monetary pipeline value ONLY from a verified frozen
 * historical proposal/project price snapshot that explicitly represents retail
 * product value INCLUDING VAT. Current Product Master prices are NOT used to
 * backfill historical proposal values. Missing or insufficient snapshots are
 * labeled unavailable — never coerced to zero.
 *
 * Pure: no React, no side effects, no entity access.
 */

import { safeArray, safeObject, text, timeOf } from '../projectReporting/reportingUtils';

/**
 * The standard UK VAT rate. Applied only when a snapshot carries an ex-VAT
 * total and sufficient verified basis (territory UK + price_mode marked exVat)
 * to justify the conversion.
 */
export const UK_VAT_RATE = 0.2;

/**
 * Resolve the verified frozen retail value including VAT for one project,
 * from its surviving proposal snapshots.
 *
 * A snapshot qualifies when:
 *   · it has engineering_snapshot.pricing with a numeric system_total
 *   · price_mode is 'incVat' → the total IS retail inc VAT (verified)
 *   · price_mode is 'exVat' and territory is UK → apply 20% VAT (verified)
 *   · anything else → unavailable
 *
 * @param {Array} proposals — Proposal records for one project
 * @param {Object} [options]
 * @param {string} [options.territory] — the project's account territory
 * @returns {Object} { value, available, basis, currency, proposalId, at, reason }
 */
export function resolveVerifiedRetailIncVat(proposals, { territory = null } = {}) {
  const withPricing = safeArray(proposals)
    .filter((proposal) => safeObject(proposal?.engineering_snapshot)?.pricing)
    .sort(
      (a, b) =>
        (timeOf(b?.proposal_date || b?.created_date) || 0) -
        (timeOf(a?.proposal_date || a?.created_date) || 0),
    );

  if (withPricing.length === 0) {
    return {
      value: null,
      available: false,
      basis: null,
      currency: null,
      proposalId: null,
      at: null,
      reason: 'No frozen price snapshot for this project.',
    };
  }

  const latest = withPricing[0];
  const pricing = safeObject(latest.engineering_snapshot)?.pricing || {};
  const rawTotal = pricing.system_total;
  const total =
    rawTotal === null || rawTotal === undefined || Number.isNaN(Number(rawTotal))
      ? null
      : Number(rawTotal);

  if (total === null) {
    return {
      value: null,
      available: false,
      basis: null,
      currency: pricing.currency || null,
      proposalId: latest.id || null,
      at: latest.proposal_date || latest.created_date || null,
      reason: 'The latest proposal snapshot carries no quoted total.',
    };
  }

  const priceMode = text(pricing.price_mode).toLowerCase();
  const normalizedTerritory = text(territory).toUpperCase().trim();
  const isUk = normalizedTerritory === 'UK' || normalizedTerritory === 'GB';

  // Inc VAT already — the snapshot is the verified retail value including VAT.
  if (priceMode === 'incvat' || priceMode === 'inc_vat' || pricing.vat_included === true) {
    return {
      value: total,
      available: true,
      basis: 'inc_vat',
      currency: pricing.currency || 'GBP',
      proposalId: latest.id || null,
      at: latest.proposal_date || latest.created_date || null,
      reason: null,
    };
  }

  // Ex VAT with UK territory — apply standard VAT to produce retail inc VAT.
  if ((priceMode === 'exvat' || priceMode === 'ex_vat') && isUk) {
    return {
      value: total * (1 + UK_VAT_RATE),
      available: true,
      basis: 'ex_vat_plus_uk_vat',
      currency: pricing.currency || 'GBP',
      proposalId: latest.id || null,
      at: latest.proposal_date || latest.created_date || null,
      reason: null,
    };
  }

  // Ex VAT without UK territory, or unknown price mode — cannot verify inc VAT.
  return {
    value: null,
    available: false,
    basis: priceMode ? `ex_vat_${normalizedTerritory || 'unknown'}` : 'unknown_mode',
    currency: pricing.currency || null,
    proposalId: latest.id || null,
    at: latest.proposal_date || latest.created_date || null,
    reason: 'Snapshot does not carry a verified retail value including VAT.',
  };
};

/**
 * Build a map of projectId → verified retail value, for a set of projects.
 *
 * @param {Array} projects — Project records
 * @param {Object} proposalsByProjectId — { [projectId]: Proposal[] }
 * @param {Map} accountsById — Account lookup for territory
 * @returns {Map} projectId → { value, available, basis, currency, reason, ... }
 */
export function buildVerifiedValueMap(projects, proposalsByProjectId, accountsById) {
  const map = new Map();
  for (const project of safeArray(projects)) {
    const proposals = proposalsByProjectId?.[project.id] || [];
    const account = project.account_id && accountsById
      ? accountsById.get(project.account_id) || null
      : null;
    const territory = account?.territory || null;
    map.set(project.id, resolveVerifiedRetailIncVat(proposals, { territory }));
  }
  return map;
};

/** Format a GBP value for display, returning '—' for null. */
export function formatGBPValue(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(value));
  } catch {
    return '—';
  }
};