/**
 * DocumentCard
 * ------------
 * A single document step in the coordinated Documents & Assets workflow.
 * Presentation only: it receives a resolved state, a badge label and the
 * same action handlers the previous inline rows used. It changes no logic.
 *
 * Layout intent: the creation action sits directly under the document it
 * creates, rather than at the far edge of the workspace.
 *
 *   • Not created + can act  → a prominent Create/Update/Retry button inside
 *                              the card. `primary` controls solid vs. outline
 *                              dark-green treatment.
 *   • Created                → collapses to a compact status row: Created badge
 *                              + Open action, no large creation card.
 *   • Generating             → Creating… badge, disabled action.
 *   • Not available           → Not Available badge + reason text, no button.
 *   • Outdated / Failed       → badge + Update / Retry action.
 */
import React from 'react';
import { ArrowRight, Check, Clock, AlertCircle, RefreshCw, ChevronRight, ExternalLink, FileText, Download, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WORKFLOW_STATE } from './documentWorkflowStatus';

function StepGlyph({ state, icon: Icon, notAvailable = false }) {
  if (state === WORKFLOW_STATE.READY) return <Check className="w-3.5 h-3.5" style={{ color: '#2E7D4F' }} />;
  if (state === WORKFLOW_STATE.GENERATING) return <Clock className="w-3.5 h-3.5 animate-pulse" style={{ color: '#625143' }} />;
  if (state === WORKFLOW_STATE.FAILED) return <AlertCircle className="w-3.5 h-3.5" style={{ color: '#B23A3A' }} />;
  if (state === WORKFLOW_STATE.OUTDATED) return <AlertCircle className="w-3.5 h-3.5" style={{ color: '#B37A2B' }} />;
  if (state === WORKFLOW_STATE.VERIFICATION_UNAVAILABLE) return <RefreshCw className="w-3.5 h-3.5" style={{ color: '#6C7A89' }} />;
  return <Icon className="w-3.5 h-3.5" style={{ color: notAvailable ? '#A39A88' : '#1565C0' }} />;
}

function badgeClass(state, notAvailable = false) {
  switch (state) {
    case WORKFLOW_STATE.READY: return 'bg-[#E8F5EC] text-[#2E7D4F] border-[#C8E6D0]';
    case WORKFLOW_STATE.GENERATING: return 'bg-[#F5F4F0] text-[#625143] border-[#E2DED7]';
    case WORKFLOW_STATE.FAILED: return 'bg-[#FDECEC] text-[#B23A3A] border-[#F5C8C8]';
    case WORKFLOW_STATE.OUTDATED: return 'bg-[#FFF3E0] text-[#B37A2B] border-[#FFE0B2]';
    case WORKFLOW_STATE.VERIFICATION_UNAVAILABLE: return 'bg-[#ECEFF1] text-[#6C7A89] border-[#D7DCE0]';
    case WORKFLOW_STATE.NOT_CREATED:
      return notAvailable
        ? 'bg-[#F5F4F0] text-[#A39A88] border-[#E8E5DF]'
        : 'bg-[#E3F2FD] text-[#1565C0] border-[#BBDEFB]';
    default: return 'bg-[#F5F4F0] text-[#8B8378] border-[#E2DED7]';
  }
}

/**
 * The prominent in-card creation action. `primary` true → solid Sound Proof
 * dark green; false → outlined dark-green secondary.
 */
