/**
 * DocumentsAssetsControl
 * ----------------------
 * A collapsible control that consolidates the coordinated document workflow
 * (Technical Report, Speaker Design, Client Proposal) and the Project Assets
 * list into one prominent section of the project workspace.
 *
 * Collapsed: a prominent header — folder icon, the heading "Documents &
 *   Assets", the supporting line "Create reports, drawings and client
 *   proposals", and a concise progress pill ("0 of 3 created").
 *
 * Expanded: the existing DocumentWorkflowPanel (document cards with their
 *   creation actions) followed by the existing ProjectAssetsSection (grouped
 *   by design version, with individual downloads and Download All).
 *
 * Default state: expanded when the project has no generated documents yet,
 *   collapsed once documents exist. The user's subsequent choice is remembered
 *   per project.
 *
 * This is a presentation-only wrapper. It does not change document generation,
 * readiness rules, approval controls, storage behaviour, or any of the
 * underlying workflow logic — it only changes how those existing components
 * are arranged in the header.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Folder } from "lucide-react";
import DocumentWorkflowPanel from "@/components/documentWorkflow/DocumentWorkflowPanel";
import ProjectAssetsSection from "@/components/projectAssets/ProjectAssetsSection";
import { WORKFLOW_STATE } from "@/components/documentWorkflow/documentWorkflowStatus";

const STORAGE_PREFIX = "b44_docs_assets_open_";

/**
 * Build a concise progress summary from the workflow status.
 * Returns { text, readyCount, total }.
 */
function buildSummary(workflowStatus) {
  const total = 3;
  if (!workflowStatus || workflowStatus.loading) {
    return { text: "Loading…", readyCount: 0, total };
  }
  const { technicalReport, speakerDesign, clientProposal } = workflowStatus;
  const steps = [technicalReport, speakerDesign, clientProposal];
  const readyCount = steps.filter((s) => s?.state === WORKFLOW_STATE.READY).length;
  const generating = steps.some((s) => s?.state === WORKFLOW_STATE.GENERATING);
  const hasFailed = steps.some((s) => s?.state === WORKFLOW_STATE.FAILED);
  const hasOutdated = steps.some((s) => s?.state === WORKFLOW_STATE.OUTDATED);
  const hasVerificationUnavailable = steps.some((s) => s?.state === WORKFLOW_STATE.VERIFICATION_UNAVAILABLE);

  let text = `${readyCount} of ${total} created`;
  if (generating) text = "Creating…";
  else if (hasFailed) text = `${readyCount} of ${total} created · Needs attention`;
  else if (hasOutdated) text = `${readyCount} of ${total} created · Outdated`;
  else if (hasVerificationUnavailable) text = `${readyCount} of ${total} created · Verify`;

  return { text, readyCount, total };
}

export default function DocumentsAssetsControl({
  projectId,
  versionId,
  projectName,
  clientName = null,
  projectReference = null,
  versionName,
  engineeringFingerprint,
  workflowStatus,
  onRetryVerification = null,
  disabled = false,
  onOpenReport,
}) {
  const summary = buildSummary(workflowStatus);
  const hasDocuments = summary.readyCount > 0;

  // The expanded panel's ProjectAssetsSection (alwaysLoad) fetches full image
  // records and derives the count. Reuse that count for DocumentWorkflowPanel's
  // "Uploaded Images" row so a separate ProposalAsset.count request is not
  // issued alongside the full record read.
  const [imageCount, setImageCount] = useState(null);
  const [imageCountLoading, setImageCountLoading] = useState(true);
  const handleImageCountChange = useCallback(({ count, loading }) => {
    setImageCount(count);
    setImageCountLoading(loading);
  }, []);

  // Default expanded when no documents exist; remember the user's choice.
  const storageKey = projectId ? `${STORAGE_PREFIX}${projectId}` : null;
  const [open, setOpen] = useState(() => {
    if (!storageKey) return true;
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "1") return true;
      if (stored === "0") return false;
    } catch { /* localStorage unavailable */ }
    return !hasDocuments; // expanded by default for a new project
  });

  // Persist the user's explicit choice per project.
  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, open ? "1" : "0"); } catch { /* ignore */ }
  }, [storageKey, open]);

  return (
    <div className="flex-1 min-w-0">
      <div className="rounded-lg border border-[#E2DED7] bg-[#FBFAF8] overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-between w-full px-3.5 py-2.5 hover:bg-[#F5F4F0] transition-colors"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            {open ? (
              <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "#625143" }} />
            ) : (
              <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "#625143" }} />
            )}
            <Folder className="w-4 h-4 shrink-0" style={{ color: "#213428" }} />
            <span className="flex flex-col min-w-0">
              <span className="text-[13px] font-semibold text-[#1B1A1A] leading-tight" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
                Documents & Assets
              </span>
              <span className="text-[11px] text-[#8B8378] leading-tight truncate">
                Create reports, drawings and client proposals
              </span>
            </span>
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border border-[#DCDBD6] bg-white text-[#3E4349] shrink-0 ml-2">
            {summary.text}
          </span>
        </button>

        {open && (
          <div className="px-3.5 pb-3.5 pt-2.5 border-t border-[#E2DED7]">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] gap-3.5 items-start">
              <DocumentWorkflowPanel
                projectId={projectId}
                versionId={versionId}
                projectName={projectName}
                versionName={versionName}
                engineeringFingerprint={engineeringFingerprint}
                workflowStatus={workflowStatus}
                onRetryVerification={onRetryVerification}
                disabled={disabled}
                onOpenReport={onOpenReport}
                imageCount={imageCount}
                imageCountLoading={imageCountLoading}
              />
              <ProjectAssetsSection
                projectId={projectId}
                projectName={projectName}
                compact
                alwaysLoad
                defaultOpen
                project={{ name: projectName, client_name: clientName, project_reference: projectReference }}
                onImageCountChange={handleImageCountChange}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}