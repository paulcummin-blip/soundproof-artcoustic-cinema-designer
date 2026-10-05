import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Read-only recovery for a comparison saved before its comparison metadata was
// persisted. It rebuilds the table from each version's own historical frozen
// engineering evidence; nothing is written and no live design state is read.
export default function useRecoveredComparisonTable({ proposal, hasStoredTable }) {
  const [result, setResult] = useState({ proposalId: null, status: 'loading', table: null });

  useEffect(() => {
    if (proposal?.proposal_type !== 'comparison' || hasStoredTable || !proposal?.id) return undefined;
    let cancelled = false;
    setResult({ proposalId: proposal.id, status: 'loading', table: null });
    (async () => {
      try {
        const response = await base44.functions.invoke('readProposalComparisonEvidence', { proposal_id: proposal.id });
        if (!cancelled) setResult({ proposalId: proposal.id, status: 'ready', table: response?.data?.table || null });
      } catch {
        if (!cancelled) setResult({ proposalId: proposal.id, status: 'unavailable', table: null });
      }
    })();
    return () => { cancelled = true; };
  }, [proposal?.id, proposal?.proposal_type, hasStoredTable]);

  // A previous project's recovery must never be displayed while switching.
  if (hasStoredTable) return { status: 'ready', table: null };
  return result.proposalId === proposal?.id ? result : { status: 'loading', table: null };
}