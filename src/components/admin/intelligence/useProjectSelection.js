// useProjectSelection.js
// ----------------------
// Inclusion, status, category and counted-version state for the Artcoustic
// forecast in Project Intelligence.
//
// All derivation lives in the pure layer under lib/commercial/projectReporting —
// this hook only holds the admin's choices, persists them locally, and rebuilds
// the forecast when a choice changes.
//
// ONE catalogue pass feeds everything: the demand rows, the per-project
// Artcoustic retail the status control and the age/trend views read, and the
// category totals. Nothing recomputes demand, so no two figures on the page can
// disagree.
//
// Read-only against the database: the only storage used is local report
// selection storage in the browser.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyProjectSelection,
  buildVersionDetailRows,
  preferenceFromOption,
  summariseSelection,
} from '@/lib/commercial/projectReporting/projectSelection';
import { buildCatalogueDemand } from '@/lib/commercial/projectReporting/productDemand';
import {
  buildCategoryRows,
  buildForecastView,
  excludedCategoryKeys,
} from '@/lib/commercial/projectReporting/forecastDemand';
import {
  applyStatusInclusion,
  buildStatusRows,
  includedStatusKeys,
} from '@/lib/commercial/projectReporting/statusInclusion';
import { buildPipelineAgeSummary } from '@/lib/commercial/projectReporting/pipelineAge';
import { tradeValueOf } from '@/lib/commercial/projectReporting/artcousticForecast';
import {
  clearCategoryInclusion,
  clearSelection,
  clearStatusInclusion,
  readCategoryInclusion,
  readSelection,
  readStatusInclusion,
  writeCategoryInclusion,
  writeSelection,
  writeStatusInclusion,
} from './projectSelectionStore';

const EMPTY_PASS = {
  rows: [],
  excludedLines: [],
  abfuserExclusions: [],
  abfuserWarnings: [],
  unitsByProjectId: {},
  categoryTotals: [],
};

/**
 * @param {Object} input
 * @param {Array} input.families — report families (one per project)
 * @param {Map} input.priceMap — Product Master index (sku → product)
 * @param {number} input.totalLoaded — projects loaded by the reporting run
 */
