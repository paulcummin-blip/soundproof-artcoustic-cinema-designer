/**
 * DocumentWorkflowPanel
 * ---------------------
 * The coordinated document workflow for v2 projects: three numbered steps
 * shown in the Room Designer header.
 *
 * Layout (visual hierarchy refinement — no logic change):
 *
 *   1a + 1b  — a two-column row of compact document cards. Each card carries
 *              its own status badge and a prominent Create / Update / Retry
 *              action sitting directly under the document it creates.
 *              Technical Report is the primary (solid dark-green) action;
 *              Speaker Design is the secondary (outlined dark-green) action.
 *   2         — a full-width card. Not Available until 1a and 1b are Created,
 *              then Create Client Proposal becomes the prominent action.
 *              Once Created, collapses to a compact status row with Open.
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
import { FileText, Speaker, Presentation, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { REPORT_ROUTE } from '@/components/report/reportLibraryContext';
import { ensureSpeakerDesignForVersion } from '@/components/report/speakerDesign/ensureSpeakerDesignForVersion';
import { WORKFLOW_STATE, WORKFLOW_STEP, resolveStepDisplayLabel, NOT_AVAILABLE_LABEL } from './documentWorkflowStatus';
import { useProjectImageCount } from './useProjectImageCount';
import DocumentCard from './DocumentCard';

/**
 * UploadedImagesRow — a compact row showing the project's uploaded image
 * count and a "Manage / Upload Images" action. Not a document stage.
 */
function UploadedImagesRow({ count, loading, onManage }) {
  const countText = loading
    ? 'Loading…'
    : count == null
      ? ''
      : count === 0
        ? 'No images yet'
        : count === 1
          ? '1 image'
          : `${count} images`;
  return (
    <div className="rounded-lg border border-[#E2DED7] bg-white px-3 py-2 flex items-center gap-2 min-w-0">
      <ImageIcon className="w-4 h-4 shrink-0" style={{ color: '#213428' }} />
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B1A1A]">Uploaded Images</span>
      {countText && (
        <span className="text-[11px] text-[#625143] truncate">{countText}</span>
      )}
      <div className="flex-1" />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 px-3 text-[11px] font-medium border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7] shrink-0"
        onClick={onManage}
      >
        Manage Images
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
  const cpCanAct = !disabled && proposalAvailable && (cpState === WORKFLOW_STATE.NOT_CREATED || cpState === WORKFLOW_STATE.OUTDATED || cpState === WORKFLOW_STATE.FAILED);

  const trActLabel = trState === WORKFLOW_STATE.OUTDATED ? 'Update Technical Report' : trState === WORKFLOW_STATE.FAILED ? 'Retry Technical Report' : 'Create Technical Report';
  const sdActLabel = sdState === WORKFLOW_STATE.OUTDATED ? 'Update Speaker Design' : sdState === WORKFLOW_STATE.FAILED ? 'Retry Speaker Design' : 'Create Speaker Design';
  const cpActLabel = cpState === WORKFLOW_STATE.OUTDATED ? 'Update Client Proposal' : cpState === WORKFLOW_STATE.FAILED ? 'Retry Client Proposal' : 'Create Client Proposal';

  const cpIsCreated = cpState === WORKFLOW_STATE.READY;
  const cpIsUnavailable = cpState === WORKFLOW_STATE.NOT_CREATED && !proposalAvailable;
  const cpReason = cpIsUnavailable && missingPrerequisites.length > 0
    ? `Available once the ${missingPrerequisites.join(' and ')} have been created.`
    : null;

  return (
    <div className="space-y-2.5 max-w-[760px]">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <DocumentCard
          number="1a"
          label="Technical Report"
          description="Creates the Project Report and matching Speaker Design PDF"
          icon={FileText}
          state={trState}
          stateLabel={trLabel}
          reason={technicalReport.reason}
          canAct={trCanAct}
          actLabel={trActLabel}
          onAct={openReport}
          onOpen={openReport}
          openLabel="Open"
          primary
        />
        <DocumentCard
          number="1b"
          label="Speaker Design"
          description="Can run independently. Reuses existing generation."
          icon={Speaker}
          state={sdState}
          stateLabel={sdLabel}
          reason={speakerDesign.reason}
          canAct={sdCanAct}
          actLabel={sdActLabel}
          onAct={createSpeakerDesign}
        />
      </div>

      <DocumentCard
        number="2"
        label="Client Proposal"
        icon={Presentation}
        state={cpState}
        stateLabel={cpLabel}
        reason={cpReason}
        canAct={cpCanAct}
        actLabel={cpActLabel}
        onAct={openProposalWizard}
        onOpen={openProposalLibrary}
        openLabel="Open Client Proposal"
        primary={proposalAvailable && !cpIsCreated}
        onSecondary={cpIsCreated ? openProposalWizard : null}
        secondaryLabel={cpIsCreated ? 'New proposal' : null}
      />

      <UploadedImagesRow
        count={imageCount}
        loading={imageCountLoading}
        onManage={openImageLibrary}
      />
    </div>
  );
}