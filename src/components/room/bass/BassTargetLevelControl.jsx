import { Button } from "@/components/ui/button";
import { useAppState } from "@/components/AppStateProvider";

export default function BassTargetLevelControl({ disabled = false }) {
  const appState = useAppState();
  const selectedLevel = Math.max(1, Math.min(4, Number(appState?.splConfig?.bassTargetLevel) || 4));

  return <div className="flex items-center gap-1">
    <span className="mr-1 text-xs text-muted-foreground">Bass target:</span>
    {[1, 2, 3, 4].map((level) => <Button
      key={level}
      type="button"
      size="sm"
      variant={selectedLevel === level ? "default" : "outline"}
      className="h-7 px-2 text-xs"
      disabled={disabled}
      onClick={() => appState?.updateGlobalSpl?.({ bassTargetLevel: level })}
    >L{level}</Button>)}
  </div>;
}