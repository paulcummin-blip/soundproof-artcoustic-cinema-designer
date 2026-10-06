/**
 * ProposalEditStatusBanner
 * ------------------------
 * The state of a proposal's generated copy, in the designer's words: what was
 * written, what copy is being shown, whether it is ready to issue, and — when it
 * is not — every reason in plain language.
 *
 * It renders the model the server resolved and decides nothing: no rule, no
 * validation and no gate is evaluated here.
 *
 * Props:
 * - layer: the resolved copy layer
 * - children: the actions row the panel supplies
 */

import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import {
  REPORT_FONT_BODY as FONT_BODY,
  REPORT_FONT_HEADING as FONT_HEADING,
} from '@/components/report/typography/reportTypography';

const TONE = {
  ready: { bg: '#EDF3EC', border: '#C6D6C4', text: '#213428', icon: CheckCircle2 },
  review: { bg: '#F6E7E1', border: '#E4C9BC', text: '#8B4A2B', icon: AlertTriangle },
  legacy: { bg: '#F5F4F0', border: '#DCDBD6', text: '#625143', icon: Info },
};

const SOURCE_LABEL = {
  generated: 'Original generated copy',
  edit: 'Your edited copy',
};

const TITLE = {
  margin: 0,
  fontFamily: FONT_HEADING,
  fontSize: 15,
  fontWeight: 400,
};

const TEXT = {
  margin: '6px 0 0',
  fontFamily: FONT_BODY,
  fontSize: 13,
  lineHeight: 1.55,
};

export default function ProposalEditStatusBanner({ layer, children = null }) {
  if (!layer) return null;

  const tone = layer.legacy ? 'legacy' : (layer.ready ? 'ready' : 'review');
  const palette = TONE[tone];
  const Icon = palette.icon;

  return (
    <section
      aria-label="Proposal copy status"
      style={{
        background: palette.bg,
        borderBottom: `1px solid ${palette.border}`,
        padding: '12px 24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Icon style={{ color: palette.text, width: 16, height: 16, marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ ...TITLE, color: palette.text }}>
            {layer.legacy ? layer.title : (layer.status_label || layer.title)}
            {!layer.legacy && layer.copy?.source && (
              <span style={{ ...TEXT, marginLeft: 10, color: palette.text, opacity: 0.85 }}>
                {SOURCE_LABEL[layer.copy.source] || layer.copy.source}
              </span>
            )}
          </p>

          {layer.message && <p style={{ ...TEXT, color: palette.text }}>{layer.message}</p>}

          {layer.export_blocked_reason && !layer.legacy && (
            <p style={{ ...TEXT, color: palette.text, fontWeight: 600 }}>{layer.export_blocked_reason}</p>
          )}

          {layer.blocked_issues?.length > 0 && (
            <ul style={{ ...TEXT, color: palette.text, margin: '8px 0 0', paddingLeft: 18 }}>
              {layer.blocked_issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          )}

          {layer.failures?.length > 0 && (
            <ul style={{ ...TEXT, color: palette.text, margin: '8px 0 0', paddingLeft: 18 }}>
              {layer.failures.slice(0, 3).map((failure) => (
                <li key={failure.generation_id}>
                  {`Attempt v${failure.generation_number ?? '—'}: ${failure.sentence}`}
                </li>
              ))}
            </ul>
          )}

          {children}
        </div>
      </div>
    </section>
  );
}