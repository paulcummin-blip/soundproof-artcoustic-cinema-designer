import React from 'react';
export default function ComparisonEvidenceState({ loading = false }) {
  return <div role={loading ? 'status' : 'alert'} className="rounded-md border border-border bg-muted p-4 text-sm text-foreground">
    {loading ? 'Reading frozen comparison evidence for both versions…'
      : 'Comparison evidence requires regeneration. Create a new comparison revision from both versions; the existing report is unchanged.'}
  </div>;
}