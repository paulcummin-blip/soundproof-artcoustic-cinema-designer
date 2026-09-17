// ImproveBassV2Progress.jsx
// Stage checklist progress display for the V2 Improve Bass Response workflow.
//
// Shows the user-facing stages with completed/active/pending/not-tested
// states. Completed stages show a verdict (improvement found / no material
// improvement). The active stage is obvious with a spinner. Pending stages
// show a hollow circle.
//
// Also shows:
//   - Elapsed time (live, updates every second)
//   - Best result so far (failing seats, primary floor, P19/P20)
//   - "Still running" message if no progress event for >10 seconds
//
// Progress is driven by the ACTUAL engine phase progression — no fake timers
// or animations. The stage mapping is in improveBassV2StageMapping.js.

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X, CheckCircle2, Circle, Minus, Lock, Clock, TrendingDown, AlertCircle } from "lucide-react";
import { buildStageDisplay, formatStageVerdict } from "./improveBassV2StageMapping.js";

const SILENT_GAP_THRESHOLD_MS = 10000;

export default function ImproveBassV2Progress({ state, onCancel }) {
  const display = buildStageDisplay(state);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Live elapsed timer
  useEffect(() => {
    if (!state?.startedAtMs) return;
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - state.startedAtMs);
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [state?.startedAtMs]);

  // Silent gap detection
  const lastProgressAt = state?.lastProgressAt || state?.startedAtMs || 0;
  const silentGapMs = now - lastProgressAt;
  const isSilent = silentGapMs > SILENT_GAP_THRESHOLD_MS && state?.status === "running";

  const bestSoFarSummary = state?.bestSoFarSummary || null;

  return (
    <div className="mt-3 rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3">
      {/* Header + Cancel */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-[#213428]" />
          <span className="text-[12px] font-semibold text-[#213428]">{display.headerLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {elapsedMs > 0 && (
            <span className="text-[10px] text-[#8A7B6A] flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatElapsed(elapsedMs)}
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="text-[11px]"
          >
            <X className="h-3 w-3 mr-1" />
            Cancel
          </Button>
        </div>
      </div>

      {/* Stage checklist */}
      <div className="mt-3 space-y-1.5">
        {display.stages.map((stage) => (
          <StageRow key={stage.key} stage={stage} />
        ))}
      </div>

      {/* Best result so far */}
      {bestSoFarSummary && (
        <BestSoFarBar summary={bestSoFarSummary} />
      )}

      {/* Silent gap warning */}
      {isSilent && (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5">
          <AlertCircle className="h-3 w-3 text-amber-700 flex-shrink-0" />
          <span className="text-[10px] text-amber-800">
            Canonical bass confirmation is still running… ({formatElapsed(silentGapMs)} since last update)
          </span>
        </div>
      )}

      {/* Supporting text */}
      <div className="mt-2.5 border-t border-[#E0DDD7] pt-2">
        <p className="text-[10px] leading-relaxed text-[#8A7B6A]">
          {display.supportingText}
        </p>
      </div>
    </div>
  );
}

function BestSoFarBar({ summary }) {
  const { failingSeats, primaryFloor, p19VariationDb, p20VariationDb, isPreliminary } = summary;
  return (
    <div className="mt-2.5 rounded-md border border-[#D9D5CE] bg-white px-2.5 py-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <TrendingDown className="h-3 w-3 text-[#213428]" />
        <span className="text-[10px] font-semibold text-[#213428]">Best result so far</span>
        {isPreliminary && (
          <span className="text-[9px] text-[#8A7B6A] italic ml-1">(Preliminary)</span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {failingSeats != null && (
          <div className="text-[10px]">
            <span className="text-[#8A7B6A]">Failing seats: </span>
            <span className="font-semibold text-[#213428]">{failingSeats}</span>
          </div>
        )}
        {primaryFloor && (
          <div className="text-[10px]">
            <span className="text-[#8A7B6A]">Primary floor: </span>
            <span className="font-semibold text-[#213428]">{primaryFloor}</span>
          </div>
        )}
        {p19VariationDb != null && Number.isFinite(p19VariationDb) && (
          <div className="text-[10px]">
            <span className="text-[#8A7B6A]">P19: </span>
            <span className="font-semibold text-[#213428]">{p19VariationDb.toFixed(2)} dB</span>
          </div>
        )}
        {p20VariationDb != null && Number.isFinite(p20VariationDb) && (
          <div className="text-[10px]">
            <span className="text-[#8A7B6A]">P20: </span>
            <span className="font-semibold text-[#213428]">{p20VariationDb.toFixed(2)} dB</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatElapsed(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function StageRow({ stage }) {
  const { status, label, supportingText, verdict, subStageLabel } = stage;

  if (status === 'not_available') {
    return (
      <div className="flex items-start gap-2">
        <Lock className="h-3.5 w-3.5 text-[#8A7B6A] mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] text-[#8A7B6A]">{label} — Not available yet</div>
          {supportingText && (
            <div className="text-[10px] text-[#B0A89B] mt-0.5">{supportingText}</div>
          )}
        </div>
      </div>
    );
  }

  if (status === 'not_tested') {
    return (
      <div className="flex items-start gap-2">
        <Minus className="h-3.5 w-3.5 text-[#B0A89B] mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] text-[#B0A89B]">{label} — Not tested</div>
        </div>
      </div>
    );
  }

  if (status === 'completed') {
    const verdictText = formatStageVerdict(verdict);
    return (
      <div className="flex items-start gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-[#213428] mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] text-[#213428] font-medium">
            {label.replace('Checking ', '')} checked
            {verdictText && (
              <span className="font-normal text-[#8A7B6A]"> — {verdictText}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === 'active') {
    return (
      <div className="flex items-start gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#213428] mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[#213428]">{label}...</div>
          {subStageLabel && (
            <div className="text-[10px] text-[#625143] mt-0.5">{subStageLabel}...</div>
          )}
          <div className="text-[10px] text-[#8A7B6A] mt-0.5">{supportingText}</div>
        </div>
      </div>
    );
  }

  // pending
  return (
    <div className="flex items-start gap-2">
      <Circle className="h-3.5 w-3.5 text-[#D0CBC2] mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] text-[#B0A89B]">{label}</div>
      </div>
    </div>
  );
}