import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Read-only recovery for a comparison saved before its comparison metadata was
// persisted. It rebuilds the table from each version's own historical frozen
// engineering evidence; nothing is written and no live design state is read.
export default function useRecoveredComparisonTable({ proposal, hasStoredTable }) {
  const [recovered, setRecovered] = useState(null);

  useEffect(() => {
    if (proposal?.proposal_type !== 'comparison' || hasStoredTable || !proposal?.id) {
      setRecovered(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await base44.functions.invoke('readProposalComparisonEvidence', { proposal_id: proposal.id });
        if (!cancelled) setRecovered(response?.data?.table || null);
      } catch {
        // No recoverable evidence: the table states why instead of failing.
        if (!cancelled) setRecovered(null);
      }
    })();
    return () => { cancelled = true; };
  }, [proposal?.id, proposal?.proposal_type, hasStoredTable]);

  return recovered;
}