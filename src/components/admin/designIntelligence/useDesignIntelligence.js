/**
 * useDesignIntelligence.js
 * -------------------------
 * React hook for the consolidated Commercial & Design Intelligence page.
 *
 * Loads data once via the consolidated loader, builds the joined report,
 * and exposes sector filtering and dealer drill-down state. All derivation
 * happens in the pure layer under lib/commercial/designIntelligence.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadConsolidatedData } from '@/lib/commercial/designIntelligence/loadConsolidatedData';
import { buildConsolidatedReport } from '@/lib/commercial/designIntelligence/buildConsolidatedReport';
import { filterFamiliesBySector, sectorCounts, groupByDealer } from '@/lib/commercial/designIntelligence/sectorScope';

export function useDesignIntelligence() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sectorTab, setSectorTab] = useState('all_dealers');
  const [selectedDealerId, setSelectedDealerId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadConsolidatedData();
      setReport(buildConsolidatedReport(data));
    } catch (err) {
      setError(err?.message || 'Consolidated data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const allFamilies = useMemo(() => report?.families || [], [report]);
  const counts = useMemo(() => sectorCounts(allFamilies), [allFamilies]);
  const scopedFamilies = useMemo(() => filterFamiliesBySector(allFamilies, sectorTab), [allFamilies, sectorTab]);
  const dealers = useMemo(() => groupByDealer(scopedFamilies), [scopedFamilies]);

  const selectedDealer = useMemo(() => {
    if (!selectedDealerId) return null;
    return dealers.find((d) => d.accountId === selectedDealerId) || null;
  }, [dealers, selectedDealerId]);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  return {
    report,
    loading,
    error,
    reload,
    sectorTab,
    setSectorTab,
    selectedDealerId,
    setSelectedDealerId,
    counts,
    scopedFamilies,
    dealers,
    selectedDealer,
    priceContext: report?.priceContext || {},
  };
}

export default useDesignIntelligence;