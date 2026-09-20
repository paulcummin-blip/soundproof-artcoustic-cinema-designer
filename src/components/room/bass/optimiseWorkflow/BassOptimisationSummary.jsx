// BassOptimisationSummary.jsx
// Post-completion summary of the automatic bass optimisation.
//
// Shows canonical P19/P20 before→after, failing-seat count, primary floor,
// and 6-way classification for each optimisation stage.
//
// The proxy `achievedP19VariationDb` (RSP-only one-sided max-abs) is moved
// behind a debug disclosure labelled "Internal search metric" — it is NOT
// the published per-seat P19 and must not appear as the main result.
//
// This is a presentation-layer component only — no algorithm, materiality, or
// RP22 grading changes.

import React, { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Activity,
  ArrowRight,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { buildOptimisationSummaryData } from "./optimisationSummaryData";
import RP22GradingPill from "@/components/ui/RP22GradingPill";

// ── Helpers ──────────────────────────────────────────────────────────────

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function fmtDb(raw) {
  if (!Number.isFinite(Number(raw))) return "—";
  return `±${Math.abs(Number(raw)).toFixed(1)} dB`;
}

// ── Classification badge ──────────────────────────────────────────────────

const CLASSIFICATION_STYLES = {
  IMPROVES_BOTH: "bg-[#213428] text-white",
  IMPROVES_P19: "bg-[#213428] text-white",
  IMPROVES_P20: "bg-[#213428] text-white",
  TRADE_OFF: "bg-amber-600 text-white",
  NO_MATERIAL_IMPROVEMENT: "bg-[#E7E4DF] text-[#8A7B6A]",
  UNSAFE: "bg-red-600 text-white",
  NOT_TESTED: "bg-[#E7E4DF] text-[#8A7B6A]",
};

const CLASSIFICATION_LABELS = {
  IMPROVES_BOTH: "IMPROVES BOTH",
  IMPROVES_P19: "IMPROVES P19",
  IMPROVES_P20: "IMPROVES P20",
  TRADE_OFF: "TRADE-OFF",
  NO_MATERIAL_IMPROVEMENT: "NO MATERIAL IMPROVEMENT",
  UNSAFE: "UNSAFE",
  NOT_TESTED: "NOT TESTED",
};

function ClassificationBadge({ classification }) {
  const style = CLASSIFICATION_STYLES[classification] || CLASSIFICATION_STYLES.NO_MATERIAL_IMPROVEMENT;
  const label = CLASSIFICATION_LABELS[classification] || CLASSIFICATION_LABELS.NO_MATERIAL_IMPROVEMENT;
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${style}`}>
      {label}
    </span>
  );
}

// ── Delta displays (reuse patterns from ImproveBassV2SimplifiedResults) ──

function MetricDelta({ label, beforeLevel, beforeRaw, afterLevel, afterRaw, isRspOnly, isNoChange }) {
  if (isNoChange) {
    return (
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="text-[#8A7B6A] w-14">{label}</span>
        <span className="text-[#8A7B6A]">No change</span>
      </div>
    );
  }

  const levelChanged = numericLevel(beforeLevel) !== numericLevel(afterLevel);
  const rawChanged = Math.abs(Math.abs(Number(beforeRaw)) - Math.abs(Number(afterRaw))) > 0.05;
  const hasLevels = beforeLevel != null && afterLevel != null;
  const labelWithSuffix = isRspOnly ? `${label} (RSP)` : label;

  // RSP-only or raw-only display (no level pills available)
  if (!hasLevels) {
    return (
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="text-[#8A7B6A] w-14">{labelWithSuffix}</span>
        <span className="text-[#625143]">{fmtDb(beforeRaw)}</span>
        {rawChanged && <ArrowRight className="h-2.5 w-2.5 text-[#8A7B6A]" />}
        {rawChanged && <span className="text-[#213428] font-medium">{fmtDb(afterRaw)}</span>}
        {!rawChanged && <span className="text-[#8A7B6A]">No change</span>}
      </div>
    );
  }

  // Level-based display (level pills + raw delta)
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="text-[#8A7B6A] w-14">{labelWithSuffix}</span>
        <RP22GradingPill level={beforeLevel} compact />
        {(levelChanged || rawChanged) && <ArrowRight className="h-2.5 w-2.5 text-[#8A7B6A]" />}
        {(levelChanged || rawChanged) && <RP22GradingPill level={afterLevel} compact />}
        {!levelChanged && !rawChanged && <span className="text-[#8A7B6A]">No change</span>}
      </div>
      {(levelChanged || rawChanged) && beforeRaw != null && afterRaw != null && (
        <div className="flex items-center gap-1.5 text-[10px] ml-14">
          <span className="text-[#625143]">{fmtDb(beforeRaw)}</span>
          <ArrowRight className="h-2.5 w-2.5 text-[#8A7B6A]" />
          <span className="text-[#213428] font-medium">{fmtDb(afterRaw)}</span>
        </div>
      )}
    </div>
  );
}

function FailingSeatsDelta({ before, after, isNoChange }) {
  if (isNoChange) {
    return (
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="text-[#8A7B6A] w-14">Fails</span>
        <span className="text-[#8A7B6A]">No change</span>
      </div>
    );
  }
  const changed = before !== after;
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="text-[#8A7B6A] w-14">Fails</span>
      <span className={before > 0 ? "text-red-600 font-semibold" : "text-[#213428]"}>
        {before ?? "—"}
      </span>
      {changed && <ArrowRight className="h-2.5 w-2.5 text-[#8A7B6A]" />}
      {changed && (
        <span className={after > 0 ? "text-red-600 font-semibold" : "text-[#213428] font-semibold"}>
          {after ?? "—"}
        </span>
      )}
      {!changed && <span className="text-[#8A7B6A]">No change</span>}
    </div>
  );
}

function PrimaryFloorDelta({ before, after, isNoChange }) {
  if (isNoChange) {
    return (
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="text-[#8A7B6A] w-14">Floor</span>
        <span className="text-[#8A7B6A]">No change</span>
      </div>
    );
  }
  const changed = before !== after;
  const beforeLabel = before === 0 ? "FAIL" : before > 0 ? `L${before}` : "—";
  const afterLabel = after === 0 ? "FAIL" : after > 0 ? `L${after}` : "—";
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="text-[#8A7B6A] w-14">Floor</span>
      <RP22GradingPill level={beforeLabel} compact />
      {changed && <ArrowRight className="h-2.5 w-2.5 text-[#8A7B6A]" />}
      {changed && <RP22GradingPill level={afterLabel} compact />}
      {!changed && <span className="text-[#8A7B6A]">No change</span>}
    </div>
  );
}

// ── Stage card ───────────────────────────────────────────────────────────

function StageCard({ stage }) {
  const [showInternal, setShowInternal] = useState(false);
  const isNotTested = stage.verdict === "not_tested";
  const hasInternal = stage.internal && (stage.internal.currentP19 != null || stage.internal.bestP19 != null);

  return (
    <div className="rounded-md border border-[#E7E4DF] bg-white/60 px-3 py-2.5 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[#1B1A1A]">
          {stage.label}
        </span>
        <span className="text-[10px] text-[#8A7B6A]">
          {stage.combinationsTested > 0
            ? `${stage.combinationsTested} ${
                stage.key === "subPositions" ? "layouts" : "combinations"
              } tested`
            : isNotTested
              ? "not tested"
              : "—"}
        </span>
      </div>

      {/* Canonical metrics */}
      {!isNotTested && (
        <>
          <MetricDelta label="P19" {...stage.p19} />
          <MetricDelta label="P20" {...stage.p20} />
          <FailingSeatsDelta {...stage.failingSeats} />
          <PrimaryFloorDelta {...stage.primaryFloor} />

          {/* Classification */}
          <div className="flex items-center gap-2 pt-1 border-t border-[#E7E4DF]">
            <span className="text-[10px] text-[#8A7B6A] uppercase tracking-wide">
              Result
            </span>
            <ClassificationBadge classification={stage.classification} />
          </div>
        </>
      )}

      {/* Internal search metric (debug disclosure) */}
      {hasInternal && (
        <div className="border-t border-[#E7E4DF] pt-1">
          <button
            type="button"
            onClick={() => setShowInternal(!showInternal)}
            className="flex items-center gap-1 text-[9px] text-[#8A7B6A] hover:text-[#625143] cursor-pointer"
          >
            {showInternal ? (
              <ChevronDown className="h-2.5 w-2.5" />
            ) : (
              <ChevronRight className="h-2.5 w-2.5" />
            )}
            Internal search metric
          </button>
          {showInternal && (
            <div className="ml-4 mt-1 text-[9px] text-[#8A7B6A]">
              RSP P19 proxy:{" "}
              <span className="font-medium text-[#625143]">
                {stage.internal.currentP19 != null ? `${stage.internal.currentP19.toFixed(2)} dB` : "—"}
              </span>
              {" → "}
              <span className="font-medium text-[#625143]">
                {stage.internal.bestP19 != null ? `${stage.internal.bestP19.toFixed(2)} dB` : "—"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Outcome header ────────────────────────────────────────────────────────

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

// ── Confidence section ───────────────────────────────────────────────────

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

// ── Physical limitation section ──────────────────────────────────────────

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

// ── Main component ────────────────────────────────────────────────────────

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