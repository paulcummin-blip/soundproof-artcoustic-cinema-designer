/**
 * useDesignIntelligence.js
 * -------------------------
 * React hook for the consolidated Commercial & Design Intelligence page.
 *
 * Loads data once, builds the joined report, and exposes sector filtering,
 * dealer drill-down, follow-up records, the merged dealer summary, and the
 * opportunity signals.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadConsolidatedData } from '@/lib/commercial/designIntelligence/loadConsolidatedData';
import { buildConsolidatedReport } from '@/lib/commercial/designIntelligence/buildConsolidatedReport';
import { buildDealerSummary } from '@/lib/commercial/designIntelligence/buildDealerSummary';
import { filterFamiliesBySector, sectorCounts, groupByDealer } from '@/lib/commercial/designIntelligence/sectorScope';
import { isInternalAccount } from '@/lib/commercial/designIntelligence/internalAccountFilter';
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
  const accounts = useMemo(() => {
    const list = report?.commercial?.accountsById ? [...report.commercial.accountsById.values()] : [];
    // Exclude internal accounts from the dealer-facing management view
    return list.filter((a) => !isInternalAccount(a));
  }, [report]);
  const accountsById = useMemo(() => report?.commercial?.accountsById || new Map(), [report]);

  const counts = useMemo(() => sectorCounts(allFamilies), [allFamilies]);
  const scopedFamilies = useMemo(() => filterFamiliesBySector(allFamilies, sectorTab), [allFamilies, sectorTab]);
  const dealers = useMemo(() => groupByDealer(scopedFamilies), [scopedFamilies]);

  const selectedDealer = useMemo(() => {
    if (!selectedDealerId) return null;
    return dealers.find((d) => d.accountId === selectedDealerId) || null;
  }, [dealers, selectedDealerId]);

  // Build the merged, deduplicated dealer summary for the account management
  // table. Each dealer appears exactly once, with thresholds applied and
  // transparent action categories assigned.
  const dealerSummary = useMemo(() => {
    if (!report) return { dealers: [], summaryCounts: { overlooked: 0, needingAttention: 0, emerging: 0, followUpsDue: 0 } };
    return buildDealerSummary({
      families: scopedFamilies,
      accounts,
      accountsById,
      proposalEvents: report.commercial?.proposalEvents || [],
      auditRecords: report.auditRecords || [],
      followUpsByKey: followUps.followUpsByKey,
      followUpsByAccount: followUps.followUpsByAccount,
      sectorTab,
    });
  }, [report, scopedFamilies, accounts, accountsById, followUps.followUpsByKey, followUps.followUpsByAccount, sectorTab]);

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
    dealerSummary,
    priceContext: report?.priceContext || {},
  };
}

export default useDesignIntelligence;