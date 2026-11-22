/**
 * useDesignIntelligence.js
 * -------------------------
 * React hook for the consolidated Commercial & Design Intelligence page.
 *
 * Loads data once, builds the joined report, and exposes sector filtering,
 * dealer drill-down, follow-up records, and the opportunity signals.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadConsolidatedData } from '@/lib/commercial/designIntelligence/loadConsolidatedData';
import { buildConsolidatedReport } from '@/lib/commercial/designIntelligence/buildConsolidatedReport';
import { filterFamiliesBySector, sectorCounts, groupByDealer } from '@/lib/commercial/designIntelligence/sectorScope';
import { useDealerFollowUps } from './useDealerFollowUps';

export function useDesignIntelligence() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sectorTab, setSectorTab] = useState('all_dealers');
  const [selectedDealerId, setSelectedDealerId] = useState(null);
  const [viewMode, setViewMode] = useState('account_management');
  const [refreshKey, setRefreshKey] = useState(0);
  const [followUpDialog, setFollowUpDialog] = useState(null);

  const followUps = useDealerFollowUps();

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
  const accounts = useMemo(() => report?.commercial?.accountsById ? [...report.commercial.accountsById.values()] : [], [report]);
  const accountsById = useMemo(() => report?.commercial?.accountsById || new Map(), [report]);
  const proposals = useMemo(() => {
    // The commercial dashboard stores proposalEvents; we also need raw proposals
    // for emerging opportunities. Load them from the consolidated data if available.
    return [];
  }, [report]);

  const counts = useMemo(() => sectorCounts(allFamilies), [allFamilies]);
  const scopedFamilies = useMemo(() => filterFamiliesBySector(allFamilies, sectorTab), [allFamilies, sectorTab]);
  const dealers = useMemo(() => groupByDealer(scopedFamilies), [scopedFamilies]);

  const selectedDealer = useMemo(() => {
    if (!selectedDealerId) return null;
    return dealers.find((d) => d.accountId === selectedDealerId) || null;
  }, [dealers, selectedDealerId]);

  const handleLogFollowUp = useCallback((opportunity, existing) => {
    setFollowUpDialog({ opportunity, existing });
  }, []);

  const handleSaveFollowUp = useCallback(async (data, existingId) => {
    if (existingId) {
      return followUps.updateFollowUp(existingId, data);
    }
    return followUps.saveFollowUp(data);
  }, [followUps]);

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
    viewMode,
    setViewMode,
    counts,
    scopedFamilies,
    dealers,
    selectedDealer,
    accounts,
    accountsById,
    followUps,
    followUpDialog,
    setFollowUpDialog,
    handleLogFollowUp,
    handleSaveFollowUp,
    priceContext: report?.priceContext || {},
  };
}

export default useDesignIntelligence;