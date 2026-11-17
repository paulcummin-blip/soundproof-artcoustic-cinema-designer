/**
 * DocumentWorkflowPanel
 * ---------------------
 * The coordinated document workflow for v2 projects: three numbered steps
 * shown in the Room Designer header, replacing the standalone Project Report
 * and Speaker Design buttons.
 *
 * Compact layout (layout-only refinement — no logic change):
 *
 *   1a + 1b  — a two-column row. Each step is a single line: numbered badge,
 *              name, coloured status badge, and the relevant action (Create /
 *              Update / Retry) aligned to the right. Explanatory sublabel text
 *              is shown only while the document is NOT yet created, so a
 *              finished workflow collapses to one line per step.
 *   2         — a compact full-width row with its status badge and Open /
 *              New / Create / Retry actions aligned to the right.
 *   Images    — a compact row with the actual image count and Manage / Upload.
 *
 * Each step shows one of: Ready to Create, Creating…, Created, Not Available,
 * Outdated, Failed. A document is Created only when its stored file exists
 * and can be accessed after reload.
 *
 * For legacy projects, the existing header buttons are used instead (this
 * panel is not rendered).
 */
import React from 'react';
import { FileText, Speaker, Presentation, Check, Clock, AlertCircle, RefreshCw, ChevronRight, ArrowRight, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { REPORT_ROUTE } from '@/components/report/reportLibraryContext';
import { ensureSpeakerDesignForVersion } from '@/components/report/speakerDesign/ensureSpeakerDesignForVersion';
import { WORKFLOW_STATE, WORKFLOW_STEP, resolveStepDisplayLabel } from './documentWorkflowStatus';
import { useProjectImageCount } from './useProjectImageCount';

function StepIcon({ state, icon: Icon, notAvailable = false }) {
  if (state === WORKFLOW_STATE.READY) return <Check className="w-3 h-3" style={{ color: '#2E7D4F' }} />;
  if (state === WORKFLOW_STATE.GENERATING) return <Clock className="w-3 h-3 animate-pulse" style={{ color: '#625143' }} />;
  if (state === WORKFLOW_STATE.FAILED) return <AlertCircle className="w-3 h-3" style={{ color: '#B23A3A' }} />;
  if (state === WORKFLOW_STATE.OUTDATED) return <AlertCircle className="w-3 h-3" style={{ color: '#B37A2B' }} />;
  return <Icon className="w-3 h-3" style={{ color: notAvailable ? '#A39A88' : '#1565C0' }} />;
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
  // Explanatory text is only useful before the document exists: hide it once
  // the step is Created so a finished workflow collapses to a single line.
  const showSublabel = state !== WORKFLOW_STATE.READY && Boolean(sublabel);
  const notAvailable = state === WORKFLOW_STATE.NOT_CREATED && !canAct;
  return (
    <div className="rounded-lg border border-[#E2DED7] bg-white px-2.5 py-1.5 flex flex-col gap-0.5 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold shrink-0" style={{ background: state === WORKFLOW_STATE.READY ? '#2E7D4F' : '#213428', color: '#FFFFFF' }}>
          {number}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B1A1A] truncate">{label}</span>
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${badgeClass} shrink-0`}>
          <StepIcon state={state} icon={icon} notAvailable={notAvailable} />
          {stateLabel}
        </div>
        <div className="flex-1" />
        {canAct && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-[11px] font-medium border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7] shrink-0"
            onClick={onAct}
          >
            {state === WORKFLOW_STATE.FAILED && <RefreshCw className="w-3 h-3 mr-1" />}
            {actLabel}
            {state !== WORKFLOW_STATE.FAILED && <ChevronRight className="w-3 h-3 ml-1" />}
          </Button>
        )}
      </div>
      {showSublabel && (
        <p className="text-[10px] text-[#8B8378] leading-snug pl-5">{sublabel}</p>
      )}
      {reason && state === WORKFLOW_STATE.FAILED && (
        <p className="text-[10px] text-[#B23A3A] leading-snug pl-5">{reason}</p>
      )}
    </div>
  );
}

/**
 * ProposalStep — Step 2 (Client Proposal), always a compact full-width row.
 *
 * Status badge on the left with the step number and label; Open / New / Create
 * / Retry actions aligned to the right. A missing-prerequisites note is shown
 * only when the step is unavailable, so a created proposal collapses to one
 * line.
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

  const badgeClass = stateBadgeClass(state, isUnavailable);

  return (
    <div className="rounded-lg border border-[#E2DED7] bg-white px-2.5 py-1.5 flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold shrink-0" style={{ background: isCreated ? '#2E7D4F' : '#213428', color: '#FFFFFF' }}>
          2
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B1A1A]">Client Proposal</span>
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${badgeClass} shrink-0`}>
          <StepIcon state={state} icon={Presentation} notAvailable={isUnavailable} />
          {stateLabel}
        </div>
        <div className="flex-1" />
        {isReadyToCreate && (
          <Button
            size="sm"
            className="h-7 px-2.5 text-[11px] font-semibold border-0 shrink-0"
            style={{ background: '#213428', color: '#FFFFFF' }}
            onClick={onCreate}
            disabled={disabled}
          >
            Create Client Proposal
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        )}
        {isCreated && (
          <div className="flex items-center gap-2 shrink-0">
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
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] font-medium border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7] shrink-0" onClick={onOpen}>
            Open
            <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        )}
        {isFailed && (
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] font-medium border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7] shrink-0" onClick={onCreate}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Retry
          </Button>
        )}
      </div>
      {isUnavailable && missingPrerequisites.length > 0 && (
        <p className="text-[10px] text-[#A39A88] leading-snug pl-5">
          Requires {missingPrerequisites.join(' and ')} to be created first.
        </p>
      )}
    </div>
  );
}

