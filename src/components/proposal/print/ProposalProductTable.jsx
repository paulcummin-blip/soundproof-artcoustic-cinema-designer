/**
 * ProposalProductTable
 * --------------------
 * The specified package as a designed table: what each speaker role is, and the
 * model chosen for it. Read from the frozen snapshot's product roles.
 */

import React from 'react';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';

/**
 * A stated physical count, or null when the row carries none.
 *
 * AN UNREAD COUNT IS NOT A ZERO. Number(null) is 0 and would print a false Qty 0
 * beside a real model, so a row that carries no count is read as carrying none and
 * leaves its cell empty; only a stated, positive count is printed.
 */
const statedQty = (row) => {
  const value = row?.qty;
  if (value === null || value === undefined || value === '') return null;
  const qty = Number(value);
  return Number.isFinite(qty) && qty > 0 ? qty : null;
};

export default function ProposalProductTable({ rows = [], compact = false, className = '' }) {
  const list = (rows || []).filter((row) => row && (row.role || row.model));
  if (list.length === 0) return null;

  // The Qty column states the physical loudspeakers at each position — the same
  // Position | Model | Qty the version's own equipment checklist prints. It is
  // shown whenever the rows state a count, and a row with no count of its own
  // leaves its cell empty rather than printing a figure that was never read.
  const showQty = list.some((row) => statedQty(row) !== null);

  return (
    <table className={`pp-table ${compact ? 'pp-table--compact' : ''} ${className}`.trim().replace(/\s+/g, ' ')}>
      <thead>
        <tr>
          <th style={{ ...proposalRoleStyle('label'), width: showQty ? '46%' : '42%' }}>Channel / Position</th>
          <th style={{ ...proposalRoleStyle('label'), width: showQty ? '44%' : '58%' }}>Model</th>
          {showQty ? (
            <th style={{ ...proposalRoleStyle('label'), width: '10%' }}>Qty</th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {list.map((row, index) => (
          <tr key={`${row.role}:${row.model}:${index}`}>
            <td style={proposalRoleStyle('body')}>{row.role}</td>
            <td className="pp-table__strong" style={proposalRoleStyle('body')}>{row.model}</td>
            {showQty ? (
              <td style={proposalRoleStyle('body')}>{statedQty(row) ?? ''}</td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}