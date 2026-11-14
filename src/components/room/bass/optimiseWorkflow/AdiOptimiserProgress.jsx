// AdiOptimiserProgress.jsx
// ---------------------------------------------------------------------------
// The ADI Sub Optimiser progress and completion presentation.
//
// DURING A RUN:
//   • A meaningful current-stage heading — never "Preparing calculation…"
//     once a search has started. The heading follows the engine's own active
//     stage (Phase / Delay / Gain / Placement / Seating / Crossover).
//   • A cumulative stage checklist in execution order. Each stage keeps a
//     differentiated state — Waiting · In progress · Improvement identified ·
//     No improvement found · Not applicable · Failed — and a completed stage
//     never reverts to pending.
//
// AFTER A RUN:
//   • A concise final summary: whether electronic optimisation was accepted,
//     whether a physical or seating alternative was identified, whether
//     anything was actually applied, or whether the design remains unchanged.
//     A recommended change is never conflated with an applied change.
//
// PURE PRESENTATION. It reads the V2 store stage verdicts, the workflow
// status and the saved receipt / recommendations. It performs no calculation,
// changes no acceptance rule, touches no candidate selection and writes
// nothing.
// ---------------------------------------------------------------------------

import React from "react";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

// Stage checklist in the engine's actual execution order. Each entry maps to
// a v2State stageVerdict key (see improveBassV2StageMapping STAGE_KEYS).
const STAGES = [
  { key: "phase_polarity", label: "Phase", hint: "phase alignment between subwoofers" },
  { key: "delays", label: "Delay", hint: "timing alignment between subwoofers" },
  { key: "gain", label: "Gain", hint: "level balance between subwoofers" },
  { key: "sub_positions", label: "Placement", hint: "practical subwoofer placement changes" },
  { key: "seating_positions", label: "Seating", hint: "small seating changes for bass consistency" },
  { key: "combining_best", label: "Crossover integration", hint: "integrated LCR / subwoofer crossover" },
];

// Resolve a single stage's display state from its verdict + stage status.
// A recorded verdict is permanent for this run — it never reverts to waiting.
function resolveStageState({ verdict, stage, isActive }) {
  if (verdict === "improvement") return "improvement";
  if (verdict === "no_improvement") return "no_improvement";
  if (verdict === "done") return "reviewed";
  if (verdict === "skipped" || verdict === "not_available") return "not_applicable";
  if (verdict === "incomplete") return "failed";
  if (stage?.status === "completed") return "reviewed";
  if (isActive || stage?.status === "active") return "active";
  if (stage?.status === "not_tested") return "not_applicable";
  return "waiting";
}

const STATE_META = {
  waiting: { icon: "pending", label: "Waiting", colour: "#8A7B6A" },
  active: { icon: "active", label: "In progress", colour: "#1B1A1A" },
  improvement: { icon: "done", label: "Improvement identified", colour: "#213428" },
  no_improvement: { icon: "done", label: "No improvement found", colour: "#625143" },
  reviewed: { icon: "done", label: "Analysed", colour: "#625143" },
  not_applicable: { icon: "skip", label: "Not applicable", colour: "#8A7B6A" },
  failed: { icon: "fail", label: "Failed", colour: "#B91C1C" },
};

function StageIcon({ state }) {
  const meta = STATE_META[state] || STATE_META.waiting;
  if (meta.icon === "done") return <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: meta.colour }} />;
  if (meta.icon === "active") return <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0" style={{ color: meta.colour }} />;
  if (meta.icon === "skip") return <span className="h-3.5 w-3.5 flex-shrink-0 text-[10px] flex items-center justify-center" style={{ color: meta.colour }}>—</span>;
  if (meta.icon === "fail") return <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: meta.colour }} />;
  return <span className="h-3.5 w-3.5 rounded-full border border-[#DCDBD6] flex-shrink-0" />;
}

// ── Heading ──
function resolveHeading({ workflowPhase, stageDisplay, calculationPhaseLabel }) {
  if (workflowPhase === "calculating") {
    return calculationPhaseLabel || "Preparing current design\u2026";
  }
  if (workflowPhase === "applying") return "Applying improvements\u2026";
  if (workflowPhase === "recalculating") return "Recalculating bass performance\u2026";
  if (workflowPhase === "publishing") return "Publishing results\u2026";
  if (workflowPhase === "complete") return "Analysis complete";
  // workflowPhase === "optimising" — follow the engine's active stage
  const activeKey = stageDisplay?.activeStageKey || null;
  if (activeKey === "sub_positions") return "Analysing placement options\u2026";
  if (activeKey === "seating_positions") return "Analysing seating options\u2026";
  if (activeKey === "combining_best" || activeKey === "confirming_finalists") return "Comparing results\u2026";
  // phase_polarity, delays, gain, or no active stage yet during optimising
  return "Analysing electronic adjustments\u2026";
}

