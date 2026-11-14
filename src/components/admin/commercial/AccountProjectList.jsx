/**
 * AccountProjectList.jsx
 * ---------------------
 * Expandable account row with a compact project table for the Commercial
 * Intelligence sector view. Each UK project shows mutually exclusive Won and
 * Lost checkboxes; International projects show "Not tracked".
 *
 * The outcome toggle is admin-only and calls back to the page, which writes
 * through the setProjectCommercialOutcome backend function.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { BRAND, Pill } from '@/components/admin/intelligence/IntelligenceUi';
import { formatGBPValue } from '@/lib/commercial/commercialDashboard/verifiedValue';
import { OUTCOME_LABELS } from '@/lib/commercial/commercialDashboard/commercialOutcome';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function OutcomeCheckbox({ label, checked, disabled, onChange, busy }) {
  return (
    <label style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      fontSize: 12,
      fontWeight: 600,
      color: checked ? '#1B1A1A' : BRAND.subtext,
    }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled || busy}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: '#213428' }}
      />
      {label}
    </label>
  );
}

function ProjectRow({ row, onToggleOutcome, outcomeBusy }) {
  const busy = outcomeBusy?.projectId === row.id;
  const isWon = row.outcome === 'won';
  const isLost = row.outcome === 'lost';

  return (
    <tr style={{ borderBottom: '1px solid #EFEEEA' }}>
      <td style={{ padding: '8px 10px' }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#1B1A1A' }}>{row.name}</div>
        {row.client && (
          <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 1 }}>Client: {row.client}</div>
        )}
        {row.reference && (
          <div style={{ fontSize: 11, color: BRAND.muted }}>Ref: {row.reference}</div>
        )}
      </td>
      <td style={{ padding: '8px 10px', fontSize: 12, color: BRAND.subtext, whiteSpace: 'nowrap' }}>
        {formatDate(row.createdAt)}
      </td>
      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1B1A1A' }}>{row.proposalCount}</span>
        {row.latestProposalAt && (
          <div style={{ fontSize: 10, color: BRAND.muted, marginTop: 1 }}>
            {formatDate(row.latestProposalAt)}
          </div>
        )}
      </td>
      <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600, color: row.verifiedAvailable ? '#213428' : BRAND.muted }}>
        {row.verifiedAvailable ? formatGBPValue(row.verifiedValue) : '—'}
        {!row.verifiedAvailable && row.proposalCount > 0 && (
          <div style={{ fontSize: 10, color: '#9A6A00', fontWeight: 500 }}>No verified value</div>
        )}
      </td>
      <td style={{ padding: '8px 10px' }}>
        {row.outcomeEligible ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <OutcomeCheckbox
              label="Won"
              checked={isWon}
              onChange={(checked) => onToggleOutcome(row.id, 'won', checked)}
              busy={busy}
            />
            <OutcomeCheckbox
              label="Lost"
              checked={isLost}
              onChange={(checked) => onToggleOutcome(row.id, 'lost', checked)}
              busy={busy}
            />
            {!isWon && !isLost && (
              <Pill tone="good" title="Default — counts towards the live pipeline">Live</Pill>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: BRAND.muted }}>Not tracked (non-UK)</span>
        )}
      </td>
    </tr>
  );
}

export default function AccountProjectList({ row, onToggleOutcome, outcomeBusy }) {
  const [expanded, setExpanded] = useState(false);
  const account = row.account;
  const accent = row.isUk ? '#213428' : '#3E4349';

  return (
    <div style={{ marginBottom: 8, border: `1px solid ${BRAND.border}`, borderRadius: 10, overflow: 'hidden', background: BRAND.card }}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          cursor: 'pointer',
          background: 'transparent',
          border: 'none',
          textAlign: 'left',
        }}
      >
        {expanded ? <ChevronDown size={16} color={BRAND.subtext} /> : <ChevronRight size={16} color={BRAND.subtext} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1B1A1A' }}>{account.name}</span>
            <span style={{ fontSize: 11, color: BRAND.muted, textTransform: 'capitalize' }}>
              {account.account_type || '—'}
            </span>
            {!row.isUk && <Pill tone="info">International</Pill>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, color: '#1B1A1A' }}>{row.projectCount}</div>
            <div style={{ fontSize: 10, color: BRAND.muted }}>projects</div>
          </div>
          {row.isUk && (
            <>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: '#2F5A44' }}>{row.liveCount}</div>
                <div style={{ fontSize: 10, color: BRAND.muted }}>live</div>
              </div>
              {(row.wonCount > 0 || row.lostCount > 0) && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, color: BRAND.accent }}>{row.wonCount}W · {row.lostCount}L</div>
                  <div style={{ fontSize: 10, color: BRAND.muted }}>outcomes</div>
                </div>
              )}
            </>
          )}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, color: '#213428' }}>{row.credits.available}</div>
            <div style={{ fontSize: 10, color: BRAND.muted }}>credits</div>
          </div>
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${BRAND.border}`, padding: '4px 0' }}>
          {row.projectRows.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13, color: BRAND.muted }}>No projects for this account.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#FAFAF8' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: BRAND.accent }}>Project</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: BRAND.accent }}>Created</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: BRAND.accent }}>Proposals</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: BRAND.accent }}>Verified value</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: BRAND.accent }}>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {row.projectRows.map((projectRow) => (
                  <ProjectRow
                    key={projectRow.id}
                    row={projectRow}
                    onToggleOutcome={onToggleOutcome}
                    outcomeBusy={outcomeBusy}
                  />
                ))}
              </tbody>
            </table>
          )}
          {row.isUk && row.projectRows.length > 0 && (
            <div style={{ padding: '8px 16px', fontSize: 11, color: BRAND.muted, borderTop: '1px solid #EFEEEA' }}>
              Verified pipeline value: <strong style={{ color: '#213428' }}>{formatGBPValue(row.monetaryPipelineValue)}</strong>
              {' '}· {row.monetaryPipelineProjectCount} project{row.monetaryPipelineProjectCount === 1 ? '' : 's'} with verified value
            </div>
          )}
        </div>
      )}
    </div>
  );
}