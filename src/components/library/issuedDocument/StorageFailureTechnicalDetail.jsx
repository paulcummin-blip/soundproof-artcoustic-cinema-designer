/**
 * StorageFailureTechnicalDetail.jsx
 * ----------------------------------
 * "TECHNICAL DETAIL — PROJECT LIBRARY STORAGE", the expandable block that reads
 * one failed storage attempt back to a master admin: the operation, the code and
 * message the backend returned, how the rejection classifies, the project,
 * version and document it belonged to, the account id supplied and whether it is
 * the authenticated user's own, whether the private upload had already landed,
 * and whether the attempt was an initial attempt or a retry.
 *
 * Self-contained: it reads the session's authenticated user itself and renders
 * nothing at all for anyone who is not a master admin, so no caller can leak it.
 * It renders no private file path, no token and no secret — the diagnostic says
 * whether a path came back, never what it was.
 *
 * Presentation only. It never retries, stores, writes or changes anything, and
 * it is the same block in the failure notice and in the Project Library, so the
 * evidence of a failure that has been dismissed is still readable.
 */

import React, { useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import {
  PROJECT_LIBRARY_STORAGE_DETAIL_TITLE,
  buildStorageTechnicalDetail,
  canViewStorageTechnicalDetail,
  formatStorageDiagnosticsText,
} from './projectLibraryStorageDiagnostics';

/**
 * @param {Object} props
 * @param {Object} props.diagnostic the record written by the failed attempt.
 * @param {boolean} [props.defaultOpen] rendered already expanded.
 * @param {string} [props.className] spacing for the block's own place.
 */
export default function StorageFailureTechnicalDetail({ diagnostic = null, defaultOpen = false, className = '' }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(defaultOpen);
  const [copyState, setCopyState] = useState('idle');

  // Master admins only — and a block with no diagnostic has nothing to state.
  if (!canViewStorageTechnicalDetail(user) || !diagnostic) return null;

  const authAccountId = user?.access_context?.account?.id || user?.account_id || null;
  const authRole = user?.access_context?.membership_role || user?.role || null;
  const detail = buildStorageTechnicalDetail({ diagnostic, authAccountId, authRole });

  const handleCopy = async () => {
    const text = formatStorageDiagnosticsText({ diagnostic, detail, authAccountId, authRole });
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
    <div className={className} data-storage-technical-detail="true">
      {/* The panel animates on its own grid row and leaves the tab order with it. */}
      <style>{`
        .storage-detail__panel {
          display: grid; grid-template-rows: 0fr;
          transition: grid-template-rows 200ms ease;
        }
        .storage-detail__panel.is-expanded { grid-template-rows: 1fr; }
        .storage-detail__inner {
          min-height: 0; overflow: hidden;
          opacity: 0; visibility: hidden;
          transition: opacity 150ms ease, visibility 0s linear 200ms;
        }
        .storage-detail__panel.is-expanded .storage-detail__inner {
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
          {PROJECT_LIBRARY_STORAGE_DETAIL_TITLE}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 opacity-70 transition-transform duration-200 group-hover:opacity-100 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      <div className={`storage-detail__panel${expanded ? ' is-expanded' : ''}`}>
        <div className="storage-detail__inner">
          <dl className="grid gap-1.5 m-0 py-2">
            {detail.map((row) => (
              <div key={row.key} className="grid gap-0" data-storage-detail-row={row.key}>
                <dt
                  className="text-[9px] uppercase tracking-[0.1em] opacity-70"
                  style={{ fontFamily: REPORT_FONT_BODY }}
                >
                  {row.label}
                </dt>
                <dd className="m-0 text-[11px] font-mono leading-snug break-words">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="flex items-center gap-2 pb-1">
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