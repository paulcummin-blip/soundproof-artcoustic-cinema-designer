import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppState } from "@/components/AppStateProvider";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { formatP18TargetBasisDetail } from "@/components/utils/p18ExtensionAuthority";
import { useActiveProjectId } from "@/components/state/project-session";
import { presentP14AnalysisProgress, useP14AnalysisProgress } from "./p14AnalysisProgressStore";

function P14AnalysisStatus() {
  const projectId = useActiveProjectId();
  const progress = useP14AnalysisProgress(projectId);
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    if (!progress?.activeTargetKey || progress?.status === "complete") return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [progress?.activeTargetKey, progress?.status]);
  const presentation = presentP14AnalysisProgress(progress, nowMs);
  return (
    <div className="flex shrink-0 items-center gap-1.5 pt-0.5 text-[10px] font-medium text-muted-foreground" aria-live="polite">
      {presentation.complete
        ? <Check className="h-3.5 w-3.5 text-[#213428]" />
        : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      <span className="whitespace-nowrap">{presentation.label}</span>
    </div>
  );
}

export default function BassTargetLevelControl({ disabled = false }) {
  const appState = useAppState();
  const config = appState?.splConfig || {};
  const selectedBasis = config.selectedP14TargetBasis === "recommended" ? "recommended"
    : config.selectedP14TargetBasis === "minimum" ? "minimum"
    : null;
  const selectedP18Basis = config.selectedP18TargetBasis === "recommended" ? "recommended" : "minimum";
  const rawLevel = config.selectedP14Level;
  // Explicit null guard: Number(null) === 0, which Number.isFinite accepts.
  const selectedLevel = (Number.isFinite(Number(rawLevel)) && Number(rawLevel) > 0)
    ? Math.max(1, Math.min(4, Math.round(Number(rawLevel))))
    : null;
  const hasSelection = !!selectedBasis && !!selectedLevel;
  const selectedTarget = hasSelection ? getRp22BassOperatingDefinitions(selectedBasis, selectedP18Basis).find(({ value }) => value === selectedLevel) : null;
  const selectTarget = (basis, level) => appState?.updateGlobalSpl?.({ p14Mode: basis, selectedP14TargetBasis: basis, selectedP14Level: level });
  const selectP18Basis = (basis) => appState?.updateGlobalSpl?.({ p18Mode: basis, selectedP18TargetBasis: basis });

  return <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
    <div className="grid min-w-0 flex-1 gap-1.5">
    <span className="text-xs font-medium text-muted-foreground">P14 Bass SPL:</span>
    {["minimum", "recommended"].map((basis) => <div key={basis} className="flex flex-wrap items-center gap-1">
      <span className="w-[86px] text-xs font-medium capitalize text-foreground">{basis}</span>
      {getRp22BassOperatingDefinitions(basis, selectedP18Basis).map(({ value, p14TargetDb }) => <Button
        key={`${basis}-${value}`}
        type="button"
        size="sm"
        variant={hasSelection && selectedBasis === basis && selectedLevel === value ? "default" : "outline"}
        className="h-7 px-2 text-xs"
        disabled={disabled}
        onClick={() => selectTarget(basis, value)}
      >L{value} · {p14TargetDb}</Button>)}
    </div>)}
    {hasSelection
      ? <span className="text-xs text-muted-foreground">P14 target: <strong className="text-foreground capitalize">{selectedBasis} L{selectedLevel} · {selectedTarget?.p14TargetDb ?? "—"} dBC</strong></span>
      : <span className="text-xs font-medium text-amber-600">Select Bass Target</span>
    }
    <span className="mt-1 text-xs font-medium text-muted-foreground">P18 Bass extension:</span>
    <div className="flex flex-wrap items-center gap-1">
      {["minimum", "recommended"].map((basis) => <Button
        key={`p18-${basis}`}
        type="button"
        size="sm"
        variant={selectedP18Basis === basis ? "default" : "outline"}
        className="h-7 px-2 text-xs capitalize"
        disabled={disabled}
        onClick={() => selectP18Basis(basis)}
      >{basis} grading</Button>)}
    </div>
    <span className="text-xs text-muted-foreground">
      P18 is graded independently from the achieved −3 dB point at the selected P14 output.
      <strong className="ml-1 text-foreground">{formatP18TargetBasisDetail(selectedP18Basis)}</strong>
    </span>
    </div>
    <P14AnalysisStatus />
  </div>;
}