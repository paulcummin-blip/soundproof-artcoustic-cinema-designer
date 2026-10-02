/**
 * buildProjectIntelligenceReport.js
 * ---------------------------------
 * The Project Intelligence derivation.
 *
 * ONE PROJECT IS ONE COMMERCIAL FAMILY. Counts are always project counts. A
 * family's ProjectVersions are variations: they are reported in the variation
 * drawer and the Variations Detail export, and are never counted as separate
 * commercial projects.
 *
 * Two values are kept separate everywhere and are never added together:
 *   · Live Design Value      — the active version priced with the existing
 *                              pricing engine against the current Product Master.
 *   · Quoted Snapshot Value  — frozen at proposal generation in
 *                              Proposal.engineering_snapshot.pricing.
 *
 * Read-only: never writes to Project, ProjectVersion, Proposal, ProjectStatus
 * or ProductPrice.
 *
 * Pure: no React, no side effects, no entity access.
 * Supporting modules: statusBuckets, versionPricing, productDemand,
 * possibleDuplicates, reportWarnings, reportingUtils.
 */

import { BUCKET, STATUS_BUCKETS, resolveStatusBucket } from './statusBuckets';
import { deriveVersionPricing } from './versionPricing';
import { buildProductDemand } from './productDemand';
import { detectPossibleDuplicates, roomDimsOf } from './possibleDuplicates';
import { buildWarnings } from './reportWarnings';
import { safeArray, safeObject, text, timeOf } from './reportingUtils';

function buildStatusLookup(statusDefsByAccountId) {
  const byAccount = new Map();
  for (const [accountId, defs] of Object.entries(statusDefsByAccountId || {})) {
    const map = new Map();
    for (const def of safeArray(defs)) {
      if (def?.status_id) map.set(String(def.status_id), def);
    }
    byAccount.set(accountId, map);
  }
  return byAccount;
}

/**
 * The canonical bucket for one project. ProjectStatus is per account, so the
 * account's own resolved label is read before the raw status value.
 */
function resolveStatus(project, statusLookup) {
  const rawStatus = text(project?.project_status) || null;
  const defs = statusLookup.get(project?.account_id) || null;
  const def = rawStatus && defs ? defs.get(rawStatus) : null;
  const label = def?.label || null;
  const { bucket, reason, source } = resolveStatusBucket({
    projectStatus: rawStatus,
    statusLabel: label,
    lifecycleStatus: project?.lifecycle_status || null,
  });
  return {
    rawStatusId: rawStatus,
    rawStatusLabel: label || rawStatus || '(no status set)',
    statusResolvedFromAccount: Boolean(def),
    bucket,
    bucketReason: reason,
    bucketSource: source,
  };
}

function buildVariation({ project, version, isActive, priceContext, legacy = false }) {
  const priced = deriveVersionPricing({
    designState: legacy ? null : version?.design_state,
    legacyProject: project,
    priceContext,
  });
  const state = legacy ? {} : safeObject(version?.design_state) || {};
  const warnings = [];

  if (priced.unpricedLineCount > 0) {
    warnings.push(`${priced.unpricedLineCount} product line${priced.unpricedLineCount === 1 ? '' : 's'} have no price`);
  }
  if (priced.inactiveLines.length > 0) {
    warnings.push(`${priced.inactiveLines.length} inactive product line${priced.inactiveLines.length === 1 ? '' : 's'}`);
  }
  if (priced.priceListAvailable && priced.value === null) warnings.push('No priced products in this version');
  if (!priced.priceListAvailable) warnings.push('Price list not available for this territory');
  if (legacy) warnings.push('No design version record — priced from the project record');
  if (!version?.published_fingerprint && !legacy) warnings.push('Engineering not published for this version');

  return {
    id: version?.id || `legacy:${project?.id}`,
    projectId: project?.id || null,
    versionNumber: Number(version?.version_number) || (legacy ? 1 : null),
    versionName: legacy
      ? 'Legacy design (project record)'
      : (text(version?.version_name) || `Version ${Number(version?.version_number) || '?'}`),
    isActive,
    legacySource: legacy,
    createdDate: version?.created_date || project?.created_date || null,
    updatedDate: version?.updated_date || project?.updated_date || null,
    format: text(state.dolby_config || project?.dolby_config) || null,
    // The published engineering state is read from the version record itself,
    // so no extra cache load is needed for the variation drawer.
    publicationSummary: version?.published_fingerprint
      ? {
        fingerprint: version.published_fingerprint,
        publishedAt: version.published_at || null,
        engineVersion: version.published_engine_version || null,
        rp22Version: version.published_rp22_version || null,
        algorithmVersion: version.published_algorithm_version || null,
        reason: version.publication_reason || null,
      }
      : null,
    liveValue: priced.value,
    liveValueExVat: priced.valueExVat,
    priceMode: priced.priceMode,
    difficultyMultiplier: priced.difficultyMultiplier,
    currency: priced.currency,
    lines: priced.lines,
    inactiveLines: priced.inactiveLines,
    lineCount: priced.lineCount,
    unpricedLineCount: priced.unpricedLineCount,
    priceListAvailable: priced.priceListAvailable,
    warnings,
  };
}

