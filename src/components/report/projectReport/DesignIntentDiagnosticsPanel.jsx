/**
 * DesignIntentDiagnosticsPanel.jsx
 * --------------------------------
 * "TECHNICAL DETAIL — ASTRA DESIGN INTENT", the expandable block that reads one
 * REFUSED Design Intent attempt back to a master admin: why it was refused, each
 * violation the validation reported, the offending sentence or clause, the claim
 * ID it cited as its evidence, the exact validation response, and the draft the
 * writer returned.
 *
 * Self-contained: it reads the session's authenticated user itself and renders
 * nothing at all for anyone who is not a master admin, so no caller can leak it.
 * It reads the diagnostic held for THIS report in the current session, so the
 * detail survives the refusal notice being dismissed and is the same block
 * wherever it is placed.
 *
 * Screen only, and presentation only: it is never part of the printed document,
 * it never retries, and it never writes a narrative, a design value or a report.
 * A refused draft is evidence to read, never copy to publish.
 */

import React, { useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import {
  DESIGN_INTENT_DIAGNOSTICS_TITLE,
  buildDesignIntentDiagnosticRows,
  canViewDesignIntentDiagnostics,
  designIntentDiagnosticViolations,
  designIntentDraftText,
  formatDesignIntentDiagnosticsText,
} from '@/components/report/projectReport/designIntentDiagnostics';
import { useDesignIntentDiagnostics } from '@/components/report/projectReport/designIntentDiagnosticStore';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const INK = '#625143';

/** One violation, as the validation reported it. */
function ViolationBlock({ entry }) {
  const field = (label, value) => (value ? (
    <div className="grid gap-0">
      <dt className="text-[9px] uppercase tracking-[0.1em] opacity-70" style={{ fontFamily: REPORT_FONT_BODY }}>
        {label}
      </dt>
      <dd className="m-0 text-[11px] leading-snug break-words" style={{ fontFamily: MONO }}>
        {value}
      </dd>
    </div>
  ) : null);

  return (
    <div className="mt-2 border-t border-black/10 pt-2" data-design-intent-violation={entry.code}>
      <div className="text-[11px] font-semibold" style={{ fontFamily: MONO }}>
        #{entry.index + 1} · {entry.code}
        {entry.section ? ` · section ${entry.section}` : ''}
      </div>
      <dl className="grid gap-1.5 m-0 py-1">
        {field('Validator rule', entry.rule_id && entry.rule_id !== entry.code ? entry.rule_id : null)}
        {field('Explanation', entry.detail)}
        {field('Offending sentence', entry.sentence)}
        {field('Offending clause', entry.clause)}
        {field('Matched text', entry.matched_substring)}
        {field('Span in section text', entry.span)}
        {field(
          'Evidence reference (cited claim IDs)',
          entry.cited_claim_ids.length > 0 ? entry.cited_claim_ids.join(', ') : null,
        )}
        {field('Blocked claim', entry.blocked_claim_id)}
      </dl>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {string} [props.projectId]
 * @param {string} [props.versionId]
 * @param {boolean} [props.defaultOpen] rendered already expanded.
 * @param {string} [props.className] spacing for the block's own place.
 */
export default function DesignIntentDiagnosticsPanel({
  projectId = null,
  versionId = null,
  defaultOpen = false,
  className = '',
}) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(defaultOpen);
  const [copyState, setCopyState] = useState('idle');
  const diagnostics = useDesignIntentDiagnostics(projectId, versionId);

  // Master admins only — and an attempt that was never refused has nothing to read.
  if (!canViewDesignIntentDiagnostics(user) || !diagnostics) return null;

  const rows = buildDesignIntentDiagnosticRows(diagnostics);
  const violations = designIntentDiagnosticViolations(diagnostics);
  const draft = designIntentDraftText(diagnostics);

  const handleCopy = async () => {
    const text = formatDesignIntentDiagnosticsText(diagnostics);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      // A browser that refuses the clipboard is said to refuse it, not ignored.
      setCopyState('unavailable');
    }
    setTimeout(() => setCopyState('idle'), 2400);
  };

  return (
    <div className={className} style={{ color: INK }} data-design-intent-diagnostics="true">
      {/* The panel animates on its own grid row and leaves the tab order with it. */}
      <style>{`
        .intent-detail__panel {
          display: grid; grid-template-rows: 0fr;
          transition: grid-template-rows 200ms ease;
        }
        .intent-detail__panel.is-expanded { grid-template-rows: 1fr; }
        .intent-detail__inner {
          min-height: 0; overflow: hidden;
          opacity: 0; visibility: hidden;
          transition: opacity 150ms ease, visibility 0s linear 200ms;
        }
        .intent-detail__panel.is-expanded .intent-detail__inner {
          opacity: 1; visibility: visible;
          transition: opacity 180ms ease 50ms, visibility 0s;
        }
      `}</style>

      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        className="group flex w-full items-center justify-between gap-3 text-left border-t border-current pt-2 pb-1"
      >
        <span
          className="text-[10px] uppercase tracking-[0.14em] opacity-80 transition-opacity group-hover:opacity-100"
          style={{ fontFamily: REPORT_FONT_BODY }}
        >
          {DESIGN_INTENT_DIAGNOSTICS_TITLE}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 opacity-70 transition-transform duration-200 group-hover:opacity-100 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      <div className={`intent-detail__panel${expanded ? ' is-expanded' : ''}`}>
        <div className="intent-detail__inner">
          <dl className="grid gap-1.5 m-0 py-2" style={{ maxWidth: 720 }}>
            {rows.map((row) => (
              <div key={row.key} className="grid gap-0" data-design-intent-detail-row={row.key}>
                <dt
                  className="text-[9px] uppercase tracking-[0.1em] opacity-70"
                  style={{ fontFamily: REPORT_FONT_BODY }}
                >
                  {row.label}
                </dt>
                <dd className="m-0 text-[11px] leading-snug break-words" style={{ fontFamily: MONO }}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <div style={{ maxWidth: 720 }}>
            {violations.map((entry) => <ViolationBlock key={entry.key} entry={entry} />)}
          </div>

          <div className="mt-3" style={{ maxWidth: 720 }}>
            <div
              className="text-[9px] uppercase tracking-[0.1em] opacity-70"
              style={{ fontFamily: REPORT_FONT_BODY }}
            >
              Draft refused by the validator
            </div>
            <pre
              className="mt-1 mb-0 p-2 rounded border border-black/10 bg-black/[0.03] text-[10px] leading-snug whitespace-pre-wrap break-words max-h-72 overflow-auto"
              style={{ fontFamily: MONO }}
              data-design-intent-draft="true"
            >
              {draft || 'The draft was not returned.'}
            </pre>
          </div>

          <div className="flex items-center gap-2 py-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 border border-current rounded px-2 py-1 text-[11px] hover:bg-black/10"
              style={{ fontFamily: REPORT_FONT_BODY }}
            >
              {copyState === 'copied'
                ? <Check className="w-3 h-3" />
                : <Copy className="w-3 h-3" />}
              {copyState === 'copied' ? 'Copied' : 'Copy diagnostics'}
            </button>
            {copyState === 'unavailable' && (
              <span className="text-[10px] opacity-80">Clipboard unavailable in this browser.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}