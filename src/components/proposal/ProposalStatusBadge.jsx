import React from 'react';
import { getStatusConfig } from './proposalLifecycle';

/**
 * Lifecycle status badge for proposals.
 * Shows a coloured pill with a dot indicator.
 *
 * Props:
 * - status: raw Proposal.status string
 * - size: 'sm' | 'md' (default 'sm')
 */
export default function ProposalStatusBadge({ status, size = 'sm' }) {
  const config = getStatusConfig(status);
  const padding = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-[11px]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${padding} ${config.badgeClass}`}
      style={{ fontFamily: 'Inter, sans-serif', letterSpacing: '0.02em' }}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      {config.label}
    </span>
  );
}