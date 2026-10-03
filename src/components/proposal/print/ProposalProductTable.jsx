/**
 * ProposalProductTable
 * --------------------
 * The specified package as a designed table: what each speaker role is, and the
 * model chosen for it. Read from the frozen snapshot's product roles.
 */

import React from 'react';
import { proposalRoleStyle } from '@/components/proposal/typography/proposalTypography';

export default function ProposalProductTable({ rows = [], className = '' }) {
  const list = (rows || []).filter((row) => row && (row.role || row.model));
  if (list.length === 0) return null;

  return (
    <table className={`pp-table ${className}`.trim()}>
      <thead>
        <tr>
          <th style={{ ...proposalRoleStyle('label'), width: '55%' }}>Channel</th>
          <th style={{ ...proposalRoleStyle('label'), width: '45%' }}>Model</th>
        </tr>
      </thead>
      <tbody>
        {list.map((row, index) => (
          <tr key={`${row.role}:${row.model}:${index}`}>
            <td style={proposalRoleStyle('body')}>{row.role}</td>
            <td className="pp-table__strong" style={proposalRoleStyle('body')}>{row.model}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}