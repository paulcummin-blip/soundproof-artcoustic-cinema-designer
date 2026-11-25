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
import { openIssuedDocument } from '@/components/library/issuedDocument/issuedDocumentActions';
import { REPORT_AUTOPRINT_PARAM, REPORT_UPDATE_PARAM, REPORT_AUTOSTORE_PARAM, REPORT_REGENERATE_INTENT_PARAM } from '@/components/report/reportActionIntent';
import { useDesignContextReview } from '@/components/adi/designContext/useDesignContextReview';
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
  onRetryVerification = null,
  disabled = false,
  onOpenReport,
}) {
  const { technicalReport, speakerDesign, clientProposal, proposalAvailable } = workflowStatus;
  const { count: imageCount, loading: imageCountLoading } = useProjectImageCount(projectId);

  const openStoredPdf = async (record) => {
    if (!record) return;
    try {
      await openIssuedDocument(record);
    } catch (error) {
      console.error('[DocumentWorkflowPanel] Open stored PDF failed:', error);
      alert(error?.message || 'This document could not be opened.');
    }
  };

  // Pre-generation Design Context review. The review discovers questions and
  // presents them before the report is generated, so the designer's
  // explanations reach the Design Intent writer. The dialog is rendered at the
  // end of this panel.
  const contextReview = useDesignContextReview({ projectId, versionId });

  const navigateToReportRenderer = (options = {}) => {
    if (disabled || !projectId || !versionId) return;
    const params = new URLSearchParams();
    params.set('projectId', projectId);
    if (versionId) params.set('versionId', versionId);
    if (options.updateReport) params.set(REPORT_UPDATE_PARAM, '1');
    if (options.autoPrint) params.set(REPORT_AUTOPRINT_PARAM, '1');
    if (options.autoStore) params.set(REPORT_AUTOSTORE_PARAM, '1');
    if (options.regenerateIntent) params.set(REPORT_REGENERATE_INTENT_PARAM, '1');
    if (options.contextRevision) params.set('ctxRev', options.contextRevision);
    // Carry temporary skip exclusions from this panel's review so the report
    // page does not re-ask skipped questions and excludes their previously
    // saved answers from this generation only.
    if (Array.isArray(options.skipQuestionIds) && options.skipQuestionIds.length > 0) {
      params.set('skipCtx', options.skipQuestionIds.join(','));
    }
    window.location.assign(`${REPORT_ROUTE.VISUAL}?${params.toString()}`);
  };

  const handleTechnicalReportAct = async () => {
    // Run the Design Context review before navigating. The designer may
    // answer, skip, or cancel. Cancellation stops the action entirely so no
    // report is generated or stored without the designer's involvement.
    const proceed = await contextReview.review();
    if (!proceed) return;
    navigateToReportRenderer({
      // Create / Create New / Retry are explicit generation requests, even
      // when deleting the issued PDF left an older ReportSnapshot behind.
      // Read current published evidence through the existing update flow.
      // Opening an issued PDF remains the separate openStoredPdf action.
      updateReport: true,
      autoStore: true,
      regenerateIntent: true,
      skipQuestionIds: proceed.skippedQuestionIds || contextReview.getSkippedQuestionIds(),
      contextRevision: proceed.contextRevision || contextReview.getConfirmedRevision(),
    });
  };

  const handleSpeakerDesignAct = () => {
    if (disabled || !projectId || !versionId) return;
    void ensureSpeakerDesignForVersion({
      projectId,
      versionId,
      engineeringFingerprint: engineeringFingerprint || null,
    });
  };

  const handleClientProposalAct = () => {
    if (!projectId) return;
    const params = new URLSearchParams();
    params.set('create', '1');
    params.set('projectId', projectId);
    if (versionId) params.set('versionId', versionId);
    window.location.assign(`/ProposalCentre?${params.toString()}`);
  };

  const openProposalCentre = () => {
    if (!projectId) return;
    const params = new URLSearchParams();
    if (versionId) params.set('versionId', versionId);
    window.location.assign(`/ProposalCentre?${params.toString()}`);
  };

  const openImageLibrary = () => {
    if (!projectId) return;
    window.location.assign('/ProjectProposalAssets?tab=images');
  };

  const trState = technicalReport.state;
  const sdState = speakerDesign.state;
  const cpState = clientProposal?.state || WORKFLOW_STATE.NOT_CREATED;

  const missingPrerequisites = [];
  if (trState !== WORKFLOW_STATE.READY) missingPrerequisites.push('Technical Report');
  if (sdState !== WORKFLOW_STATE.READY) missingPrerequisites.push('Speaker Design');

  // Verification unavailable: the stored document exists but its source could
  // not be compared to the current design (a frozen publication is missing).
  // It is distinct from Outdated (a material change was established) and offers
  // a Retry that re-runs verification WITHOUT regenerating the document.
  const VERIFICATION_UNAVAILABLE_COPY =
    'Source could not be verified. Retry to re-check without regenerating.';
  const trDisplayReason = trState === WORKFLOW_STATE.OUTDATED
    ? technicalReport.freshnessReason
    : trState === WORKFLOW_STATE.VERIFICATION_UNAVAILABLE
      ? VERIFICATION_UNAVAILABLE_COPY
      : technicalReport.reason;
  const sdDisplayReason = sdState === WORKFLOW_STATE.OUTDATED
    ? speakerDesign.freshnessReason
    : sdState === WORKFLOW_STATE.VERIFICATION_UNAVAILABLE
      ? VERIFICATION_UNAVAILABLE_COPY
      : speakerDesign.reason;

  const trLabel = resolveStepDisplayLabel(WORKFLOW_STEP.TECHNICAL_REPORT, trState);
  const sdLabel = resolveStepDisplayLabel(WORKFLOW_STEP.SPEAKER_DESIGN, sdState);
  const cpLabel = resolveStepDisplayLabel(WORKFLOW_STEP.CLIENT_PROPOSAL, cpState, proposalAvailable);

  const trIsVerificationUnavailable = trState === WORKFLOW_STATE.VERIFICATION_UNAVAILABLE;
  const sdIsVerificationUnavailable = sdState === WORKFLOW_STATE.VERIFICATION_UNAVAILABLE;
  const cpIsVerificationUnavailable = cpState === WORKFLOW_STATE.VERIFICATION_UNAVAILABLE;

  const trCanAct = !disabled && (trIsVerificationUnavailable
    ? !!onRetryVerification
    : (trState === WORKFLOW_STATE.NOT_CREATED || trState === WORKFLOW_STATE.OUTDATED || trState === WORKFLOW_STATE.FAILED));
  const sdCanAct = !disabled && (sdIsVerificationUnavailable
    ? !!onRetryVerification
    : (sdState === WORKFLOW_STATE.NOT_CREATED || sdState === WORKFLOW_STATE.OUTDATED || sdState === WORKFLOW_STATE.FAILED));
  const cpCanAct = !disabled && (cpIsVerificationUnavailable
    ? !!onRetryVerification
    : proposalAvailable && (cpState === WORKFLOW_STATE.NOT_CREATED || cpState === WORKFLOW_STATE.OUTDATED || cpState === WORKFLOW_STATE.FAILED));

  const trActLabel = trIsVerificationUnavailable
    ? 'Retry verification'
    : trState === WORKFLOW_STATE.OUTDATED ? 'Update Technical Report' : trState === WORKFLOW_STATE.FAILED ? 'Retry Technical Report' : 'Create Technical Report';
  const sdActLabel = sdIsVerificationUnavailable
    ? 'Retry verification'
    : sdState === WORKFLOW_STATE.OUTDATED ? 'Update Speaker Design' : sdState === WORKFLOW_STATE.FAILED ? 'Retry Speaker Design' : 'Create Speaker Design';
  const cpActLabel = cpIsVerificationUnavailable
    ? 'Retry verification'
    : cpState === WORKFLOW_STATE.OUTDATED ? 'Update Client Proposal' : cpState === WORKFLOW_STATE.FAILED ? 'Retry Client Proposal' : 'Create Client Proposal';

  const trOnAct = trIsVerificationUnavailable ? onRetryVerification : handleTechnicalReportAct;
  const sdOnAct = sdIsVerificationUnavailable ? onRetryVerification : handleSpeakerDesignAct;
  const cpOnAct = cpIsVerificationUnavailable ? onRetryVerification : handleClientProposalAct;

  const cpIsCreated = cpState === WORKFLOW_STATE.READY;
  const cpIsUnavailable = cpState === WORKFLOW_STATE.NOT_CREATED && !proposalAvailable;
  const cpReason = cpIsUnavailable && missingPrerequisites.length > 0
    ? `Available once the ${missingPrerequisites.join(' and ')} have been created.`
    : null;
  const cpDisplayReason = cpIsVerificationUnavailable
    ? VERIFICATION_UNAVAILABLE_COPY
    : cpState === WORKFLOW_STATE.OUTDATED
      ? (clientProposal?.freshnessReason || null)
      : cpReason;

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <DocumentCard
          number="1a"
          label="Technical Report"
          description="Creates the Project Report and matching Speaker Design PDF"
          icon={FileText}
          state={trState}
          stateLabel={trLabel}
          reason={trDisplayReason}
          canAct={trCanAct}
          actLabel={trActLabel}
          onAct={trOnAct}
          onOpen={technicalReport.record ? () => openStoredPdf(technicalReport.record) : null}
          openLabel="Open"
          onSecondary={trState === WORKFLOW_STATE.READY ? handleTechnicalReportAct : null}
          secondaryLabel={trState === WORKFLOW_STATE.READY ? 'Create New' : null}
          primary
        />
        <DocumentCard
          number="1b"
          label="Speaker Design"
          description="Can run independently. Reuses existing generation."
          icon={Speaker}
          state={sdState}
          stateLabel={sdLabel}
          reason={sdDisplayReason}
          canAct={sdCanAct}
          actLabel={sdActLabel}
          onAct={sdOnAct}
          onOpen={speakerDesign.record ? () => openStoredPdf(speakerDesign.record) : null}
          openLabel="Open"
        />
      </div>

      <DocumentCard
        number="2"
        label="Client Proposal"
        icon={Presentation}
        state={cpState}
        stateLabel={cpLabel}
        reason={cpDisplayReason}
        canAct={cpCanAct}
        actLabel={cpActLabel}
        onAct={cpOnAct}
        onOpen={clientProposal.record ? () => openStoredPdf(clientProposal.record) : null}
        openLabel="Open"
        primary={proposalAvailable && !cpIsCreated}
        onSecondary={cpIsCreated ? openProposalCentre : null}
        secondaryLabel={cpIsCreated ? 'Proposal Centre' : null}
      />

      <UploadedImagesRow
        count={imageCount}
        loading={imageCountLoading}
        onManage={openImageLibrary}
      />

      {/* Pre-generation Design Context review dialog */}
      <contextReview.Dialog />
    </div>
  );
}