export function useProjectSelection({ families = [], priceMap = null, totalLoaded } = {}) {
  const [preferences, setPreferences] = useState(() => readSelection());
  const [statusPreferences, setStatusPreferences] = useState(() => readStatusInclusion());
  const [categoryPreferences, setCategoryPreferences] = useState(() => readCategoryInclusion());

  useEffect(() => {
    writeSelection(preferences);
  }, [preferences]);

  useEffect(() => {
    writeStatusInclusion(statusPreferences);
  }, [statusPreferences]);

  useEffect(() => {
    writeCategoryInclusion(categoryPreferences);
  }, [categoryPreferences]);

  const selectedFamilies = useMemo(
    () => applyProjectSelection(families, preferences),
    [families, preferences],
  );

  // ONE catalogue pass over every listed project: Artcoustic catalogue lines of
  // each project's counted version only, with no quoted snapshot demand. The pass
  // keeps the per-project contribution of every row, so the forecast view below
  // can narrow it to the forecast without a second calculation.
  const cataloguePass = useMemo(() => {
    if (selectedFamilies.length === 0) return EMPTY_PASS;
    return buildCatalogueDemand({ families: selectedFamilies, priceMap, includeQuoted: false });
  }, [selectedFamilies, priceMap]);

  // Product categories: every catalogue category present, all included by default.
  const categoryRows = useMemo(
    () => buildCategoryRows(cataloguePass.categoryTotals, categoryPreferences),
    [cataloguePass.categoryTotals, categoryPreferences],
  );
  const excludedCategories = useMemo(() => excludedCategoryKeys(categoryRows), [categoryRows]);

  // Artcoustic retail and units for EVERY listed project, so the status control
  // can show what each status is worth before it is included or excluded.
  const allProjectsView = useMemo(
    () => buildForecastView({ demand: cataloguePass, excludedCategories }),
    [cataloguePass, excludedCategories],
  );

  // Statuses: every resolved status present in the loaded projects, with its
  // default from its own label and canonical bucket.
  const statusRows = useMemo(
    () => buildStatusRows(selectedFamilies, statusPreferences, {
      retailByProjectId: allProjectsView.projectRetail,
    }),
    [selectedFamilies, statusPreferences, allProjectsView.projectRetail],
  );
  const statusKeys = useMemo(() => includedStatusKeys(statusRows), [statusRows]);

  // A project is inside the forecast when it is included in the table AND its
  // resolved status is included. Each project carries its Artcoustic retail, trade
  // and units, always from its counted version.
  const forecastFamilies = useMemo(() => (
    applyStatusInclusion(selectedFamilies, statusKeys).map((family) => {
      const retail = allProjectsView.projectRetail.get(family.id);
      return {
        ...family,
        artcousticRetail: retail === undefined ? null : retail,
        artcousticTrade: retail === undefined ? null : tradeValueOf(retail),
        artcousticUnits: allProjectsView.projectUnits.get(family.id) || 0,
      };
    })
  ), [selectedFamilies, statusKeys, allProjectsView]);

  const forecastProjects = useMemo(
    () => forecastFamilies.filter((family) => family.forecastIncluded === true),
    [forecastFamilies],
  );

  // The forecast itself: the catalogue demand narrowed to the forecast projects
  // and the included categories.
  const forecastView = useMemo(() => buildForecastView({
    demand: cataloguePass,
    projectIds: new Set(forecastProjects.map((family) => family.id)),
    excludedCategories,
  }), [cataloguePass, forecastProjects, excludedCategories]);

  const forecastSummary = useMemo(() => ({
    projectCount: forecastProjects.length,
    lineCount: forecastView.lineCount,
    units: forecastView.units,
    retail: forecastView.retail,
    trade: forecastView.trade,
    unpricedLineCount: forecastView.unpricedLineCount,
    unpricedQuantity: forecastView.unpricedQuantity,
  }), [forecastProjects, forecastView]);

  const summary = useMemo(
    () => summariseSelection(forecastFamilies, { totalLoaded }),
    [forecastFamilies, totalLoaded],
  );

  // Age and Artcoustic value ageing: forecast projects only, counted versions
  // only, one project counted once.
  const pipelineAge = useMemo(() => buildPipelineAgeSummary(forecastProjects, {
    unitsByProjectId: forecastView.projectUnits,
    retailByProjectId: forecastView.projectRetail,
  }), [forecastProjects, forecastView]);

  const versionRows = useMemo(
    () => buildVersionDetailRows(forecastFamilies, { priceMap, excludedCategories }),
    [forecastFamilies, priceMap, excludedCategories],
  );

  const setIncluded = useCallback((projectId, included) => {
    setPreferences((previous) => ({
      ...previous,
      [projectId]: { ...(previous[projectId] || {}), included, manually_overridden: true },
    }));
  }, []);

  const setCountedOption = useCallback((projectId, optionValue) => {
    setPreferences((previous) => ({
      ...previous,
      [projectId]: { ...(previous[projectId] || {}), ...preferenceFromOption(optionValue) },
    }));
  }, []);

  const setStatusIncluded = useCallback((statusKey, included) => {
    setStatusPreferences((previous) => ({ ...previous, [statusKey]: included }));
  }, []);

  const setCategoryIncluded = useCallback((categoryKey, included) => {
    setCategoryPreferences((previous) => ({ ...previous, [categoryKey]: included }));
  }, []);

  const resetStatuses = useCallback(() => {
    clearStatusInclusion();
    setStatusPreferences({});
  }, []);

  const resetCategories = useCallback(() => {
    clearCategoryInclusion();
    setCategoryPreferences({});
  }, []);

  const resetSelection = useCallback(() => {
    clearSelection();
    clearStatusInclusion();
    clearCategoryInclusion();
    setPreferences({});
    setStatusPreferences({});
    setCategoryPreferences({});
  }, []);

  return {
    selectedFamilies: forecastFamilies,
    forecastProjects,
    forecastSummary,
    productDemand: forecastView.rows,
    productDemandSummary: forecastSummary,
    statusRows,
    categoryRows,
    excludedLines: cataloguePass.excludedLines,
    abfuserExclusions: cataloguePass.abfuserExclusions || [],
    abfuserWarnings: cataloguePass.abfuserWarnings || [],
    unitsByProjectId: forecastView.projectUnits,
    retailByProjectId: forecastView.projectRetail,
    pipelineAge,
    versionRows,
    summary,
    preferences,
    statusPreferences,
    categoryPreferences,
    setIncluded,
    setCountedOption,
    setStatusIncluded,
    setCategoryIncluded,
    resetStatuses,
    resetCategories,
    resetSelection,
  };
}

export default useProjectSelection;