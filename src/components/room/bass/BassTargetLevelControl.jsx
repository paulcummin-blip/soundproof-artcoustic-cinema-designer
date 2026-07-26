import { Button } from "@/components/ui/button";
import { useAppState } from "@/components/AppStateProvider";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";

export default function BassTargetLevelControl({ disabled = false }) {
  const appState = useAppState();
  const config = appState?.splConfig || {};
  const selectedBasis = config.selectedP14TargetBasis === "recommended" ? "recommended" : "minimum";
  const selectedLevel = Math.max(1, Math.min(4, Number(config.selectedP14Level) || 4));
  const selectedTarget = getRp22BassOperatingDefinitions(selectedBasis).find(({ value }) => value === selectedLevel);
  const selectTarget = (basis, level) => appState?.updateGlobalSpl?.({ selectedP14TargetBasis: basis, selectedP14Level: level });

  return <div className="grid gap-1.5">
    <span className="text-xs font-medium text-muted-foreground">P14 Bass SPL:</span>
    {["minimum", "recommended"].map((basis) => <div key={basis} className="flex flex-wrap items-center gap-1">
      <span className="w-[86px] text-xs font-medium capitalize text-foreground">{basis}</span>
      {getRp22BassOperatingDefinitions(basis).map(({ value, p14TargetDb }) => <Button
        key={`${basis}-${value}`}
        type="button"
        size="sm"
        variant={selectedBasis === basis && selectedLevel === value ? "default" : "outline"}
        className="h-7 px-2 text-xs"
        disabled={disabled}
        onClick={() => selectTarget(basis, value)}
      >L{value} · {p14TargetDb}</Button>)}
    </div>)}
    <span className="text-xs text-muted-foreground">Target: <strong className="text-foreground capitalize">{selectedBasis} L{selectedLevel} · {selectedTarget?.p14TargetDb ?? "—"} dBC</strong></span>
  </div>;
}