// WarningFlags.jsx
// ---------------
// The warning flags cell shared by the project tables. Flags are advisory: they
// explain why a value is missing rather than hiding it.

import React from 'react';
import { Pill } from './IntelligenceUi';

export default function WarningFlags({ warnings = [], limit = 3 }) {
  if (!warnings || warnings.length === 0) return <span style={{ color: '#9B9890' }}>—</span>;
  const shown = warnings.slice(0, limit);
  const extra = warnings.length - shown.length;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {shown.map((warning) => (
        <Pill key={warning} tone="warn">{warning}</Pill>
      ))}
      {extra > 0 && <Pill tone="neutral" title={warnings.slice(limit).join(', ')}>+{extra}</Pill>}
    </div>
  );
}