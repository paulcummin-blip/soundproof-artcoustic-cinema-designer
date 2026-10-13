import React from 'react';
import { Loader2 } from 'lucide-react';
import {
  PREPARATION_ENGINEER_LABEL,
  PREPARATION_STATE,
  PREPARATION_TITLE,
} from './proposalPreparationAuthority';

/**
 * The one screen Sound Proof shows while it prepares a proposal.
 *
 * The designer sees a title, one progress line, and — only when something is
 * genuinely required — one message and one action. Fingerprints, publication
 * pointers, cache references and dependency lists never appear here: they belong
 * in Engineer details, which is collapsed and is never needed to continue.
 */
export default function ProposalPreparationPanel({ preparation, onRetryRead }) {
  const state = preparation?.state || PREPARATION_STATE.PREPARING;
  const working = state === PREPARATION_STATE.PREPARING;
  const action = preparation?.action || null;

  return (
    <div className="py-16 max-w-xl">
      <h2
        className="text-[26px] leading-none font-normal text-[#1B1A1A] tracking-tight mb-6"
        style={{ fontFamily: 'Didact Gothic, sans-serif' }}
      >
        {PREPARATION_TITLE}
      </h2>

      <div className="flex items-start gap-3 mb-6">
        {working && <Loader2 className="w-4 h-4 text-[#213428] animate-spin mt-0.5 shrink-0" />}
        <p className="text-sm text-[#625143] leading-relaxed">{preparation?.line}</p>
      </div>

      {action && (
        <div className="border border-[#E5E1D8] bg-white px-6 py-5 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {action.href ? (
              <a
                href={action.href}
                className="px-6 py-2.5 text-xs uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
                style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
              >
                {action.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={onRetryRead}
                className="px-6 py-2.5 text-xs uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
                style={{ backgroundColor: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}
              >
                {action.label}
              </button>
            )}
            {action.note && (
              <span className="text-xs text-[#8A8477] max-w-sm leading-relaxed">{action.note}</span>
            )}
          </div>
        </div>
      )}

      {preparation?.detail && (
        <details className="text-xs text-[#8A8477]">
          <summary className="cursor-pointer select-none uppercase tracking-[0.12em] text-[11px] text-[#A79E8C]">
            {PREPARATION_ENGINEER_LABEL}
          </summary>
          <pre className="mt-3 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[#625143]">
            {preparation.detail}
          </pre>
        </details>
      )}
    </div>
  );
}