/**
 * AdiEditorialRejectionDiagnostics.jsx
 * ------------------------------------
 * "ADI EDITORIAL REJECTION DETAILS" — the compact read-back of a refused editorial
 * rewrite, for a master admin or in Engineering Mode.
 *
 * It exists because a refusal WRITES NOTHING. When ADI keeps the original wording,
 * the copy on screen, the section, the report snapshot and the editorial history are
 * all untouched — so the copy that was refused exists only in the response to the
 * button that asked for it. Dismissing the one-line notice would take the only copy
 * of it with it. This shows what the session was actually handed: the copy as it
 * stood, the copy that was refused, the stage that refused it, and each violation
 * with the values and the excerpts it was read from.
 *
 * It is the ADI refusal's counterpart to the Design Intent diagnostics block, and
 * it is deliberately out of the workflow: a compact panel, shown only to a master
 * admin or with Engineering Mode on, and only while a refusal is held. Nothing here
 * is ever shown to a dealer, nothing is printed in a document, nothing is retried
 * and nothing is written. A refused candidate is evidence to read, never copy to
 * publish.
 *
 * It is presentation only: it holds no rule, decides nothing, and reads exactly
 * what the backend returned.
 */

import React, { useState } from 'react';
import { Check, ChevronDown, Copy, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isMasterAdmin } from '@/lib/accountAccess';
import { useEngineeringMode } from '@/components/state/useEngineeringMode';
import {
  clearAdiEditorialRejection,
  useAdiEditorialRejection,
} from '@/components/adi/adiEditorialRejectionStore';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const BODY = 'Didact Gothic, sans-serif';
const SHOWN = 'Not recorded';

export const ADI_REJECTION_DIAGNOSTICS_TITLE = 'ADI editorial rejection details';

/** One field, stated by its own label, or stated as not recorded. */
function Field({ label, value }) {
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.7 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {value || SHOWN}
      </div>
    </div>
  );
}

/** The whole diagnostic as plain text, for pasting into a conversation. */
function asText(held) {
  const lines = [
    ADI_REJECTION_DIAGNOSTICS_TITLE,
    `Rejection stage: ${held.rejectionStage || SHOWN}`,
    '',
    'ORIGINAL COPY',
    held.originalText || SHOWN,
    '',
    'PROPOSED COPY',
    held.proposedText || 'Not returned',
  ];
  const violations = Array.isArray(held.violations) ? held.violations : [];
  violations.forEach((entry, index) => {
    lines.push('', `VIOLATION ${index + 1}`);
    lines.push(`  RULE: ${entry.rule || SHOWN}`);
    lines.push(`  CATEGORY: ${entry.category || SHOWN}`);
    lines.push(`  ORIGINAL VALUE: ${entry.originalValue || SHOWN}`);
    lines.push(`  PROPOSED VALUE: ${entry.proposedValue || SHOWN}`);
    lines.push(`  ORIGINAL EXCERPT: ${entry.originalExcerpt || SHOWN}`);
    lines.push(`  PROPOSED EXCERPT: ${entry.proposedExcerpt || SHOWN}`);
    lines.push(`  EXPLANATION: ${entry.explanation || SHOWN}`);
  });
  if (violations.length === 0) lines.push('', 'VIOLATIONS: none reported');
  return lines.join('\n');
}

export default function AdiEditorialRejectionDiagnostics() {
  const { user } = useAuth();
  const { engineeringMode } = useEngineeringMode();
  const held = useAdiEditorialRejection();
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState('idle');

  // Master admins and Engineering Mode only — and a session that was never handed a
  // refusal has nothing to read.
  const mayView = isMasterAdmin(user) || engineeringMode === true;
  if (!mayView || !held) return null;

  const violations = Array.isArray(held.violations) ? held.violations : [];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(asText(held));
      setCopyState('copied');
    } catch {
      setCopyState('unavailable');
    }
    setTimeout(() => setCopyState('idle'), 2400);
  };

  return (
    <div
      data-adi-editorial-rejection="true"
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 9998,
        maxWidth: 460,
        maxHeight: '70vh',
        overflow: 'auto',
        padding: '9px 12px',
        borderRadius: 7,
        border: '1px solid #3E4349',
        background: '#1B1A1A',
        color: '#F5F4F0',
        fontSize: 10,
        lineHeight: 1.45,
        boxShadow: '0 4px 16px rgba(0,0,0,0.30)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: 'none',
            padding: 0,
            color: '#A8C7A0',
            fontFamily: BODY,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <ChevronDown
            size={12}
            className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
          {ADI_REJECTION_DIAGNOSTICS_TITLE}
        </button>
        <button
          type="button"
          onClick={() => clearAdiEditorialRejection()}
          title="Clear this session's refusal"
          aria-label="Clear ADI editorial rejection details"
          style={{
            border: '1px solid #3E4349',
            background: '#25231F',
            color: '#F5F4F0',
            fontFamily: MONO,
            fontSize: 10,
            lineHeight: 1,
            padding: '2px 5px',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          <X size={10} />
        </button>
      </div>

      <div style={{ marginTop: 4, fontFamily: MONO }}>
        Stage: {held.rejectionStage || SHOWN} · Violations: {violations.length}
      </div>

      {expanded && (
        <div style={{ marginTop: 6 }}>
          <Field label="Original copy" value={held.originalText} />
          <Field label="Proposed copy" value={held.proposedText || 'Not returned'} />

          {violations.map((entry, index) => (
            <div
              key={`${entry.rule || 'violation'}-${index}`}
              data-adi-rejection-violation={entry.rule || 'unknown'}
              style={{ marginTop: 8, borderTop: '1px solid #3E4349', paddingTop: 4 }}
            >
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700 }}>
                {index + 1}. {entry.rule || SHOWN}
              </div>
              <Field label="Category" value={entry.category} />
              <Field label="Original value" value={entry.originalValue} />
              <Field label="Proposed value" value={entry.proposedValue} />
              <Field label="Original excerpt" value={entry.originalExcerpt} />
              <Field label="Proposed excerpt" value={entry.proposedExcerpt} />
              <Field label="Explanation" value={entry.explanation} />
            </div>
          ))}

          {violations.length === 0 && (
            <div style={{ marginTop: 6, fontFamily: MONO }}>
              The refusal carried no violation detail.
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                border: '1px solid #3E4349',
                borderRadius: 5,
                padding: '3px 7px',
                background: '#25231F',
                color: '#F5F4F0',
                fontFamily: BODY,
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              {copyState === 'copied' ? <Check size={10} /> : <Copy size={10} />}
              {copyState === 'copied' ? 'Copied' : 'Copy diagnostics'}
            </button>
            {copyState === 'unavailable' && (
              <span style={{ fontFamily: MONO, opacity: 0.8 }}>Clipboard unavailable.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}