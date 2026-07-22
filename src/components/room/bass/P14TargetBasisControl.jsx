import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAppState } from "@/components/AppStateProvider";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { formatBassParameterValue } from "@/components/room/bass/bassResultsPresentation";
import { getLevelColors } from "@/components/utils/rp22Colors";

const buttonClass = (selected) => selected
  ? "flex-1 bg-[#213428] text-white hover:bg-[#213428]/90"
  : "flex-1 border-[#DCDBD6] text-[#3E4349] hover:bg-[#F8F8F7]";

export default function P14TargetBasisControl({ disabled = false }) {
  const appState = useAppState();
  const shared = useSharedBassResults();
  const basis = appState?.splConfig?.p14Mode === "recommended" ? "recommended" : "minimum";
  const parameter = shared?.contract?.productAnalysis?.parameters?.p14;
  const ready = parameter?.status === "complete" && Number.isFinite(parameter?.value);
  const grade = ready ? (parameter.level === 0 ? "FAIL" : `L${parameter.level}`) : null;
  const basisLabel = basis === "recommended" ? "Recommended" : "Minimum";
  const colors = getLevelColors(ready ? parameter.level : null);

  return <div className="space-y-2">
    <Label className="text-xs text-[#625143]">Parameter 14. LFE frequencies total SPL capability at RSP</Label>
    <div className="flex gap-2">
      {["minimum", "recommended"].map((option) => <Button
        key={option}
        type="button"
        size="sm"
        variant={basis === option ? "default" : "outline"}
        className={buttonClass(basis === option)}
        onClick={() => appState?.updateGlobalSpl?.({ p14Mode: option })}
        disabled={disabled}
      >{option === "minimum" ? "Minimum" : "Recommended"}</Button>)}
    </div>
    <div className="w-full rounded-lg border px-4 py-2 text-[13px] font-semibold" style={{ borderColor: colors.border || "#E6E4DD", background: colors.bg, color: colors.text }}>
      {ready
        ? `P14 ${grade} · ${formatBassParameterValue("p14", parameter.value)} — ${basisLabel} target`
        : `P14 Updating — ${basisLabel} target`}
    </div>
  </div>;
}