/** The frozen quoted value, from the most recent proposal carrying a snapshot. */
export function resolveQuotedValue(proposals) {
  const withSnapshot = safeArray(proposals).filter((proposal) => safeObject(proposal?.engineering_snapshot)?.pricing);
  if (withSnapshot.length === 0) {
    return {
      value: null,
      available: false,
      at: null,
      currency: null,
      priceMode: null,
      proposalId: null,
      proposalStatus: null,
      reason: 'No proposal snapshot for this project.',
    };
  }

  const latest = [...withSnapshot].sort(
    (a, b) => (timeOf(b?.proposal_date || b?.created_date) || 0) - (timeOf(a?.proposal_date || a?.created_date) || 0),
  )[0];
  const pricing = safeObject(latest.engineering_snapshot)?.pricing || {};
  const rawValue = pricing.system_total;
  const value = rawValue === null || rawValue === undefined || Number.isNaN(Number(rawValue)) ? null : Number(rawValue);

  return {
    value,
    available: pricing.available !== false && value !== null,
    at: latest.proposal_date || latest.created_date || null,
    currency: pricing.currency || null,
    priceMode: pricing.price_mode || null,
    proposalId: latest.id || null,
    proposalStatus: latest.status || null,
    reason: value === null ? 'The latest proposal snapshot carries no quoted value.' : null,
  };
}

function buildFamily({ project, versions, proposals, statusLookup, accountsById, priceContext }) {
  const status = resolveStatus(project, statusLookup);
  const sortedVersions = [...safeArray(versions)].sort(
    (a, b) => (Number(a?.version_number) || 0) - (Number(b?.version_number) || 0),
  );

  const activeId = project?.active_version_id || null;
  let activeVersion = sortedVersions.find((version) => version.id === activeId) || null;
  let activeVersionFallback = false;
  if (!activeVersion && sortedVersions.length > 0) {
    activeVersion = sortedVersions[sortedVersions.length - 1];
    activeVersionFallback = true;
  }

  const variations = sortedVersions.map((version) => buildVariation({
    project,
    version,
    isActive: version.id === activeVersion?.id,
    priceContext,
  }));

  // Unmigrated or pre-version projects have no ProjectVersion records. The
  // project record's own design fields become the single legacy variation so
  // the value is still visible, and the project is still counted once.
  if (variations.length === 0) {
    variations.push(buildVariation({ project, version: null, isActive: true, priceContext, legacy: true }));
  }

  const activeVariation = variations.find((variation) => variation.isActive) || variations[0] || null;
  const quoted = resolveQuotedValue(proposals);
  const account = project?.account_id ? accountsById.get(project.account_id) || null : null;

  const warnings = [];
  if (status.bucket === BUCKET.UNCLASSIFIED) warnings.push('Unclassified status');
  if (quoted.value === null) warnings.push('No quoted snapshot value');
  if (!activeVariation?.priceListAvailable) warnings.push('Price list unavailable');
  else if (activeVariation?.liveValue === null) warnings.push('Live value not calculable');
  if ((activeVariation?.unpricedLineCount || 0) > 0) warnings.push('Unpriced product lines');
  if (activeVersionFallback) warnings.push('No active version set — highest version used');
  if (!project?.account_id) warnings.push('No account on project');
  if (!project?.dealer_name && !account?.name) warnings.push('No dealer name');

  return {
    id: project?.id || null,
    name: text(project?.name) || 'Untitled project',
    client: text(project?.client_name) || null,
    reference: text(project?.project_reference) || null,
    accountId: project?.account_id || null,
    accountName: account?.name || null,
    accountType: account?.account_type || null,
    territory: account?.territory || null,
    dealerName: text(project?.dealer_name) || account?.name || null,
    ...status,
    lifecycleStatus: text(project?.lifecycle_status) || 'Draft',
    isArchived: text(project?.lifecycle_status) === 'Archived',
    variationCount: sortedVersions.length,
    activeVersionId: activeVersion?.id || null,
    activeVersionName: activeVariation?.versionName || null,
    activeVersionNumber: activeVariation?.versionNumber || null,
    activeVersionFallback,
    liveValue: activeVariation?.liveValue ?? null,
    liveValueExVat: activeVariation?.liveValueExVat ?? null,
    livePriceMode: activeVariation?.priceMode || null,
    liveCurrency: activeVariation?.currency || null,
    livePriceListAvailable: activeVariation?.priceListAvailable === true,
    liveSource: activeVariation?.legacySource ? 'project_record' : 'active_version',
    quotedValue: quoted.value,
    quotedCurrency: quoted.currency,
    quotedAt: quoted.at,
    quotedProposalId: quoted.proposalId,
    quotedReason: quoted.reason,
    quotedSnapshotBreakdown: [],
    productLineCount: activeVariation?.lineCount || 0,
    unpricedLineCount: activeVariation?.unpricedLineCount || 0,
    inactiveLineCount: activeVariation?.inactiveLines?.length || 0,
    roomDims: roomDimsOf(project, activeVersion),
    commercialTier: text(project?.commercial_tier) || 'UNCLASSIFIED',
    createdDate: project?.created_date || null,
    updatedDate: project?.updated_date || null,
    warnings,
    variations,
  };
}

