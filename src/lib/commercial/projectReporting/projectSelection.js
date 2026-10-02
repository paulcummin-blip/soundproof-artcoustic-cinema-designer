/**
 * projectSelection.js
 * -------------------
 * Project inclusion and counted-version authority for Project Intelligence.
 *
 * ONE PROJECT IS ONE COMMERCIAL PROJECT. Its ProjectVersions are design options,
 * and a client cannot buy every option, so product demand counts exactly ONE
 * selected version per included project. Versions are never summed together.
 *
 * The counted version defaults to the LOWEST VALUE version, which is the
 * conservative basis for forecasting, and the admin can override it manually.
 *
 * Pure: no React, no entity access and no side effects. The admin's choices are
 * report selection only — they live in local report selection storage and are
 * never written to Project or ProjectVersion.
 */

import { safeArray, text, timeOf } from './reportingUtils';
import { artcousticValueOfLines } from './forecastDemand';

/** Names and clients that identify a non-commercial project. */
export const TEST_PROJECT_PATTERNS = [
  'test',
  'audit',
  'demo',
  'sample',
  'dummy',
  'ux audit',
  'internal',
  'playground',
];

export const COUNT_BASIS = Object.freeze({
  SINGLE: 'single',
  LOWEST: 'lowest',
  HIGHEST: 'highest',
  ACTIVE: 'active',
  LATEST: 'latest',
  MANUAL: 'manual',
});

export const COUNT_BASIS_LABEL = Object.freeze({
  single: 'Only version',
  lowest: 'Lowest value',
  highest: 'Highest value',
  active: 'Active version',
  latest: 'Latest version',
  manual: 'Manual',
});

/** The automatic bases offered above the explicit version list. */
export const AUTOMATIC_BASIS_OPTIONS = [
  { value: COUNT_BASIS.LOWEST, label: 'Lowest value version' },
  { value: COUNT_BASIS.HIGHEST, label: 'Highest value version' },
  { value: COUNT_BASIS.ACTIVE, label: 'Active version' },
  { value: COUNT_BASIS.LATEST, label: 'Latest version' },
];

/** The reason pill for a project excluded by name or client. */
export const TEST_EXCLUSION_PILL = 'Excluded: test/audit project';
export const MANUAL_INCLUSION_PILL = 'Included manually';

/** The pattern that marked this project, or null when it looks commercial. */
export function matchedTestTerm(family) {
  const haystack = `${text(family?.name)} ${text(family?.client)}`.toLowerCase();
  return TEST_PROJECT_PATTERNS.find((term) => haystack.includes(term)) || null;
}

export function isLikelyTestProject(family) {
  return matchedTestTerm(family) !== null;
}

/**
 * The selection a project starts with before any admin override: commercial
 * projects are included, likely test/demo/audit projects are excluded, and a
 * multi-version project counts its lowest value version.
 */
export function defaultSelectionFor(family) {
  const matchedTerm = matchedTestTerm(family);
  const variationCount = safeArray(family?.variations).length;
  return {
    included: matchedTerm === null,
    matchedTerm,
    count_basis: variationCount > 1 ? COUNT_BASIS.LOWEST : COUNT_BASIS.SINGLE,
    counted_version_id: null,
  };
}

/** Age since the given timestamp, in plain words. */
export function formatProjectAge(iso) {
  const stamp = timeOf(iso);
  if (stamp === null) return '—';
  const days = Math.max(0, Math.floor((Date.now() - stamp) / 86400000));
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month' : `${months} months`;
}

const pricedValue = (variation) => (
  variation?.liveValue === null || variation?.liveValue === undefined
    ? null
    : Number(variation.liveValue)
);

/**
 * Pick the variation a basis names, with the active version as the honest
 * fallback when no version carries a value.
 */
