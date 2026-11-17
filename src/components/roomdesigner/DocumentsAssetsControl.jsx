/**
 * DocumentsAssetsControl
 * ----------------------
 * A collapsible control that consolidates the coordinated document workflow
 * (Technical Report, Speaker Design, Client Proposal) and the Project Assets
 * list into one prominent section.
 *
 * Collapsed (default): shows the section name, a concise document-progress
 *   summary, and whether Client Proposal creation is locked or ready.
 *
 * Expanded: shows the existing DocumentWorkflowPanel (all three steps with
 *   their independent status, creation actions and retry behaviour) followed
 *   by the existing ProjectAssetsSection (grouped by design version, with
 *   individual downloads and Download All).
 *
 * This is a presentation-only wrapper. It does not change document generation,
 * readiness rules, approval controls, storage behaviour, or any of the
 * underlying workflow logic — it only changes how those existing components
 * are arranged in the header.
 */
import React, { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Check, Lock } from "lucide-react";
import DocumentWorkflowPanel from "@/components/documentWorkflow/DocumentWorkflowPanel";
import ProjectAssetsSection from "@/components/projectAssets/ProjectAssetsSection";
import { WORKFLOW_STATE } from "@/components/documentWorkflow/documentWorkflowStatus";

/**
 * Build a concise collapsed-state summary from the workflow status.
 * Returns { text, proposalLabel, proposalState }.
 */
function buildSummary(workflowStatus) {
  if (!workflowStatus || workflowStatus.loading) {
    return { text: "Loading…", proposalLabel: null, proposalState: "loading" };
  }
  const { technicalReport, speakerDesign, clientProposal, proposalAvailable } = workflowStatus;
  const steps = [technicalReport, speakerDesign, clientProposal];
  const readyCount = steps.filter((s) => s?.state === WORKFLOW_STATE.READY).length;
  const generating = steps.some((s) => s?.state === WORKFLOW_STATE.GENERATING);

  let text;
  if (generating) {
    text = "Generating…";
  } else if (readyCount === 0) {
    text = "No documents yet";
  } else if (readyCount === steps.length) {
    text = "Documents ready";
  } else {
    text = `${readyCount} of ${steps.length} ready`;
  }

  const hasFailed = steps.some((s) => s?.state === WORKFLOW_STATE.FAILED);
  const hasOutdated = steps.some((s) => s?.state === WORKFLOW_STATE.OUTDATED);
  if (hasFailed) {
    text += " · Needs attention";
  } else if (hasOutdated && !generating) {
    text += " · Outdated";
  }

  const proposalStored = clientProposal?.state === WORKFLOW_STATE.READY;
  const proposalLabel = proposalStored ? "Proposal PDF ready" : proposalAvailable ? "Proposal available to create" : "Proposal locked";
  const proposalState = proposalStored || proposalAvailable ? "available" : "locked";

  return { text, proposalLabel, proposalState };
}

function ProposalPill({ state, label }) {
  if (!label) return null;
  const styles = {
    locked: { bg: "#F5F4F0", color: "#8B8378", border: "#E2DED7", icon: Lock },
    available: { bg: "#E8F5EC", color: "#2E7D4F", border: "#C8E6D0", icon: Check },
  };
  const s = styles[state] || styles.locked;
  const Icon = s.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 shrink-0"
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
      }}
    >
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

export default function DocumentsAssetsControl({
  projectId,
  versionId,
  projectName,
  versionName,
  engineeringFingerprint,
  workflowStatus,
  disabled = false,
  onOpenReport,
}) {
  const [open, setOpen] = useState(false);
  const summary = buildSummary(workflowStatus);

  return (
    <div className="flex-1 min-w-0">
      <div className="rounded-lg border border-[#E2DED7] bg-[#FBFAF8] overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-between w-full px-3 py-2 hover:bg-[#F5F4F0] transition-colors"
        >
          <span className="flex items-center gap-2 min-w-0">
            {open ? (
              <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: "#625143" }} />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: "#625143" }} />
            )}
            <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "#213428" }} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#625143] shrink-0">
              Documents & Assets
            </span>
            <span className="text-[11px] text-[#8B8378] truncate">{summary.text}</span>
          </span>
          <ProposalPill state={summary.proposalState} label={summary.proposalLabel} />
        </button>

        {open && (
          <div className="px-3 pb-3 pt-2 border-t border-[#E2DED7] space-y-3">
            <DocumentWorkflowPanel
              projectId={projectId}
              versionId={versionId}
              projectName={projectName}
              versionName={versionName}
              engineeringFingerprint={engineeringFingerprint}
              workflowStatus={workflowStatus}
              disabled={disabled}
              onOpenReport={onOpenReport}
            />
            <ProjectAssetsSection
              projectId={projectId}
              projectName={projectName}
              compact
            />
          </div>
        )}
      </div>
    </div>
  );
}