function matchesDateRange(family, filters) {
  if (!filters.dateFrom && !filters.dateTo) return true;
  const created = timeOf(family.createdDate);
  if (created === null) return false;
  if (filters.dateFrom && created < new Date(`${filters.dateFrom}T00:00:00`).getTime()) return false;
  if (filters.dateTo && created > new Date(`${filters.dateTo}T23:59:59`).getTime()) return false;
  return true;
}

function matchesSearch(family, search) {
  const term = text(search).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!term) return true;
  return [
    family.name,
    family.client,
    family.reference,
    family.dealerName,
    family.accountName,
    family.rawStatusLabel,
  ].some((value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').includes(term));
}

function matchesFilters(family, filters) {
  if (family.isArchived && !filters.includeArchived) return false;
  if (filters.accountId && family.accountId !== filters.accountId) return false;
  if (filters.bucket && family.bucket !== filters.bucket) return false;
  if (!matchesDateRange(family, filters)) return false;
  if (!matchesSearch(family, filters.search)) return false;

  const hasAnyValue = family.liveValue !== null || family.quotedValue !== null;
  if (!filters.includeUnpriced && !hasAnyValue) return false;
  if (!filters.includeUnpriced && filters.valueBasis === 'live' && family.liveValue === null) return false;
  if (!filters.includeUnpriced && filters.valueBasis === 'quoted' && family.quotedValue === null) return false;
  return true;
}

/**
 * Totals for one value type across families. Live Design Value and Quoted
 * Snapshot Value are summed separately and never combined.
 */
export function sumValues(families, valueKey) {
  const currencyKey = valueKey === 'liveValue' ? 'liveCurrency' : 'quotedCurrency';
  const values = families
    .map((family) => family[valueKey])
    .filter((value) => value !== null && value !== undefined);
  if (values.length === 0) return { total: null, currency: null, mixedCurrency: false };

  const currencies = new Set(families.map((family) => family[currencyKey]).filter(Boolean));
  return {
    total: values.reduce((sum, value) => sum + (Number(value) || 0), 0),
    currency: currencies.size === 1 ? [...currencies][0] : null,
    mixedCurrency: currencies.size > 1,
  };
}

function buildBucketBreakdown(families) {
  return STATUS_BUCKETS.map((bucket) => {
    const inBucket = families.filter((family) => family.bucket === bucket.key);
    const live = sumValues(inBucket, 'liveValue');
    const quoted = sumValues(inBucket, 'quotedValue');
    return {
      bucket: bucket.key,
      label: bucket.label,
      count: inBucket.length,
      variations: inBucket.reduce((sum, family) => sum + family.variationCount, 0),
      liveValue: live.total,
      liveCurrency: live.currency,
      liveMixedCurrency: live.mixedCurrency,
      quotedValue: quoted.total,
      quotedCurrency: quoted.currency,
      quotedMixedCurrency: quoted.mixedCurrency,
    };
  });
}

/**
 * Build the Project Intelligence report.
 *
 * @param {Object} input
 * @param {Array} input.projects — Project records
 * @param {Object} input.versionsByProjectId — { [projectId]: ProjectVersion[] }
 * @param {Object} input.proposalsByProjectId — { [projectId]: Proposal[] }
 * @param {Object} input.statusDefsByAccountId — { [accountId]: ProjectStatus[] }
 * @param {Array} input.accounts — Account records
 * @param {Object} input.priceContext — { priceMap, soundbarOptions, priceListAvailable, territoryCode, currency }
 * @param {Object} input.filters
 * @returns {Object} the report model
 */
export function buildProjectIntelligenceReport({
  projects = [],
  versionsByProjectId = {},
  proposalsByProjectId = {},
  statusDefsByAccountId = {},
  accounts = [],
  priceContext = {},
  filters = {},
} = {}) {
  const resolvedFilters = {
    dateFrom: filters.dateFrom || null,
    dateTo: filters.dateTo || null,
    accountId: filters.accountId || null,
    bucket: filters.bucket || null,
    includeArchived: filters.includeArchived === true,
    includeUnpriced: filters.includeUnpriced !== false,
    valueBasis: ['live', 'quoted', 'both'].includes(filters.valueBasis) ? filters.valueBasis : 'both',
    search: filters.search || '',
  };

  const statusLookup = buildStatusLookup(statusDefsByAccountId);
  const accountsById = new Map(safeArray(accounts).map((account) => [account?.id, account]));

  const allFamilies = safeArray(projects).map((project) => buildFamily({
    project,
    versions: versionsByProjectId[project?.id] || [],
    proposals: proposalsByProjectId[project?.id] || [],
    statusLookup,
    accountsById,
    priceContext,
  }));

  // Quoted demand lines come from the same frozen snapshot the quoted value is
  // read from, so demand and value can never disagree.
  for (const family of allFamilies) {
    const snapshot = safeArray(proposalsByProjectId[family.id])
      .filter((proposal) => safeObject(proposal?.engineering_snapshot)?.pricing)
      .sort((a, b) => (timeOf(b?.proposal_date || b?.created_date) || 0) - (timeOf(a?.proposal_date || a?.created_date) || 0))[0];
    family.quotedSnapshotBreakdown = snapshot
      ? safeArray(safeObject(snapshot.engineering_snapshot)?.pricing?.breakdown)
      : [];
  }

  const families = allFamilies
    .filter((family) => matchesFilters(family, resolvedFilters))
    .sort((a, b) => {
      const aValue = resolvedFilters.valueBasis === 'quoted' ? (a.quotedValue ?? -1) : (a.liveValue ?? -1);
      const bValue = resolvedFilters.valueBasis === 'quoted' ? (b.quotedValue ?? -1) : (b.liveValue ?? -1);
      if (bValue !== aValue) return bValue - aValue;
      return (timeOf(b.updatedDate) || 0) - (timeOf(a.updatedDate) || 0);
    });

  const productDemand = buildProductDemand({ families, priceMap: priceContext.priceMap });
  const duplicates = detectPossibleDuplicates(families);
  const bucketBreakdown = buildBucketBreakdown(families);
  const liveTotals = sumValues(families, 'liveValue');
  const quotedTotals = sumValues(families, 'quotedValue');
  const bucketCount = (key) => families.filter((family) => family.bucket === key).length;

  const summary = {
    projectCount: families.length,
    totalProjectCount: allFamilies.length,
    archivedExcludedCount: allFamilies.filter((family) => family.isArchived && !resolvedFilters.includeArchived).length,
    variationCount: families.reduce((sum, family) => sum + family.variationCount, 0),
    legacyDesignCount: families.filter((family) => family.liveSource === 'project_record').length,
    bucketCounts: {
      prospective: bucketCount(BUCKET.PROSPECTIVE),
      live: bucketCount(BUCKET.LIVE),
      completed: bucketCount(BUCKET.COMPLETED),
      lost: bucketCount(BUCKET.LOST),
      archived: bucketCount(BUCKET.ARCHIVED),
      unclassified: bucketCount(BUCKET.UNCLASSIFIED),
    },
    totalLiveValue: liveTotals.total,
    liveCurrency: liveTotals.currency,
    liveMixedCurrency: liveTotals.mixedCurrency,
    totalQuotedValue: quotedTotals.total,
    quotedCurrency: quotedTotals.currency,
    quotedMixedCurrency: quotedTotals.mixedCurrency,
    unpricedProjectCount: families.filter((family) => family.liveValue === null).length,
    partialPricingProjectCount: families.filter((family) => family.liveValue !== null && family.unpricedLineCount > 0).length,
    noQuotedValueCount: families.filter((family) => family.quotedValue === null).length,
    duplicatePairCount: duplicates.length,
    productSkuCount: productDemand.length,
  };

  return {
    generatedAt: new Date().toISOString(),
    filters: resolvedFilters,
    families,
    variations: families.flatMap((family) => family.variations),
    productDemand,
    duplicates,
    warnings: buildWarnings({ families, duplicates, productDemand }),
    summary,
    bucketBreakdown,
    priceContext: {
      priceListAvailable: priceContext.priceListAvailable === true,
      territoryCode: priceContext.territoryCode || null,
      currency: priceContext.currency || null,
    },
  };
}

export const __test__ = { resolveQuotedValue, sumValues };