/**
 * LibraryProposalReadinessBanner
 * ------------------------------
 * The Project Library's answer to the designer's real question: can I go to
 * Proposal now?
 *
 * It sits above the version sections of the Generated Reports tab and states
 * ONE verdict — Ready for Proposal, or Not ready for Proposal with the exact
 * version and report that stands in the way — plus the one action that unblocks
 * it. Where several reports are not current it shows the short per-version
 * checklist instead of a sentence.
 *
 * It derives nothing: the verdict and its words are supplied by the caller,
 * which reads them from the same authority the Proposal Centre uses. Reading
 * only — the banner never writes to a report.
 *
 * Presentation only: the actions are supplied by the caller.
 */

import React from 'react';
import { AlertTriangle, Check, Plus, Presentation } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { LIBRARY_CHECKLIST_STATUS } from './libraryProposalReadiness';

const TONE = {
  ready: { accent: '#213428', label: '#213428', border: '#D7DCD6' },
  blocked: { accent: '#7A5A10', label: '#7A5A10', border: '#E4D9BF' },
  checking: { accent: '#8A8477', label: '#625143', border: '#E5E1D8' },
};

const PRIMARY_CLASS = 'flex items-center gap-2 px-6 py-3 text-xs uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349] disabled:opacity-50';
const SECONDARY_CLASS = 'flex items-center gap-2 px-6 py-3 text-xs uppercase tracking-[0.14em] text-[#213428] border border-[#213428] transition-colors hover:bg-white';

function ChecklistRow({ entry }) {
  return (
    <li data-readiness-version={entry.versionId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-sm text-[#1B1A1A]" style={{ fontFamily: REPORT_FONT_BODY }}>
        {entry.versionName}
      </span>
      <span className="text-xs text-[#625143]" style={{ fontFamily: REPORT_FONT_BODY }}>
        {entry.cells
          .filter((cell) => cell.status)
          .map((cell) => `${cell.label}: ${cell.status}`)
          .join(' · ')}
      </span>
    </li>
  );
}

export default function LibraryProposalReadinessBanner({
  readiness = null,
  onCreateProposal,
  onViewProposalCentre,
  onPrimaryAction,
}) {
  if (!readiness) return null;

  const { checking, ready, headline, detail, checklist = [], showChecklist, primaryAction, secondaryAction } = readiness;
  const tone = TONE[checking ? 'checking' : ready ? 'ready' : 'blocked'];

  /** Every offered action runs through the caller: the banner owns no route. */
  const run = (action) => {
    if (!action) return;
    if (action.kind === 'create-proposal') {
      onCreateProposal?.();
      return;
    }
    if (action.kind === 'proposal-centre') {
      onViewProposalCentre?.();
      return;
    }
    onPrimaryAction?.(action);
  };

  return (
    <section
      className="border bg-white px-6 py-5"
      style={{ borderColor: tone.border, borderLeftWidth: 4, borderLeftColor: tone.accent }}
      data-library-readiness={checking ? 'checking' : ready ? 'ready' : 'not-ready'}
    >
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          {headline && (
            <h2
              className="flex items-center gap-2 text-xl font-bold"
              style={{ fontFamily: REPORT_FONT_BODY, color: tone.label }}
            >
              {ready ? <Check className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
              {headline}
            </h2>
          )}
          {!headline && (
            <h2 className="text-xl font-bold text-[#625143]" style={{ fontFamily: REPORT_FONT_BODY }}>
              Proposal readiness
            </h2>
          )}

          {detail && (
            <p className="mt-2 text-sm text-[#625143] max-w-2xl leading-relaxed" style={{ fontFamily: REPORT_FONT_BODY }}>
              {detail}
            </p>
          )}

          {showChecklist && checklist.length > 0 && (
            <ul className="mt-4 space-y-2">
              {checklist.map((entry) => <ChecklistRow key={entry.versionId} entry={entry} />)}
            </ul>
          )}
        </div>

        {(primaryAction || secondaryAction) && (
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {primaryAction && (
              <button
                type="button"
                onClick={() => run(primaryAction)}
                className={ready ? PRIMARY_CLASS : SECONDARY_CLASS}
                style={ready
                  ? { backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }
                  : { fontFamily: REPORT_FONT_BODY }}
                data-readiness-action={primaryAction.kind}
              >
                {primaryAction.kind === 'create-proposal' && <Plus className="w-3.5 h-3.5" />}
                {primaryAction.label}
              </button>
            )}
            {secondaryAction && (
              <button
                type="button"
                onClick={() => run(secondaryAction)}
                className={SECONDARY_CLASS}
                style={{ fontFamily: REPORT_FONT_BODY }}
                data-readiness-action={secondaryAction.kind}
              >
                <Presentation className="w-3.5 h-3.5" />
                {secondaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}