/**
 * UploadedImagesStep — a compact row showing the project's uploaded image
 * count and a "Manage / Upload Images" action that opens the Project Library
 * Images tab for the current project. Not a document stage: image uploads are
 * never a prerequisite for creating reports or proposals.
 */
function UploadedImagesStep({ count, loading, onManage }) {
  const countText = loading
    ? 'Loading…'
    : count == null
      ? ''
      : count === 0
        ? 'No images uploaded yet'
        : count === 1
          ? '1 image'
          : `${count} images`;
  return (
    <div className="rounded-lg border border-[#E2DED7] bg-white px-2.5 py-1.5 flex items-center gap-1.5 min-w-0">
      <ImageIcon className="w-3.5 h-3.5 shrink-0" style={{ color: '#213428' }} />
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B1A1A]">Uploaded Images</span>
      {countText && (
        <span className="text-[11px] text-[#625143]">{countText}</span>
      )}
      <div className="flex-1" />
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2.5 text-[11px] font-medium border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7] shrink-0"
        onClick={onManage}
      >
        Manage / Upload Images
        <ChevronRight className="w-3 h-3 ml-1" />
      </Button>
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
  const { count: imageCount, loading: imageCountLoading } = useProjectImageCount(projectId);

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

  const openImageLibrary = () => {
    if (!projectId) return;
    window.location.assign('/ProjectProposalAssets?tab=images');
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

  const trCanAct = !disabled && (trState === WORKFLOW_STATE.NOT_CREATED || trState === WORKFLOW_STATE.OUTDATED || trState === WORKFLOW_STATE.FAILED);
  const sdCanAct = !disabled && (sdState === WORKFLOW_STATE.NOT_CREATED || sdState === WORKFLOW_STATE.OUTDATED || sdState === WORKFLOW_STATE.FAILED);

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        <WorkflowStep
          number="1a"
          label="Technical Report"
          sublabel="Creates the Project Report and matching Speaker Design PDF"
          state={trState}
          stateLabel={trLabel}
          reason={technicalReport.reason}
          canAct={trCanAct}
          actLabel={trState === WORKFLOW_STATE.OUTDATED ? 'Update' : trState === WORKFLOW_STATE.FAILED ? 'Retry' : 'Create'}
          icon={FileText}
          onAct={openReport}
        />
        <WorkflowStep
          number="1b"
          label="Speaker Design"
          sublabel="Can run independently. Reuses existing generation."
          state={sdState}
          stateLabel={sdLabel}
          reason={speakerDesign.reason}
          canAct={sdCanAct}
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
      <UploadedImagesStep
        count={imageCount}
        loading={imageCountLoading}
        onManage={openImageLibrary}
      />
    </div>
  );
}