import { Button } from "@/components/ui/button";
import { useAppState } from "@/components/AppStateProvider";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import { p18ThresholdHzForLevel } from "@/components/utils/p18ExtensionAuthority";

export default function BassTargetLevelControl({ disabled = false }) {
  const appState = useAppState();
  const config = appState?.splConfig || {};
  const selectedBasis = config.selectedP14TargetBasis === "recommended" ? "recommended" : "minimum";
  const selectedP18Basis = config.selectedP18TargetBasis === "recommended" ? "recommended" : "minimum";
  const selectedLevel = Math.max(1, Math.min(4, Number(config.selectedP14Level) || 4));
  const selectedTarget = getRp22BassOperatingDefinitions(selectedBasis, selectedP18Basis).find(({ value }) => value === selectedLevel);
  const selectedP18Hz = p18ThresholdHzForLevel(selectedP18Basis, selectedLevel);
  const selectTarget = (basis, level) => appState?.updateGlobalSpl?.({ p14Mode: basis, selectedP14TargetBasis: basis, selectedP14Level: level });
  const selectP18Basis = (basis) => appState?.updateGlobalSpl?.({ p18Mode: basis, selectedP18TargetBasis: basis });

  return <div className="grid gap-1.5">
    <span className="text-xs font-medium text-muted-foreground">P14 Bass SPL:</span>
    {["minimum", "recommended"].map((basis) => <div key={basis} className="flex flex-wrap items-center gap-1">
      <span className="w-[86px] text-xs font-medium capitalize text-foreground">{basis}</span>
      {getRp22BassOperatingDefinitions(basis, selectedP18Basis).map(({ value, p14TargetDb }) => <Button
        key={`${basis}-${value}`}
        type="button"
        size="sm"
        variant={selectedBasis === basis && selectedLevel === value ? "default" : "outline"}
        className="h-7 px-2 text-xs"
        disabled={disabled}
        onClick={() => selectTarget(basis, value)}
      >L{value} · {p14TargetDb}</Button>)}
    </div>)}
    <span className="text-xs text-muted-foreground">P14 target: <strong className="text-foreground capitalize">{selectedBasis} L{selectedLevel} · {selectedTarget?.p14TargetDb ?? "—"} dBC</strong></span>
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
      >{basis} · L{selectedLevel} ≤ {p18ThresholdHzForLevel(basis, selectedLevel)} Hz</Button>)}
    </div>
    <span className="text-xs text-muted-foreground">P18 target: <strong className="text-foreground capitalize">{selectedP18Basis} L{selectedLevel} · ≤ {selectedP18Hz} Hz at selected P14 output</strong></span>
  </div>;
}