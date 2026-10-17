/**
 * ProjectDocumentsStatus
 * ----------------------
 * The document-status card shown beside the version selection, before the
 * proposal continues.
 *
 * The designer only needs to know four things: which version this is about,
 * whether its documents are current, what to do when they are not, and when the
 * proposal can continue. The readiness machinery behind it stays hidden — every
 * value is read from the ONE readiness result the wizard already holds
 * (useProposalReadiness); nothing is recalculated, published or written here.
 *
 * ONE action, and it is the existing Project Report workflow: that workflow
 * already stores the version's Speaker Design beside the report, so there is no
 * second generation process and no second authority.
 *
 * Presentation only.
 */

import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { REPORT_FONT_HEADING, REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { withProposalContext } from '@/components/report/proposalReportContext';
import {
  READINESS_REPORT_LABEL,
  READINESS_STATE,
  buildProjectReportAction,
} from '@/components/proposal/sourceAuthority/proposalReadinessAuthority';
import { SPEAKER_DESIGN_LABEL } from '@/components/proposal/sourceAuthority/speakerDesignChecklistReadiness';

/** The card's own title. */
export const DOCUMENTS_STATUS_TITLE = 'Project documents';

/** The card's headlines, in the designer's own words. */
export const DOCUMENTS_HEADLINE = Object.freeze({
  UPDATE_REQUIRED: 'Update required',
  CURRENT: 'Documents current',
  UPDATING: 'Updating project documents…',
});

/** The one sentence a card that needs updating states. */
export const DOCUMENTS_UPDATE_LINE =
  'The design has changed since these documents were created. Update them before continuing.';

/** The one action's label. */
export const DOCUMENTS_UPDATE_ACTION_LABEL = 'Update project documents';

/**
 * One status word per readiness state. The internal vocabulary (stale,
 * incomplete, unavailable) never reaches the screen: a document is Current, it
 * needs updating, or it is being updated.
 */
const STATUS_TEXT = Object.freeze({
  [READINESS_STATE.CURRENT]: 'Current',
  [READINESS_STATE.STALE]: 'Update required',
  [READINESS_STATE.INCOMPLETE]: 'Update required',
  [READINESS_STATE.MISSING]: 'Update required',
  [READINESS_STATE.UNAVAILABLE]: 'Update required',
  [READINESS_STATE.CHECKING]: 'Updating…',
});

const isChecking = (cell) => cell?.checking === true;
const isCurrent = (cell) => cell?.current === true;
const isBehind = (cell) => !!cell && !cell.current && !cell.checking;

/** One quiet row: the document's name, its state, and a tick when it is current. */
function StatusRow({ label, cell, checking = false }) {
  const updating = checking || isChecking(cell);
  const done = !updating && isCurrent(cell);
  const text = updating
    ? STATUS_TEXT[READINESS_STATE.CHECKING]
    : (done ? STATUS_TEXT[READINESS_STATE.CURRENT] : STATUS_TEXT[READINESS_STATE.STALE]);

  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-[13px] text-[#3E4349]" style={{ fontFamily: REPORT_FONT_BODY }}>
        {label}
      </span>
      <span
        className="flex items-center gap-1.5 text-[12px]"
        style={{ fontFamily: REPORT_FONT_BODY, color: done ? '#213428' : '#625143' }}
      >
        {updating && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#8A8477' }} />}
        {done && <Check className="w-3.5 h-3.5" style={{ color: '#213428' }} />}
        {text}
      </span>
    </div>
  );
}

/** One selected version: its Project Report and the Speaker Design stored with it. */
function VersionBlock({ row, projectId, showVersionName, multiple }) {
  const project = row?.project || null;
  const speakerDesign = row?.speakerDesign || null;

  const projectBehind = isBehind(project);
  const actionState = projectBehind
    ? project.state
    : (isBehind(speakerDesign) ? speakerDesign.state : null);
  const action = actionState
    ? buildProjectReportAction({ state: actionState, projectId, versionId: row?.versionId })
    : null;

  return (
    <div className="py-1">
      {showVersionName && (
        <div
          className="text-[11px] uppercase tracking-[0.12em] text-[#A79E8C] pt-3"
          style={{ fontFamily: REPORT_FONT_BODY }}
        >
          {row?.versionName}
        </div>
      )}
      <StatusRow label={READINESS_REPORT_LABEL} cell={project} />
      <StatusRow label={SPEAKER_DESIGN_LABEL} cell={speakerDesign} />
      {action && (
        <a
          href={withProposalContext(action.url)}
          className="inline-block mt-3 px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
          style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
        >
          {multiple
            ? `${DOCUMENTS_UPDATE_ACTION_LABEL} — ${row?.versionName || ''}`.trim()
            : DOCUMENTS_UPDATE_ACTION_LABEL}
        </a>
      )}
    </div>
  );
}

export default function ProjectDocumentsStatus({ gate, projectId = null, className = '' }) {
  const rows = Array.isArray(gate?.rows) ? gate.rows : [];
  const checking = gate?.checking === true;

  // Nothing selected yet: the card states nothing.
  if (!checking && rows.length === 0) return null;

  const behind = rows.some((row) => isBehind(row.project) || isBehind(row.speakerDesign));
  const headline = checking
    ? DOCUMENTS_HEADLINE.UPDATING
    : (behind ? DOCUMENTS_HEADLINE.UPDATE_REQUIRED : DOCUMENTS_HEADLINE.CURRENT);
  const multiple = rows.length > 1;

  return (
    <section
      className={`mt-8 ${className}`}
      data-project-documents-status={checking ? 'updating' : (behind ? 'update_required' : 'current')}
    >
      <h3
        className="text-[11px] uppercase tracking-[0.18em] text-[#A79E8C] mb-2"
        style={{ fontFamily: REPORT_FONT_HEADING }}
      >
        {DOCUMENTS_STATUS_TITLE}
      </h3>

      <div className="bg-white px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-[#1B1A1A]" style={{ fontFamily: REPORT_FONT_BODY }}>
            {headline}
          </span>
          {checking && <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#8A8477' }} />}
        </div>

        {!checking && behind && (
          <p className="text-[13px] text-[#625143] leading-relaxed mt-2" style={{ fontFamily: REPORT_FONT_BODY }}>
            {DOCUMENTS_UPDATE_LINE}
          </p>
        )}

        <div className="mt-4">
          {rows.length > 0
            ? rows.map((row) => (
              <VersionBlock
                key={row.versionId}
                row={row}
                projectId={projectId}
                multiple={multiple}
                showVersionName={multiple}
              />
            ))
            : (
              <div className="py-1">
                <StatusRow label={READINESS_REPORT_LABEL} cell={null} checking />
                <StatusRow label={SPEAKER_DESIGN_LABEL} cell={null} checking />
              </div>
            )}
        </div>
      </div>
    </section>
  );
}