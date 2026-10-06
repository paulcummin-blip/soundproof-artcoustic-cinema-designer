/**
 * LibraryProposalReadinessBanner
 * ------------------------------
 * The Project Library's answer to the designer's real question: can I go to
 * Proposal now?
 *
 * It sits above the version sections of the Generated Reports tab and states ONE
 * calm verdict in the dealer's words — ready, reports to update, or assessment
 * still to complete — with a single primary action and one secondary link to the
 * report list below. Where more than one report stands in the way it adds the
 * short per-version list, using the same words the report rows use.
 *
 * It derives nothing: the verdict and its words are supplied by the caller,
 * which reads them from the same authority the Proposal Centre uses. Reading
 * only — the banner never writes to a report.
 *
 * Presentation only: the actions are supplied by the caller.
 */

import React from 'react';
import { Check, Clock, FileText, Plus, Presentation, RefreshCw, Timer } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { LIBRARY_VERDICT } from './libraryProposalReadiness';

const TONE = {
  ready: { accent: '#213428', label: '#213428', border: '#D7DCD6' },
  pending: { accent: '#7A5A10', label: '#7A5A10', border: '#E4D9BF' },
  checking: { accent: '#8A8477', label: '#625143', border: '#E5E1D8' },
};

const VERDICT_ICON = {
  [LIBRARY_VERDICT.READY]: Check,
  [LIBRARY_VERDICT.UPDATES_NEEDED]: Clock,
  [LIBRARY_VERDICT.NOT_ASSESSED]: Timer,
};

const ACTION_ICON = {
  'create-proposal': Plus,
  'proposal-centre': Presentation,
  update: RefreshCw,
  generate: FileText,
  open: FileText,
  'view-reports': FileText,
  'room-designer': Timer,
};

const BUTTON_CLASS = 'flex items-center gap-2 px-6 py-3 text-xs uppercase tracking-[0.14em] transition-colors disabled:opacity-50';
const PRIMARY_CLASS = `${BUTTON_CLASS} text-white hover:bg-[#3E4349]`;
const SECONDARY_CLASS = `${BUTTON_CLASS} text-[#213428] border border-[#213428] hover:bg-white`;

function ChecklistEntry({ entry }) {
  const cells = entry.cells.filter((cell) => cell.status);
  if (cells.length === 0) return null;

  return (
    <li data-readiness-version={entry.versionId}>
      <div className="text-sm text-[#1B1A1A]" style={{ fontFamily: REPORT_FONT_BODY }}>
        {entry.versionName}
      </div>
      <ul className="mt-1 space-y-0.5">
        {cells.map((cell) => (
          <li
            key={cell.source}
            className="text-xs text-[#625143]"
            style={{ fontFamily: REPORT_FONT_BODY }}
          >
            {cell.label}: {cell.status}
          </li>
        ))}
      </ul>
    </li>
  );
}

export default function LibraryProposalReadinessBanner({
  readiness = null,
  onCreateProposal,
  onViewProposalCentre,
  onViewReports,
  onPrimaryAction,
}) {
  if (!readiness) return null;

  const {
    checking,
    ready,
    verdict,
    headline,
    detail,
    checklist = [],
    showChecklist,
    primaryAction,
    secondaryAction,
  } = readiness;

  const tone = TONE[checking ? 'checking' : ready ? 'ready' : 'pending'];
  const VerdictIcon = VERDICT_ICON[verdict] || Clock;
  const PrimaryIcon = ACTION_ICON[primaryAction?.kind] || null;
  const SecondaryIcon = ACTION_ICON[secondaryAction?.kind] || null;

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
    if (action.kind === 'view-reports') {
      onViewReports?.();
      return;
    }
    onPrimaryAction?.(action);
  };

  return (
    <section
      className="border bg-white px-6 py-6"
      style={{ borderColor: tone.border, borderLeftWidth: 4, borderLeftColor: tone.accent }}
      data-library-readiness={verdict}
    >
      <h2
        className="flex items-center gap-2 text-xl font-bold"
        style={{ fontFamily: REPORT_FONT_BODY, color: tone.label }}
      >
        <VerdictIcon className="w-5 h-5 shrink-0" />
        {headline || 'Proposal readiness'}
      </h2>

      {detail && (
        <p
          className="mt-2 text-sm text-[#625143] max-w-2xl leading-relaxed"
          style={{ fontFamily: REPORT_FONT_BODY }}
        >
          {detail}
        </p>
      )}

      {showChecklist && checklist.length > 0 && (
        <ul className="mt-5 space-y-4" data-readiness-checklist="true">
          {checklist.map((entry) => <ChecklistEntry key={entry.versionId} entry={entry} />)}
        </ul>
      )}

      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {primaryAction && (
            <button
              type="button"
              onClick={() => run(primaryAction)}
              className={PRIMARY_CLASS}
              style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
              data-readiness-action={primaryAction.kind}
            >
              {PrimaryIcon && <PrimaryIcon className="w-3.5 h-3.5" />}
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
              {SecondaryIcon && <SecondaryIcon className="w-3.5 h-3.5" />}
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </section>
  );
}