function pickVariation(family, basis, countedVersionId) {
  const variations = safeArray(family?.variations);
  if (variations.length === 0) return { variation: null, note: null };

  if (basis === COUNT_BASIS.MANUAL || countedVersionId) {
    const chosen = variations.find((variation) => variation.id === countedVersionId);
    if (chosen) return { variation: chosen, note: null };
    // A manual choice that no longer exists falls back to the active version
    // rather than silently counting something else.
    return { variation: pickVariation(family, COUNT_BASIS.ACTIVE, null).variation, note: 'Manually counted version no longer exists' };
  }

  if (basis === COUNT_BASIS.ACTIVE) {
    const active = variations.find((variation) => variation.isActive);
    return { variation: active || variations[0] || null, note: active ? null : 'No active version set' };
  }

  if (basis === COUNT_BASIS.LATEST) {
    const latest = [...variations].sort(
      (a, b) => (timeOf(b.updatedDate || b.createdDate) || 0) - (timeOf(a.updatedDate || a.createdDate) || 0),
    )[0];
    return { variation: latest || null, note: null };
  }

  // Lowest / highest value. Variations with no priced value sort last, and when
  // nothing is priced the active version is counted instead — never a zero.
  const withValue = variations.filter((variation) => pricedValue(variation) !== null);
  if (withValue.length === 0) {
    const fallback = variations.find((variation) => variation.isActive) || variations[0] || null;
    return { variation: fallback, note: 'No priced version — active version counted instead' };
  }
  const sorted = [...withValue].sort((a, b) => {
    if (pricedValue(a) !== pricedValue(b)) return pricedValue(a) - pricedValue(b);
    return (Number(a.versionNumber) || 0) - (Number(b.versionNumber) || 0);
  });
  const chosen = basis === COUNT_BASIS.HIGHEST ? sorted[sorted.length - 1] : sorted[0];
  return { variation: chosen || null, note: null };
}

/** The dropdown options for one project: the automatic bases, then each version. */
export function buildVersionOptions(family) {
  const variations = safeArray(family?.variations);
  return [
    ...AUTOMATIC_BASIS_OPTIONS,
    ...variations.map((variation) => ({
      value: `version:${variation.id}`,
      label: variation.versionName || `Version ${variation.versionNumber ?? '?'}`,
      versionId: variation.id,
    })),
  ];
}

/** The dropdown's current value for a resolved selection. */
export function optionValueForSelection(selection) {
  if (selection?.countedVariationId && selection?.countBasis === COUNT_BASIS.MANUAL) {
    return `version:${selection.countedVariationId}`;
  }
  return selection?.countBasis || COUNT_BASIS.ACTIVE;
}

/** Translate a dropdown choice into the stored preference fields. */
export function preferenceFromOption(optionValue) {
  const value = String(optionValue || '');
  if (value.startsWith('version:')) {
    return {
      counted_version_id: value.slice('version:'.length),
      count_basis: COUNT_BASIS.MANUAL,
      manually_overridden: true,
    };
  }
  return {
    counted_version_id: null,
    count_basis: value || COUNT_BASIS.LOWEST,
    manually_overridden: true,
  };
}

/**
 * Resolve one project's inclusion and counted version from its stored
 * preference, falling back to the default selection.
 */
export function resolveSelection(family, preference) {
  const fallback = defaultSelectionFor(family);
  const pref = preference && typeof preference === 'object' ? preference : null;

  const hasInclusionOverride = pref ? typeof pref.included === 'boolean' : false;
  const included = hasInclusionOverride ? pref.included : fallback.included;
  const inclusionSource = hasInclusionOverride ? 'manual' : (fallback.included ? 'default' : 'test');
  const inclusionPill = !included
    ? TEST_EXCLUSION_PILL
    : (inclusionSource === 'manual' ? MANUAL_INCLUSION_PILL : null);

  const basis = pref?.count_basis && COUNT_BASIS_LABEL[pref.count_basis] ? pref.count_basis : fallback.count_basis;
  const { variation, note } = pickVariation(family, basis, pref?.counted_version_id || null);

  return {
    included,
    inclusionSource,
    inclusionPill,
    matchedTestTerm: fallback.matchedTerm,
    countBasis: basis,
    countBasisLabel: COUNT_BASIS_LABEL[basis],
    countedVariationId: variation?.id || null,
    countedVersionName: variation?.versionName || null,
    countedVersionNumber: variation?.versionNumber ?? null,
    countedLiveValue: variation?.liveValue ?? null,
    countedCurrency: variation?.currency || null,
    countedLineCount: variation?.lineCount || 0,
    countedUnpricedLineCount: variation?.unpricedLineCount || 0,
    countedIsActive: variation?.isActive === true,
    countBasisNote: note,
    manuallyOverridden: pref?.manually_overridden === true,
  };
}

