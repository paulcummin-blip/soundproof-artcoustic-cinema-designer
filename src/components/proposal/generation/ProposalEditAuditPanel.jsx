/**
 * ProposalEditAuditPanel
 * ----------------------
 * The audit view of a proposal's generated copy: which generation it came from —
 * its version, status, writer, contract version and fingerprints — and every edit
 * saved against it, with its validation status, the person who saved it, when, and
 * the fingerprints the record was filed under.
 *
 * It renders the audit block the server resolved, and that block is returned only
 * to an authorised editor. It is never mounted on a client-facing page: a client
 * report shows the copy, never the machinery behind it.
 *
 * Props:
 * - audit: { generation, edits }
 */

import React from 'react';
import {
  REPORT_FONT_BODY as FONT_BODY,
  REPORT_FONT_HEADING as FONT_HEADING,
} from '@/components/report/typography/reportTypography';

const COLORS = {
  card: '#FFFFFF',
  border: '#DCDBD6',
  primary: '#213428',
  body: '#3E4349',
  muted: '#8A8477',
  ready: '#213428',
  review: '#8B4A2B',
};

const ROW_LABEL = {
  fontFamily: FONT_BODY,
  fontSize: 11,
  letterSpacing: '0.04em',
  color: COLORS.muted,
};

const short = (value, length = 14) => {
  const text = typeof value === 'string' ? value : '';
  if (text.length === 0) return '—';
  return text.length <= length ? text : `${text.slice(0, length)}…`;
};

const when = (value) => {
  if (!value) return '—';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : String(value);
};

export default function ProposalEditAuditPanel({ audit }) {
  if (!audit?.generation) {
    return (
      <div style={{ background: COLORS.card, borderTop: `1px solid ${COLORS.border}`, padding: '16px 24px' }}>
        <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: 13, color: COLORS.muted }}>
          No generation record yet: nothing has been written for this proposal.
        </p>
      </div>
    );
  }

  const generation = audit.generation;
  const rows = [
    ['Generation version', `v${generation.generation_number ?? '—'}`],
    ['Status', generation.status || '—'],
    ['Written', when(generation.created_at)],
    ['Written by', generation.created_by || '—'],
    ['Copy writer', [generation.provider, generation.model].filter(Boolean).join(' · ') || '—'],
    ['Contract', [generation.contract_version == null ? null : `v${generation.contract_version}`, generation.prompt_version].filter(Boolean).join(' · ') || '—'],
    ['Evidence pack', short(generation.evidence_pack_fingerprint)],
    ['Record fingerprint', short(generation.record_fingerprint)],
    ['Report snapshots', `${generation.visual_report_snapshot_ids?.length || 0} visual · ${generation.technical_report_snapshot_ids?.length || 0} technical`],
  ];

  return (
    <div style={{ background: COLORS.card, borderTop: `1px solid ${COLORS.border}`, padding: '20px 24px' }}>
      <h3 style={{ margin: 0, fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 400, color: COLORS.primary }}>
        Audit
      </h3>
      <p style={{ margin: '4px 0 12px', fontFamily: FONT_BODY, fontSize: 12, color: COLORS.muted }}>
        Visible to designers and admins only. It is never shown on a client-facing proposal.
      </p>

      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px 18px', margin: 0 }}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt style={ROW_LABEL}>{label}</dt>
            <dd style={{ margin: '2px 0 0', fontFamily: FONT_BODY, fontSize: 13, color: COLORS.body, wordBreak: 'break-all' }}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <h4 style={{ margin: '18px 0 6px', fontFamily: FONT_HEADING, fontSize: 13, fontWeight: 400, color: COLORS.primary }}>
        Edit history
      </h4>

      {audit.edits.length === 0 ? (
        <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: 13, color: COLORS.muted }}>
          No edits saved. The generated copy is unchanged.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT_BODY, fontSize: 12 }}>
            <thead>
              <tr>
                {['#', 'How', 'Validation', 'Editor', 'Saved', 'Restores', 'Fingerprint'].map((heading) => (
                  <th key={heading} style={{ ...ROW_LABEL, textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${COLORS.border}` }}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {audit.edits.map((edit) => (
                <tr key={edit.edit_id}>
                  <td style={{ padding: '6px 8px', color: COLORS.body }}>{edit.edit_number ?? '—'}</td>
                  <td style={{ padding: '6px 8px', color: COLORS.body }}>{edit.source}</td>
                  <td style={{ padding: '6px 8px', color: edit.valid ? COLORS.ready : COLORS.review, fontWeight: 600 }}>
                    {edit.status}
                  </td>
                  <td style={{ padding: '6px 8px', color: COLORS.body }}>{edit.editor || '—'}</td>
                  <td style={{ padding: '6px 8px', color: COLORS.body }}>{when(edit.edited_at)}</td>
                  <td style={{ padding: '6px 8px', color: COLORS.body }}>{edit.restore_of ? short(edit.restore_of, 10) : '—'}</td>
                  <td style={{ padding: '6px 8px', color: COLORS.muted }}>{short(edit.edit_fingerprint, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}