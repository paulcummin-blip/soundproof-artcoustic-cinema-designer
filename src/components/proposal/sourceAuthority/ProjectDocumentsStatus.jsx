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
 * Status wording is accurate per state:
 *   Current     → "Current"
 *   Missing     → "Not generated"
 *   Stale       → "Update required" (the Project Report update workflow)
 *   Incomplete  → "Incomplete"
 *   Unavailable → "Unavailable"
 *
 * "Update required" is reserved for genuinely stale documents — a missing
 * Speaker Design PDF never reads as "Update required".
 *
 * The Speaker Design checklist is non-blocking AND automatic: when the Project
 * Report is Current and the Speaker Design is missing or stale, the shared
 * authority prepares it in the background. The card states "Preparing
 * documents…" while that is underway, and a Retry appears only when a
 * generation genuinely failed. The designer never meets a manual Generate
 * button in the normal successful workflow.
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
import {
  SPEAKER_DESIGN_LABEL,
} from '@/components/proposal/sourceAuthority/speakerDesignChecklistReadiness';

/** The card's own title. */
export const DOCUMENTS_STATUS_TITLE = 'Project documents';

/** The card's headlines, in the designer's own words. */
export const DOCUMENTS_HEADLINE = Object.freeze({
  UPDATE_REQUIRED: 'Update required',
  CURRENT: 'Documents current',
  UPDATING: 'Updating project documents…',
  PREPARING: 'Preparing documents…',
  NOT_GENERATED: 'Documents not generated',
});

/** The one sentence a card that needs updating states. */
export const DOCUMENTS_UPDATE_LINE =
  'The design has changed since these documents were created. Update them before continuing.';

/** The one sentence a card preparing a Speaker Design states. */
export const DOCUMENTS_PREPARING_LINE =
  'Sound Proof is preparing the Speaker Design PDF for this version.';

/** The one sentence a card with a missing document states. */
export const DOCUMENTS_NOT_GENERATED_LINE =
  'The Project Report or Speaker Design for this version has not been generated yet. Create it before continuing.';

/** The one action's label for the Project Report update. */
export const DOCUMENTS_UPDATE_ACTION_LABEL = 'Update project documents';

/** The one action's label for retrying a failed Speaker Design generation. */
export const DOCUMENTS_RETRY_LABEL = 'Retry Speaker Design';

/**
 * One status word per readiness state. Each state states its own accurate
 * wording — "Update required" is reserved for a genuinely stale document, and a
 * missing document reads "Not generated".
 */
const STATUS_TEXT = Object.freeze({
  [READINESS_STATE.CURRENT]: 'Current',
  [READINESS_STATE.STALE]: 'Update required',
  [READINESS_STATE.INCOMPLETE]: 'Incomplete',
  [READINESS_STATE.MISSING]: 'Not generated',
  [READINESS_STATE.UNAVAILABLE]: 'Unavailable',
  [READINESS_STATE.CHECKING]: 'Updating…',
});

const isChecking = (cell) => cell?.checking === true;
const isCurrent = (cell) => cell?.current === true;
/** A cell that exists but is not current and not checking (stale, incomplete, unavailable). */
const isStale = (cell) => !!cell && !cell.current && !cell.checking && cell.state !== READINESS_STATE.MISSING;
/** A cell that has no stored document at all. */
const isMissing = (cell) => !!cell && cell.state === READINESS_STATE.MISSING;