/**
 * Apply the stored preferences to every project family. Each family gains its
 * resolved selection and the counted-version fields the demand layer reads.
 */
export function applyProjectSelection(families, preferences = {}) {
  return safeArray(families).map((family) => {
    const selection = resolveSelection(family, preferences?.[family?.id]);
    return {
      ...family,
      selection,
      included: selection.included,
      countedVariationId: selection.countedVariationId,
      countedVersionName: selection.countedVersionName,
      countedLiveValue: selection.countedLiveValue,
      countedLineCount: selection.countedLineCount,
      countedCurrency: selection.countedCurrency,
    };
  });
}

/** The counted projects only — the input to product demand. */
export function includedFamilies(selectedFamilies) {
  return safeArray(selectedFamilies).filter((family) => family.included);
}

/**
 * The six headline numbers for the selection, and nothing else: counted values
 * are summed from the counted version of included projects only.
 */
export function summariseSelection(selectedFamilies, options = {}) {
  const families = safeArray(selectedFamilies);
  const included = includedFamilies(families);
  const values = included
    .map((family) => family.countedLiveValue)
    .filter((value) => value !== null && value !== undefined);
  const currencies = new Set(included.map((family) => family.countedCurrency).filter(Boolean));

  return {
    totalLoadedProjects: options.totalLoaded ?? families.length,
    listedProjectCount: families.length,
    includedCount: included.length,
    excludedCount: families.length - included.length,
    multiVersionCount: families.filter((family) => family.variationCount > 1).length,
    countedProductLines: included.reduce((sum, family) => sum + (family.countedLineCount || 0), 0),
    countedLiveValue: values.length > 0 ? values.reduce((sum, value) => sum + (Number(value) || 0), 0) : null,
    countedCurrency: currencies.size === 1 ? [...currencies][0] : null,
    countedMixedCurrency: currencies.size > 1,
    unpricedCountedCount: included.filter((family) => family.countedLiveValue === null).length,
  };
}

/**
 * Every version of every project, marked counted or not, with the Artcoustic
 * retail and trade value of that version's own catalogue lines. The version
 * figure is a reference only: product demand and every forecast total are read
 * from the counted version alone.
 *
 * @param {Array} selectedFamilies — selected project families
 * @param {Object} [options]
 * @param {Map} [options.priceMap] — Product Master index, for catalogue resolution
 * @param {Set|Array} [options.excludedCategories] — category keys left out of the forecast
 */
export function buildVersionDetailRows(selectedFamilies, { priceMap = null, excludedCategories = [] } = {}) {
  return safeArray(selectedFamilies).flatMap((family) => safeArray(family.variations).map((variation) => {
    const counted = family.included && variation.id === family.countedVariationId;
    const artcoustic = artcousticValueOfLines(variation.lines || [], { priceMap, excludedCategories });
    return {
      projectId: family.id,
      project: family.name,
      client: family.client,
      account: family.dealerName || family.accountName,
      included: family.included,
      forecastIncluded: family.forecastIncluded === true,
      versionId: variation.id,
      versionNumber: variation.versionNumber,
      versionName: variation.versionName,
      isActive: variation.isActive === true,
      counted,
      countedNote: counted ? 'Counted in product demand' : 'Not counted in product demand',
      liveValue: variation.liveValue,
      artcousticRetail: artcoustic.retail,
      artcousticTrade: artcoustic.trade,
      artcousticUnits: artcoustic.units,
      currency: variation.currency || null,
      productLineCount: variation.lineCount || 0,
      unpricedLineCount: variation.unpricedLineCount || 0,
      updatedDate: variation.updatedDate || variation.createdDate || null,
    };
  }));
}