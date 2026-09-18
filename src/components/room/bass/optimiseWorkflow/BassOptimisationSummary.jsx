// BassOptimisationSummary.jsx
// Post-completion summary of the automatic bass optimisation.
//
// Explains WHY the optimiser reached its conclusion so users never finish with
// "No calibration adjustments required" without understanding why.
//
// Layout:
//   1. Outcome header (improvements applied OR no improvements found)
//   2. Per-stage detail (combinations tested, current/best/improvement, reason)
//   3. Optimisation confidence (HIGH / MEDIUM / LOW)
//   4. Physical limitation notice (only if P19/P20 FAILs remain)
//
// This is a presentation-layer component only — no algorithm, materiality, or
// RP22 grading changes.

import React from "react";
import { CheckCircle2, AlertTriangle, Activity } from "lucide-react";
import { buildOptimisationSummaryData } from "./optimisationSummaryData";

function formatDb(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)} dB`;
}

function formatImprovement(delta) {
  if (delta == null || !Number.isFinite(delta)) return "—";
  if (Math.abs(delta) < 0.005) return "0.00 dB";
  return `${delta.toFixed(2)} dB`;
}

function OutcomeHeader({ outcome }) {
  if (outcome === "improvements_applied") {
    return (
      <div className="flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 text-[#213428] flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-[12px] font-semibold text-[#1B1A1A]">
            Automatic bass optimisation completed.
          </div>
          <div className="text-[11px] text-[#625143] mt-0.5">
            Calibration improvements were applied.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="h-4 w-4 text-[#213428] flex-shrink-0 mt-0.5" />
      <div>
        <div className="text-[12px] font-semibold text-[#1B1A1A]">
          No further automatic calibration improvements found.
        </div>
        <div className="text-[11px] text-[#625143] mt-0.5">
          The current calibration is the best automatically achievable result.
        </div>
      </div>
    </div>
  );
}

function StageCard({ stage }) {
  const isImprovement = stage.outcome === "improvement";
  return (
    <div className="rounded-md border border-[#E7E4DF] bg-white/60 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[#1B1A1A]">
          {stage.label}
        </span>
        <span className="text-[10px] text-[#8A7B6A]">
          {stage.combinationsTested > 0
            ? `${stage.combinationsTested} ${
                stage.key === "subPositions" ? "layouts" : "combinations"
              } tested`
            : "not tested"}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
        <span className="text-[#625143]">
          Current:{" "}
          <span className="font-medium text-[#1B1A1A]">
            {formatDb(stage.currentP19)}
          </span>
        </span>
        <span className="text-[#625143]">
          Best:{" "}
          <span className="font-medium text-[#1B1A1A]">
            {formatDb(stage.bestP19)}
          </span>
        </span>
        <span className="text-[#625143]">
          Improvement:{" "}
          <span
            className={`font-medium ${isImprovement ? "text-[#213428]" : "text-[#1B1A1A]"}`}
          >
            {formatImprovement(stage.improvement)}
          </span>
        </span>
      </div>
      <div className="flex items-start gap-1.5">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide ${
            isImprovement ? "text-[#213428]" : "text-[#8A7B6A]"
          }`}
        >
          {isImprovement ? "Improved" : "No improvement"}
        </span>
        <span className="text-[10px] text-[#625143] leading-relaxed">
          {stage.reason}
        </span>
      </div>
    </div>
  );
}

function ConfidenceSection({ confidence }) {
  const levelColors = {
    HIGH: "bg-[#213428] text-white",
    MEDIUM: "bg-amber-600 text-white",
    LOW: "bg-red-600 text-white",
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#625143]">
          Optimisation Confidence
        </span>
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-bold ${levelColors[confidence.level] || ""}`}
        >
          {confidence.level}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[#8A7B6A]">
        {confidence.stages.map((s) => (
          <span key={s.label}>
            {s.label}:{" "}
            <span className="font-medium text-[#625143]">
              {s.combinationsTested > 0
                ? `${s.combinationsTested} tested`
                : "—"}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function PhysicalLimitationSection({ recommendations }) {
  if (!recommendations?.length) return null;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2.5 space-y-1.5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-[11px] font-semibold text-amber-800">
            Remaining limitations appear to be physical rather than
            calibration-related.
          </div>
          <div className="text-[10px] text-amber-700 mt-0.5">
            Potential improvements:
          </div>
        </div>
      </div>
      <ul className="ml-5 space-y-0.5">
        {recommendations.map((r) => (
          <li
            key={r}
            className="text-[10px] text-amber-700 list-disc list-outside"
          >
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BassOptimisationSummary({
  autoApplied,
  noImprovementsFound,
  v2State,
  completedBassAuthority,
  subwooferCount,
}) {
  const data = React.useMemo(
    () =>
      buildOptimisationSummaryData({
        selection: v2State?.winner,
        stageVerdicts: v2State?.stageVerdicts,
        v2Status: v2State?.status,
        completedBassAuthority,
        autoApplied,
        subwooferCount,
      }),
    [
      v2State?.winner,
      v2State?.stageVerdicts,
      v2State?.status,
      completedBassAuthority,
      autoApplied,
      subwooferCount,
    ],
  );

  if (!data) return null;

  return (
    <div className="rounded-md border border-[#E7E4DF] bg-[#F7F4F0]/60 px-4 py-3 space-y-3">
      {/* Heading */}
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-[#213428]" />
        <span className="text-[13px] font-semibold text-[#1B1A1A]">
          Bass Optimisation
        </span>
      </div>

      {/* Outcome */}
      <OutcomeHeader outcome={data.outcome} />

      {/* Per-stage detail */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
          Optimisation Summary
        </div>
        {data.stages.map((stage) => (
          <StageCard key={stage.key} stage={stage} />
        ))}
      </div>

      {/* Confidence */}
      <ConfidenceSection confidence={data.confidence} />

      {/* Physical limitation */}
      {data.physicalLimitation?.hasFails && (
        <PhysicalLimitationSection
          recommendations={data.physicalLimitation.recommendations}
        />
      )}
    </div>
  );
}