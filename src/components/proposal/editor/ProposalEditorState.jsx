/**
 * ProposalEditorState
 * -------------------
 * The Proposal Editor's state card. It renders the state it is given
 * (proposalEditorStateAuthority) — it decides nothing itself, and it never
 * renders nothing: there is always a title, a reason where one exists, and a way
 * back to the Proposal Centre.
 *
 * Props:
 * - title, message, reason: the state's own wording
 * - showSpinner: a waiting state
 * - actions: { retry, regenerate, return }
 * - onRetry, onRegenerate, onReturn
 */

import React from 'react';
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import {
  REPORT_FONT_HEADING as FONT_HEADING,
  REPORT_FONT_BODY as FONT_BODY,
} from '@/components/report/typography/reportTypography';

const COLORS = {
  page: '#F5F4F0',
  card: '#FFFFFF',
  primary: '#213428',
  body: '#3E4349',
  secondary: '#625143',
  border: '#DCDBD6',
  muted: '#8A8477',
  failBg: '#F6E7E1',
  failBorder: '#E4C9BC',
  failText: '#8B4A2B',
};

const CARD = {
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 16,
  padding: '40px 36px',
  maxWidth: 560,
  margin: '0 auto',
  boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
};

const TITLE = {
  margin: 0,
  fontFamily: FONT_HEADING,
  fontSize: 20,
  fontWeight: 400,
  color: COLORS.primary,
  lineHeight: 1.25,
};

const TEXT = {
  margin: '14px 0 0',
  fontFamily: FONT_BODY,
  fontSize: 14,
  color: COLORS.secondary,
  lineHeight: 1.6,
};

const PRIMARY_BUTTON = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 18px',
  fontFamily: FONT_BODY,
  fontSize: 12,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#FFFFFF',
  backgroundColor: COLORS.primary,
  border: `1px solid ${COLORS.primary}`,
  borderRadius: 6,
  cursor: 'pointer',
};

const SECONDARY_BUTTON = {
  ...PRIMARY_BUTTON,
  color: COLORS.secondary,
  backgroundColor: '#F8F8F7',
  border: `1px solid ${COLORS.secondary}`,
};

export default function ProposalEditorState({
  title,
  message,
  reason = null,
  showSpinner = false,
  actions = { retry: false, regenerate: false, return: true },
  onRetry,
  onRegenerate,
  onReturn,
}) {
  const hasActions = actions.retry || actions.regenerate || actions.return;

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: COLORS.page }}>
      <div style={CARD} role="status" aria-live="polite">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {showSpinner ? (
            <Loader2 className="animate-spin" style={{ color: COLORS.secondary, width: 22, height: 22 }} />
          ) : (
            <AlertTriangle style={{ color: COLORS.failText, width: 22, height: 22 }} />
          )}
          <h2 style={TITLE}>{title}</h2>
        </div>

        <p style={TEXT}>{message}</p>

        {reason && (
          <div
            style={{
              marginTop: 16,
              background: COLORS.failBg,
              border: `1px solid ${COLORS.failBorder}`,
              borderRadius: 8,
              padding: '12px 16px',
              fontFamily: FONT_BODY,
              fontSize: 13,
              color: COLORS.failText,
              lineHeight: 1.55,
            }}
          >
            {reason}
          </div>
        )}

        {hasActions && (
          <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            {actions.regenerate && (
              <button type="button" onClick={onRegenerate} style={PRIMARY_BUTTON}>
                <Sparkles style={{ width: 15, height: 15 }} />
                Regenerate proposal
              </button>
            )}
            {actions.retry && (
              <button
                type="button"
                onClick={onRetry}
                style={actions.regenerate ? SECONDARY_BUTTON : PRIMARY_BUTTON}
              >
                <RefreshCw style={{ width: 15, height: 15 }} />
                Try again
              </button>
            )}
            {actions.return && (
              <button
                type="button"
                onClick={onReturn}
                style={actions.regenerate || actions.retry ? SECONDARY_BUTTON : PRIMARY_BUTTON}
              >
                <ArrowLeft style={{ width: 15, height: 15 }} />
                Back to Proposal Centre
              </button>
            )}
          </div>
        )}

        {showSpinner && (
          <p style={{ ...TEXT, fontSize: 12, color: COLORS.muted }}>
            If it cannot complete, a clear failure reason and recovery actions appear here.
          </p>
        )}
      </div>
    </div>
  );
}