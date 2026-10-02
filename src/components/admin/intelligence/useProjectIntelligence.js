// useProjectIntelligence.js
// -------------------------
// Loads the reporting data set once and rebuilds the report when filters
// change. All derivation happens in the pure layer under
// lib/commercial/projectReporting — this hook only moves data.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadProjectIntelligenceData } from '@/lib/commercial/projectReporting/loadProjectIntelligenceData';
import { buildProjectIntelligenceReport } from '@/lib/commercial/projectReporting/buildProjectIntelligenceReport';

export const DEFAULT_FILTERS = Object.freeze({
  dateFrom: '',
  dateTo: '',
  accountId: '',
  bucket: '',
  includeArchived: false,
  includeUnpriced: true,
  valueBasis: 'both',
  search: '',
});

export function useProjectIntelligence() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadProjectIntelligenceData();
      setData(loaded);
    } catch (err) {
      setError(err?.message || 'Project reporting data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const report = useMemo(() => {
    if (!data) return null;
    return buildProjectIntelligenceReport({
      projects: data.projects,
      versionsByProjectId: data.versionsByProjectId,
      proposalsByProjectId: data.proposalsByProjectId,
      statusDefsByAccountId: data.statusDefsByAccountId,
      accounts: data.accounts,
      priceContext: data.priceContext,
      filters,
    });
  }, [data, filters]);

  const accountOptions = useMemo(() => (
    (data?.accounts || [])
      .map((account) => ({ id: account.id, name: account.name || 'Unnamed account' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [data]);

  const updateFilter = useCallback((key, value) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => setFilters({ ...DEFAULT_FILTERS }), []);

  return {
    data,
    report,
    loading,
    error,
    filters,
    accountOptions,
    updateFilter,
    resetFilters,
    reload: load,
  };
}

export default useProjectIntelligence;