/** One quiet row: the document's name, its state, and a tick when it is current. */
function StatusRow({ label, cell, checking = false }) {
  const updating = checking || isChecking(cell);
  const done = !updating && isCurrent(cell);
  const text = updating
    ? STATUS_TEXT[READINESS_STATE.CHECKING]
    : (done ? STATUS_TEXT[READINESS_STATE.CURRENT] : STATUS_TEXT[cell?.state] || STATUS_TEXT[READINESS_STATE.STALE]);

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
function VersionBlock({
  row,
  projectId,
  showVersionName,
  multiple,
  onGenerateSpeakerDesign,
  isGeneratingSpeakerDesign,
  preparingSpeakerDesign,
  speakerDesignError,
}) {
  const project = row?.project || null;
  const speakerDesign = row?.speakerDesign || null;

  const projectStale = isStale(project);
  const speakerDesignMissing = isMissing(speakerDesign);
  const speakerDesignStale = isStale(speakerDesign);

  // The Project Report action: only for a genuinely stale project report.
  const projectAction = projectStale
    ? buildProjectReportAction({ state: project.state, projectId, versionId: row?.versionId })
    : null;

  const projectCurrent = !!project?.current;
  const checklistNeedsAttention = projectCurrent && (speakerDesignMissing || speakerDesignStale);
  const preparing = !!preparingSpeakerDesign;
  const generating = !!isGeneratingSpeakerDesign;
  // The normal flow is automatic: the shared authority prepares the Speaker
  // Design, so the designer sees "Preparing documents…" — never a manual
  // Generate button. The Retry appears only when a generation genuinely failed.
  const showRetry = checklistNeedsAttention && !!speakerDesignError && !preparing;

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

      {/* Preparing the Speaker Design automatically while the report is Current. */}
      {checklistNeedsAttention && !showRetry && (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-[#625143]" style={{ fontFamily: REPORT_FONT_BODY }}>
          {preparing && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#8A8477' }} />}
          <span>{DOCUMENTS_PREPARING_LINE}</span>
        </div>
      )}

      {/* A failed Speaker Design generation: the specific reason and a Retry. */}
      {showRetry && (
        <div className="mt-3">
          <p className="text-[12px] text-[#7A2E10] mb-2" style={{ fontFamily: REPORT_FONT_BODY }}>
            {speakerDesignError}
          </p>
          <button
            type="button"
            disabled={generating}
            onClick={() => onGenerateSpeakerDesign?.(row?.versionId)}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-[11px] uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
          >
            {generating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {generating ? 'Retrying…' : DOCUMENTS_RETRY_LABEL}
          </button>
        </div>
      )}

      {/* A stale Project Report: the report update workflow, which stores the
          schedule with the report. */}
      {projectAction && (
        <a
          href={withProposalContext(projectAction.url)}
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

export default function ProjectDocumentsStatus({
  gate,
  projectId = null,
  className = '',
  onGenerateSpeakerDesign = null,
  generatingVersionIds = null,
  preparingVersionIds = null,
  speakerDesignErrors = null,
}) {
  const rows = Array.isArray(gate?.rows) ? gate.rows : [];
  const checking = gate?.checking === true;

  // Nothing selected yet: the card states nothing.
  if (!checking && rows.length === 0) return null;

  // "Update required" is reserved for genuinely stale documents — a missing
  // Speaker Design PDF never triggers the "Update required" headline.
  const genuinelyStale = rows.some(
    (row) => isStale(row.project) || isStale(row.speakerDesign),
  );
  const preparingAny = rows.some((row) => {
    const projectCurrent = !!row.project?.current;
    const checklistBlocked = isMissing(row.speakerDesign) || isStale(row.speakerDesign);
    return projectCurrent && checklistBlocked && !!preparingVersionIds?.has(row.versionId);
  });
  // "Documents current" is reserved for the case where EVERY required document
  // row is genuinely Current. A missing, stale, incomplete or unavailable row
  // — or one still being prepared — must never read as Current. This is the fix
  // for the summary that showed "Documents current" while both documents were
  // missing: the missing rows were not stale and not preparing, so they fell
  // through to the Current fallback.
  const allCurrent = rows.length > 0 && rows.every(
    (row) => isCurrent(row.project) && isCurrent(row.speakerDesign),
  );
  const anyMissing = rows.some(
    (row) => isMissing(row.project) || isMissing(row.speakerDesign),
  );

  const headline = checking
    ? DOCUMENTS_HEADLINE.UPDATING
    : (genuinelyStale ? DOCUMENTS_HEADLINE.UPDATE_REQUIRED
      : (preparingAny ? DOCUMENTS_HEADLINE.PREPARING
        : (allCurrent ? DOCUMENTS_HEADLINE.CURRENT
          : (anyMissing ? DOCUMENTS_HEADLINE.NOT_GENERATED : DOCUMENTS_HEADLINE.UPDATE_REQUIRED))));
  const multiple = rows.length > 1;

  return (
    <section
      className={`mt-8 ${className}`}
      data-project-documents-status={checking ? 'updating' : (genuinelyStale ? 'update_required' : (preparingAny ? 'preparing' : (allCurrent ? 'current' : (anyMissing ? 'not_generated' : 'update_required'))))}
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
          {(checking || preparingAny) && <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#8A8477' }} />}
        </div>

        {!checking && genuinelyStale && (
          <p className="text-[13px] text-[#625143] leading-relaxed mt-2" style={{ fontFamily: REPORT_FONT_BODY }}>
            {DOCUMENTS_UPDATE_LINE}
          </p>
        )}

        {!checking && !genuinelyStale && !allCurrent && anyMissing && (
          <p className="text-[13px] text-[#625143] leading-relaxed mt-2" style={{ fontFamily: REPORT_FONT_BODY }}>
            {DOCUMENTS_NOT_GENERATED_LINE}
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
                onGenerateSpeakerDesign={onGenerateSpeakerDesign}
                isGeneratingSpeakerDesign={generatingVersionIds?.has(row.versionId)}
                preparingSpeakerDesign={preparingVersionIds?.has(row.versionId)}
                speakerDesignError={speakerDesignErrors?.[row.versionId] || null}
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