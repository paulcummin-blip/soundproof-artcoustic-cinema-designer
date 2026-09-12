// ImproveBassV2Progress.jsx
// Stage checklist progress display for the V2 Improve Bass Response workflow.
//
// Shows the 7 user-facing stages with completed/active/pending/not-tested
// states. Completed stages show a verdict (improvement found / no material
// improvement). The active stage is obvious with a spinner. Pending stages
// show a hollow circle. Seating positions show "Not tested" since Stage 11C
// is not implemented.
//
// Progress is driven by the ACTUAL engine phase progression — no fake timers
// or animations. The stage mapping is in improveBassV2StageMapping.js.

import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X, CheckCircle2, Circle, Minus, Lock } from "lucide-react";
import { buildStageDisplay, formatStageVerdict } from "./improveBassV2StageMapping.js";

export default function ImproveBassV2Progress({ state, onCancel }) {
  const display = buildStageDisplay(state);

  return (
    <div className="mt-3 rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3">
      {/* Header + Cancel */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-[#213428]" />
          <span className="text-[12px] font-semibold text-[#213428]">{display.headerLabel}</span>
        </div>
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

      {/* Stage checklist */}
      <div className="mt-3 space-y-1.5">
        {display.stages.map((stage) => (
          <StageRow key={stage.key} stage={stage} />
        ))}
      </div>

      {/* Supporting text */}
      <div className="mt-2.5 border-t border-[#E0DDD7] pt-2">
        <p className="text-[10px] leading-relaxed text-[#8A7B6A]">
          {display.supportingText}
        </p>
      </div>
    </div>
  );
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