// useProjectSelection.js
// ----------------------
// Inclusion and counted-version state for Project Intelligence.
//
// All derivation lives in the pure layer under lib/commercial/projectReporting —
// this hook only holds the admin's choices, persists them locally, and rebuilds
// the counted-version product demand when a choice changes.
//
// Read-only against the database: the only storage used is local report
// selection storage in the browser.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyProjectSelection,
  buildVersionDetailRows,
  includedFamilies,
  preferenceFromOption,
  summariseSelection,
} from '@/lib/commercial/projectReporting/projectSelection';
import { buildCatalogueDemand } from '@/lib/commercial/projectReporting/productDemand';
import { clearSelection, readSelection, writeSelection } from './projectSelectionStore';

/**
 * @param {Object} input
 * @param {Array} input.families — report families (one per project)
 * @param {Map} input.priceMap — Product Master index (sku → product)
 * @param {number} input.totalLoaded — projects loaded by the reporting run
 */
export function useProjectSelection({ families = [], priceMap = null, totalLoaded } = {}) {
  const [preferences, setPreferences] = useState(() => readSelection());

  useEffect(() => {
    writeSelection(preferences);
  }, [preferences]);

  const selectedFamilies = useMemo(
    () => applyProjectSelection(families, preferences),
    [families, preferences],
  );

  const summary = useMemo(
    () => summariseSelection(selectedFamilies, { totalLoaded }),
    [selectedFamilies, totalLoaded],
  );

  // Product demand counts the counted version of included projects only. No
  // excluded project and no non-counted version can reach this aggregation, and
  // only Artcoustic catalogue lines are aggregated. The excluded lines are the
  // audit trail for what was left out; they never affect the demand totals.
  const catalogueDemand = useMemo(() => {
    const counted = includedFamilies(selectedFamilies);
    if (counted.length === 0) return { rows: [], excludedLines: [] };
    return buildCatalogueDemand({ families: counted, priceMap });
  }, [selectedFamilies, priceMap]);

  const productDemand = catalogueDemand.rows;
  const excludedLines = catalogueDemand.excludedLines;

  const versionRows = useMemo(() => buildVersionDetailRows(selectedFamilies), [selectedFamilies]);

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

  const resetSelection = useCallback(() => {
    clearSelection();
    setPreferences({});
  }, []);

  return {
    selectedFamilies,
    productDemand,
    excludedLines,
    versionRows,
    summary,
    preferences,
    setIncluded,
    setCountedOption,
    resetSelection,
  };
}

export default useProjectSelection;