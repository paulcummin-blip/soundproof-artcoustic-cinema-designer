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
 * Each step shows one of: Ready to Create, Creating…, Created, Not Available,
 * Outdated, Failed. A document is Created only when its stored file exists
 * and can be accessed after reload.
 *
 * For legacy projects, the existing header buttons are used instead (this
 * panel is not rendered).
 */
import React from 'react';
import { FileText, Speaker, Presentation, Check, Clock, AlertCircle, RefreshCw, ChevronRight, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { REPORT_ROUTE } from '@/components/report/reportLibraryContext';
import { ensureSpeakerDesignForVersion } from '@/components/report/speakerDesign/ensureSpeakerDesignForVersion';
import { WORKFLOW_STATE, WORKFLOW_STEP, resolveStepDisplayLabel } from './documentWorkflowStatus';

function StepIcon({ state, icon: Icon, notAvailable = false }) {
  if (state === WORKFLOW_STATE.READY) return <Check className="w-3.5 h-3.5" style={{ color: '#2E7D4F' }} />;
  if (state === WORKFLOW_STATE.GENERATING) return <Clock className="w-3.5 h-3.5 animate-pulse" style={{ color: '#625143' }} />;
  if (state === WORKFLOW_STATE.FAILED) return <AlertCircle className="w-3.5 h-3.5" style={{ color: '#B23A3A' }} />;
  if (state === WORKFLOW_STATE.OUTDATED) return <AlertCircle className="w-3.5 h-3.5" style={{ color: '#B37A2B' }} />;
  return <Icon className="w-3.5 h-3.5" style={{ color: notAvailable ? '#A39A88' : '#1565C0' }} />;
}

function stateBadgeClass(state, notAvailable = false) {
  switch (state) {
    case WORKFLOW_STATE.READY: return 'bg-[#E8F5EC] text-[#2E7D4F] border-[#C8E6D0]';
    case WORKFLOW_STATE.GENERATING: return 'bg-[#F5F4F0] text-[#625143] border-[#E2DED7]';
    case WORKFLOW_STATE.FAILED: return 'bg-[#FDECEC] text-[#B23A3A] border-[#F5C8C8]';
    case WORKFLOW_STATE.OUTDATED: return 'bg-[#FFF3E0] text-[#B37A2B] border-[#FFE0B2]';
    case WORKFLOW_STATE.NOT_CREATED:
      return notAvailable
        ? 'bg-[#F5F4F0] text-[#A39A88] border-[#E8E5DF]'
        : 'bg-[#E3F2FD] text-[#1565C0] border-[#BBDEFB]';
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

/**
 * ProposalStep — Step 2 (Client Proposal).
 *
 * When 1a and 1b are Created but no proposal PDF exists, this renders as a
 * prominent "Create Client Proposal" card so the next action is obvious.
 *
 * When a proposal PDF already exists, it shows a green Created indicator with
 * an "Open Client Proposal" action and a secondary "New proposal" option.
 *
 * When 1a or 1b is missing, it shows "Not Available" with the missing
 * prerequisite named and no creation button.
 */
function ProposalStep({
  state,
  stateLabel,
  proposalAvailable,
  disabled,
  missingPrerequisites,
  onCreate,
  onOpen,
}) {
  const isReadyToCreate = state === WORKFLOW_STATE.NOT_CREATED && proposalAvailable;
  const isCreated = state === WORKFLOW_STATE.READY;
  const isUnavailable = state === WORKFLOW_STATE.NOT_CREATED && !proposalAvailable;
  const isOutdated = state === WORKFLOW_STATE.OUTDATED;
  const isFailed = state === WORKFLOW_STATE.FAILED;

  // Prominent "Ready to Create" — the obvious next action.
  if (isReadyToCreate) {
    return (
      <div className="rounded-lg border-2 px-4 py-3" style={{ borderColor: '#213428', background: '#FFFFFF' }}>
        <div className="flex items-start gap-3">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0 mt-0.5" style={{ background: '#213428', color: '#FFFFFF' }}>
            2
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold" style={{ color: '#213428', fontFamily: 'Didact Gothic, sans-serif' }}>
              Create Client Proposal
            </div>
            <p className="text-[11px] text-[#625143] mt-1 leading-snug">
              Your design documents are ready. Create the proposal to present to your client.
            </p>
            <button
              type="button"
              onClick={onCreate}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 mt-2.5 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#213428', color: '#FFFFFF' }}
            >
              Create Client Proposal
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const badgeClass = stateBadgeClass(state, isUnavailable);
  return (
    <div className="rounded-lg border border-[#E2DED7] bg-white px-3 py-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold" style={{ background: isCreated ? '#2E7D4F' : '#213428', color: '#FFFFFF' }}>
          2
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B1A1A]">Client Proposal</span>
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${badgeClass}`} style={{ width: 'fit-content' }}>
          <StepIcon state={state} icon={Presentation} notAvailable={isUnavailable} />
          {stateLabel}
        </div>
        <div className="flex-1" />
        {isCreated && (
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 px-2.5 text-[11px] font-medium border-0" style={{ background: '#213428', color: '#FFFFFF' }} onClick={onOpen}>
              Open Client Proposal
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] font-medium border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]" onClick={onCreate}>
              New proposal
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        )}
        {isOutdated && (
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] font-medium border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]" onClick={onOpen}>
            Open
            <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        )}
        {isFailed && (
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] font-medium border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]" onClick={onCreate}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        )}
      </div>
      {isUnavailable && missingPrerequisites.length > 0 && (
        <p className="text-[10px] text-[#A39A88] mt-1.5 leading-snug">
          Requires {missingPrerequisites.join(' and ')} to be created first.
        </p>
      )}
      {isCreated && (
        <p className="text-[10px] text-[#8B8378] mt-1 leading-snug">Stored PDF available in Project Assets.</p>
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
  const { technicalReport, speakerDesign, clientProposal, proposalAvailable } = workflowStatus;

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

  const openProposalWizard = () => {
    if (!projectId) return;
    const params = new URLSearchParams();
    params.set('create', '1');
    if (versionId) params.set('versionId', versionId);
    window.location.assign(`/ProposalCentre?${params.toString()}`);
  };

  const openProposalLibrary = () => {
    if (!projectId) return;
    const params = new URLSearchParams();
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
  const cpState = clientProposal?.state || WORKFLOW_STATE.NOT_CREATED;

  const missingPrerequisites = [];
  if (trState !== WORKFLOW_STATE.READY) missingPrerequisites.push('Technical Report');
  if (sdState !== WORKFLOW_STATE.READY) missingPrerequisites.push('Speaker Design');

  const trLabel = resolveStepDisplayLabel(WORKFLOW_STEP.TECHNICAL_REPORT, trState);
  const sdLabel = resolveStepDisplayLabel(WORKFLOW_STEP.SPEAKER_DESIGN, sdState);
  const cpLabel = resolveStepDisplayLabel(WORKFLOW_STEP.CLIENT_PROPOSAL, cpState, proposalAvailable);

  return (
    <div className="rounded-lg border border-[#E2DED7] bg-[#FBFAF8] px-3 py-2.5 space-y-2.5">
      <div className="flex items-stretch gap-4">
        <WorkflowStep
          number="1a"
          label="Technical Report"
          sublabel="Creates the Project Report and matching Speaker Design PDF"
          state={trState}
          stateLabel={trLabel}
          reason={technicalReport.reason}
          canAct={!disabled && (trState === WORKFLOW_STATE.NOT_CREATED || trState === WORKFLOW_STATE.OUTDATED || trState === WORKFLOW_STATE.FAILED)}
          actLabel={trState === WORKFLOW_STATE.OUTDATED ? 'Update' : trState === WORKFLOW_STATE.FAILED ? 'Retry' : 'Create'}
          icon={FileText}
          onAct={openReport}
        />
        <div className="w-px bg-[#E2DED7]" />
        <WorkflowStep
          number="1b"
          label="Speaker Design"
          sublabel="Can run independently. Reuses existing generation."
          state={sdState}
          stateLabel={sdLabel}
          reason={speakerDesign.reason}
          canAct={!disabled && (sdState === WORKFLOW_STATE.NOT_CREATED || sdState === WORKFLOW_STATE.OUTDATED || sdState === WORKFLOW_STATE.FAILED)}
          actLabel={sdState === WORKFLOW_STATE.OUTDATED ? 'Update' : sdState === WORKFLOW_STATE.FAILED ? 'Retry' : 'Create'}
          icon={Speaker}
          onAct={createSpeakerDesign}
        />
      </div>
      <ProposalStep
        state={cpState}
        stateLabel={cpLabel}
        proposalAvailable={proposalAvailable}
        disabled={disabled}
        missingPrerequisites={missingPrerequisites}
        onCreate={openProposalWizard}
        onOpen={openProposalLibrary}
      />
    </div>
  );
}