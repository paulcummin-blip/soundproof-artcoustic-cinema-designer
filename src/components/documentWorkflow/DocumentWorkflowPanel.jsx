/**
 * DocumentWorkflowPanel
 * ---------------------
 * The coordinated document workflow for v2 projects: three numbered steps
 * shown in the Room Designer header, replacing the standalone Project Report
 * and Speaker Design buttons.
 *
 *   1a — Create Technical Report
 *        Reuses the existing Project Report generation and export process.
 *        Automatically creates the matching Speaker Design PDF.
 *
 *   1b — Create Speaker Design PDF
 *        Can run independently. Reuses the existing ensureSpeakerDesignForVersion
 *        deduplicating authority.
 *
 *   2  — Create Client Proposal
 *        Available only when 1a and 1b have both completed and their PDFs are
 *        stored for the selected version. Opens the existing Proposal Centre.
 *
 * Each step shows one of: Not created, Generating, Ready, Failed, Outdated.
 * A document is Ready only when its stored file exists and can be accessed
 * after reload.
 *
 * For legacy projects, the existing header buttons are used instead (this
 * panel is not rendered).
 */
import React from 'react';
import { FileText, Speaker, Presentation, Check, Clock, AlertCircle, RefreshCw, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { REPORT_ROUTE } from '@/components/report/reportLibraryContext';
import { ensureSpeakerDesignForVersion } from '@/components/report/speakerDesign/ensureSpeakerDesignForVersion';
import { WORKFLOW_STATE, WORKFLOW_STATE_LABEL } from './documentWorkflowStatus';

function StepIcon({ state, icon: Icon }) {
  if (state === WORKFLOW_STATE.READY) return <Check className="w-3.5 h-3.5" style={{ color: '#2E7D4F' }} />;
  if (state === WORKFLOW_STATE.GENERATING) return <Clock className="w-3.5 h-3.5 animate-pulse" style={{ color: '#8A6D1F' }} />;
  if (state === WORKFLOW_STATE.FAILED) return <AlertCircle className="w-3.5 h-3.5" style={{ color: '#B23A3A' }} />;
  if (state === WORKFLOW_STATE.OUTDATED) return <AlertCircle className="w-3.5 h-3.5" style={{ color: '#B37A2B' }} />;
  return <Icon className="w-3.5 h-3.5" style={{ color: '#8B8378' }} />;
}

function stateBadgeClass(state) {
  switch (state) {
    case WORKFLOW_STATE.READY: return 'bg-[#E8F5EC] text-[#2E7D4F] border-[#C8E6D0]';
    case WORKFLOW_STATE.GENERATING: return 'bg-[#FFF8E1] text-[#8A6D1F] border-[#FFEAA7]';
    case WORKFLOW_STATE.FAILED: return 'bg-[#FDECEC] text-[#B23A3A] border-[#F5C8C8]';
    case WORKFLOW_STATE.OUTDATED: return 'bg-[#FFF3E0] text-[#B37A2B] border-[#FFE0B2]';
    default: return 'bg-[#F5F4F0] text-[#8B8378] border-[#E2DED7]';
  }
}

function WorkflowStep({ number, label, sublabel, state, stateLabel, reason, canAct, onAct, actLabel, icon }) {
  const badgeClass = stateBadgeClass(state);
  return (
    <div className="flex flex-col gap-1.5 min-w-[180px] flex-1">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold" style={{ background: '#213428', color: '#FFFFFF' }}>
          {number}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B1A1A]">{label}</span>
      </div>
      {sublabel && (
        <p className="text-[10px] text-[#8B8378] leading-snug">{sublabel}</p>
      )}
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${badgeClass}`} style={{ width: 'fit-content' }}>
        <StepIcon state={state} icon={icon} />
        {stateLabel}
      </div>
      {reason && state === WORKFLOW_STATE.FAILED && (
        <p className="text-[10px] text-[#B23A3A] leading-snug">{reason}</p>
      )}
      {canAct && (
        <Button
          size="sm"
          variant="outline"
          className="mt-0.5 h-7 px-2.5 text-[11px] font-medium border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]"
          onClick={onAct}
        >
          {actLabel}
          <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      )}
    </div>
  );
}

export default function DocumentWorkflowPanel({
  projectId,
  versionId,
  projectName,
  versionName,
  engineeringFingerprint,
  workflowStatus,
  disabled = false,
  onOpenReport,
}) {
  const { technicalReport, speakerDesign, proposalAvailable } = workflowStatus;

  const openReport = () => {
    if (disabled || !projectId || !versionId) return;
    if (onOpenReport) {
      onOpenReport();
    } else {
      const params = new URLSearchParams();
      params.set('projectId', projectId);
      if (versionId) params.set('versionId', versionId);
      window.location.assign(`${REPORT_ROUTE.VISUAL}?${params.toString()}`);
    }
  };

  const openProposalCentre = () => {
    if (!projectId) return;
    const params = new URLSearchParams();
    params.set('create', '1');
    if (versionId) params.set('versionId', versionId);
    window.location.assign(`/ProposalCentre?${params.toString()}`);
  };

  const createSpeakerDesign = () => {
    if (disabled || !projectId || !versionId) return;
    void ensureSpeakerDesignForVersion({
      projectId,
      versionId,
      engineeringFingerprint: engineeringFingerprint || null,
    });
  };

  const trState = technicalReport.state;
  const sdState = speakerDesign.state;

  return (
    <div className="flex items-stretch gap-4 px-3 py-2.5 rounded-lg border border-[#E2DED7] bg-[#FBFAF8]">
      <WorkflowStep
        number="1a"
        label="Technical Report"
        sublabel="Creates the Project Report and matching Speaker Design PDF"
        state={trState}
        stateLabel={WORKFLOW_STATE_LABEL[trState]}
        reason={technicalReport.reason}
        canAct={!disabled && (trState === WORKFLOW_STATE.NOT_CREATED || trState === WORKFLOW_STATE.OUTDATED || trState === WORKFLOW_STATE.FAILED)}
        actLabel={trState === WORKFLOW_STATE.OUTDATED ? 'Update' : 'Create'}
        icon={FileText}
        onAct={openReport}
      />
      <div className="w-px bg-[#E2DED7]" />
      <WorkflowStep
        number="1b"
        label="Speaker Design"
        sublabel="Can run independently. Reuses existing generation."
        state={sdState}
        stateLabel={WORKFLOW_STATE_LABEL[sdState]}
        reason={speakerDesign.reason}
        canAct={!disabled && (sdState === WORKFLOW_STATE.NOT_CREATED || sdState === WORKFLOW_STATE.OUTDATED || sdState === WORKFLOW_STATE.FAILED)}
        actLabel={sdState === WORKFLOW_STATE.OUTDATED ? 'Update' : 'Create'}
        icon={Speaker}
        onAct={createSpeakerDesign}
      />
      <div className="w-px bg-[#E2DED7]" />
      <WorkflowStep
        number="2"
        label="Client Proposal"
        sublabel={proposalAvailable ? 'Both documents are ready' : 'Available when 1a and 1b are ready'}
        state={proposalAvailable ? WORKFLOW_STATE.READY : WORKFLOW_STATE.NOT_CREATED}
        stateLabel={proposalAvailable ? 'Available' : 'Locked'}
        canAct={!disabled && proposalAvailable}
        actLabel="Open"
        icon={Presentation}
        onAct={openProposalCentre}
      />
    </div>
  );
}