// ── Final summary ──
function FinalSummary({ receipt, recommendations, autoApplied }) {
  const status = receipt?.status || null;
  const changes = Array.isArray(receipt?.changes) ? receipt.changes : [];
  const electronicApplied = status === "verified" && changes.length > 0;
  const electronicNoChange = status === "no-changes";
  const electronicNotApplied = status === "not-applied" || (status === "verified" && changes.length === 0);
  const physicalIdentified = Boolean(recommendations?.subPositions || recommendations?.seating);
  const designUnchanged = !electronicApplied && !physicalIdentified && !electronicNoChange;

  const lines = [];
  if (electronicApplied) {
    const labels = changes.map((c) => c.label).filter(Boolean);
    lines.push({
      tone: "applied",
      text: `Electronic optimisation applied and verified${labels.length ? `: ${labels.join(", ")}` : "."}`,
    });
  } else if (electronicNoChange) {
    lines.push({ tone: "neutral", text: "No electronic changes were needed — the current settings are already optimal." });
  } else if (electronicNotApplied) {
    lines.push({ tone: "neutral", text: "No validated electronic changes were applied. Tested candidates did not meet the safety thresholds." });
  }

  if (physicalIdentified) {
    const parts = [];
    if (recommendations?.subPositions) parts.push("subwoofer placement");
    if (recommendations?.seating) parts.push("seating position");
    lines.push({
      tone: "identified",
      text: `Physical alternative identified for review (${parts.join(" and ")}). Not applied — review in the Room Designer.`,
    });
  }

  if (designUnchanged) {
    lines.push({ tone: "neutral", text: "Current design remains unchanged. No improvement or physical alternative was identified." });
  }

  if (lines.length === 0) return null;

  return (
    <div className="rounded-md border border-[#CFDCCF] bg-[#F4F7F4] px-3 py-2.5 space-y-1" data-adi-progress-summary="true">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#213428]">
        ADI summary
      </div>
      {lines.map((line, i) => (
        <div
          key={i}
          className="text-[12px] leading-relaxed"
          style={{ color: line.tone === "applied" ? "#213428" : line.tone === "identified" ? "#4A230F" : "#3E4349" }}
        >
          {line.tone === "applied" && "\u2713 "}
          {line.tone === "identified" && "\u2192 "}
          {line.text}
        </div>
      ))}
    </div>
  );
}

export default function AdiOptimiserProgress({
  v2State = null,
  workflowPhase = "idle",
  stageDisplay = null,
  calculationPhaseLabel = null,
  isCalculating = false,
  isComplete = false,
  receipt = null,
  recommendations = null,
  autoApplied = null,
}) {
  // The checklist is rendered during a run AND after completion, so completed
  // stages stay visible with their outcomes. When no run has happened yet the
  // block is not drawn at all.
  const showChecklist = isCalculating || isComplete;
  const heading = resolveHeading({ workflowPhase, stageDisplay, calculationPhaseLabel });
  const v2Complete = v2State?.status === "complete";

  return (
    <div className="space-y-3" data-adi-optimiser-progress="true">
      {isCalculating && (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-[#213428]" />
          <span className="text-[13px] font-semibold text-[#1B1A1A]">{heading}</span>
        </div>
      )}

      {showChecklist && (
        <div className="space-y-1.5 pl-2" data-adi-progress-checklist="true">
          {STAGES.map((stage) => {
            const stageEntry = stageDisplay?.stages?.find((s) => s.key === stage.key) || null;
            const verdict = stageDisplay?.stageVerdicts?.[stage.key]
              ?? v2State?.stageVerdicts?.[stage.key]
              ?? null;
            const isActive = stageDisplay?.activeStageKey === stage.key;
            const state = resolveStageState({ verdict, stage: stageEntry, isActive });
            const meta = STATE_META[state] || STATE_META.waiting;
            return (
              <div key={stage.key} className="flex items-start gap-2 text-[12px]" data-adi-progress-stage={stage.key} data-adi-progress-state={state}>
                <div className="pt-0.5"><StageIcon state={state} /></div>
                <div className="min-w-0">
                  <span
                    className={state === "active" ? "text-[#1B1A1A] font-medium" : "text-[#3E4349]"}
                  >
                    {stage.label}
                  </span>
                  <span className="text-[10px] ml-1.5" style={{ color: meta.colour }}>
                    {meta.label}
                  </span>
                  {state === "not_applicable" && stageEntry?.verdict === "skipped" && (
                    <span className="text-[10px] text-[#8A7B6A] ml-1">(not applicable)</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isComplete && !isCalculating && (
        <FinalSummary receipt={receipt} recommendations={recommendations} autoApplied={autoApplied} />
      )}
    </div>
  );
}