function CreateAction({ label, state, primary, onAct }) {
  const isRetry = state === WORKFLOW_STATE.FAILED;
  const isUpdate = state === WORKFLOW_STATE.OUTDATED;
  const isVerify = state === WORKFLOW_STATE.VERIFICATION_UNAVAILABLE;
  if (primary) {
    return (
      <Button
        type="button"
        className="w-full h-9 text-[12px] font-semibold border-0"
        style={{ background: '#213428', color: '#FFFFFF' }}
        onClick={onAct}
      >
        {(isRetry || isVerify) && <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
        {label}
        {!isRetry && !isVerify && <ArrowRight className="w-3.5 h-3.5 ml-1.5" />}
      </Button>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full h-9 text-[12px] font-semibold border-[#213428] text-[#213428] hover:bg-[#F4F7F4]"
      onClick={onAct}
    >
      {(isRetry || isVerify) && <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
      {label}
      {!isRetry && !isVerify && <ArrowRight className="w-3.5 h-3.5 ml-1.5" />}
    </Button>
  );
}

/**
 * DownloadButton — the Download PDF action on a completed document card.
 *
 *   • idle / downloading → red "Download PDF" with a download icon.
 *   • downloading        → same red, but a spinner and disabled while the
 *                          existing stored file is retrieved.
 *   • downloaded         → green "Downloaded" with a tick icon. The button
 *                          remains clickable so the user can download the
 *                          same document again whenever required.
 *
 * `onDownload` retrieves the existing stored PDF only — it never triggers
 * regeneration, capture or an upload. The green state is set only after the
 * retrieval succeeds; a failed download never turns the button green.
 */
function DownloadButton({ downloadState, onClick }) {
  const isDownloaded = downloadState === 'downloaded';
  const isDownloading = downloadState === 'downloading';
  return (
    <Button
      type="button"
      size="sm"
      className="h-7 px-3 text-[11px] font-medium border-0 flex-1 min-w-0"
      style={{ background: isDownloaded ? '#213428' : '#A66B5E', color: '#FFFFFF' }}
      onClick={onClick}
      disabled={isDownloading}
      title={isDownloaded ? 'Download again' : 'Download PDF'}
    >
      {isDownloading ? (
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
      ) : isDownloaded ? (
        <CheckCircle2 className="w-3 h-3 mr-1" />
      ) : (
        <Download className="w-3 h-3 mr-1" />
      )}
      {isDownloaded ? 'Downloaded' : 'Download PDF'}
    </Button>
  );
}

export default function DocumentCard({
  number,
  label,
  description,
  icon,
  state,
  stateLabel,
  reason,
  canAct,
  actLabel,
  onAct,
  onOpen,
  openLabel = 'Open',
  primary = false,
  onSecondary = null,
  secondaryLabel = null,
  onDownload = null,
  downloadState = 'idle',
  verifying = false,
}) {
  // Loading evidence is not a failed verification. Keep existing files usable,
  // but do not offer generation or restart the verification while it is pending.
  if (verifying) {
    return (
      <div className="rounded-lg border border-[#E2DED7] bg-white px-3 py-2.5 flex flex-col gap-2 min-w-0" aria-busy="true">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-semibold uppercase flex-1">{number} {label}</span>
          <span className="inline-flex items-center gap-1 text-[#625143]">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />Checking sources…
          </span>
        </div>
        {onOpen && <Button type="button" size="sm" variant="outline" onClick={onOpen}>{openLabel}</Button>}
      </div>
    );
  }
  const isCreated = state === WORKFLOW_STATE.READY;
  const notAvailable = state === WORKFLOW_STATE.NOT_CREATED && !canAct;
  const showDescription = !isCreated && Boolean(description);
  const badge = badgeClass(state, notAvailable);

  // Created → compact card: a heading row (number + full title + status
  // indicator), then a separate row beneath it for the Open and Create New /
  // secondary actions. Title and status are never squeezed onto the same
  // line as the buttons.
  if (isCreated) {
    return (
      <div className="rounded-lg border border-[#E2DED7] bg-white px-3 py-2.5 flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0" style={{ background: '#2E7D4F', color: '#FFFFFF' }}>
            {number}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B1A1A] flex-1 min-w-0">{label}</span>
          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${badge} shrink-0`}>
            <StepGlyph state={state} icon={icon} />
            {stateLabel}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {onOpen && (
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-[11px] font-medium border-0 flex-1 min-w-0"
              style={{ background: '#213428', color: '#FFFFFF' }}
              onClick={onOpen}
            >
              {openLabel}
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          )}
          {onDownload && (
            <DownloadButton downloadState={downloadState} onClick={onDownload} />
          )}
          {onSecondary && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-3 text-[11px] font-medium border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7] shrink-0"
              onClick={onSecondary}
            >
              {secondaryLabel}
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#E2DED7] bg-white px-3 py-2.5 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0" style={{ background: '#213428', color: '#FFFFFF' }}>
          {number}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B1A1A] flex-1 min-w-0">{label}</span>
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${badge} shrink-0`}>
          <StepGlyph state={state} icon={icon} notAvailable={notAvailable} />
          {stateLabel}
        </div>
      </div>
      {showDescription && (
        <p className="text-[11px] text-[#8B8378] leading-snug">{description}</p>
      )}
      {reason && state === WORKFLOW_STATE.FAILED && (
        <p className="text-[10px] text-[#B23A3A] leading-snug">{reason}</p>
      )}
      {state === WORKFLOW_STATE.OUTDATED && (
        <p className="text-[10px] text-[#B37A2B] leading-snug">
          {reason || 'Document source could not be verified.'}
        </p>
      )}
      {state === WORKFLOW_STATE.VERIFICATION_UNAVAILABLE && (
        <p className="text-[10px] text-[#6C7A89] leading-snug">
          {reason || 'Source could not be verified. Retry to re-check without regenerating.'}
        </p>
      )}
      {onOpen && (state === WORKFLOW_STATE.OUTDATED || state === WORKFLOW_STATE.FAILED || state === WORKFLOW_STATE.VERIFICATION_UNAVAILABLE) && (
        <button
          type="button"
          onClick={onOpen}
          className="w-full h-8 text-[12px] font-medium border border-[#DCDBD6] text-[#213428] bg-white hover:bg-[#F8F8F7] rounded-md inline-flex items-center justify-center gap-1.5"
          style={{ fontFamily: 'Didact Gothic, sans-serif' }}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          {openLabel}
        </button>
      )}
      {canAct ? (
        <CreateAction label={actLabel} state={state} primary={primary} onAct={onAct} />
      ) : notAvailable ? (
        <div className="text-[11px] text-[#A39A88] leading-snug">
          {reason || 'Complete the previous steps first.'}
        </div>
      ) : state === WORKFLOW_STATE.GENERATING ? (
        <div className="w-full h-9 rounded-md bg-[#F5F4F0] border border-[#E2DED7] flex items-center justify-center text-[12px] font-medium text-[#625143]">
          <Clock className="w-3.5 h-3.5 mr-1.5 animate-pulse" />
          {stateLabel}
        </div>
      ) : null}
    </div>
  );
}