import BassTargetWarning from "@/components/room/bass/BassTargetWarning";

export default function BassCapabilitySummary({ capability, targetWarning }) {
  if (!capability && !targetWarning) return null;
  const limitation = capability?.limitation;
  const basis = capability?.requested?.targetBasis === "recommended" ? "Recommended" : "Minimum";
  const targetDb = capability?.requested?.targetSplDb;
  const target = Number.isFinite(targetDb) ? `${basis} ${capability?.requested?.level || "—"} · ${targetDb} dBC` : "—";
  const availableDb = capability?.maximumAvailableSplAfterEqDb;
  return <div className="mt-2 rounded-md border border-border bg-card p-3 text-xs">
    {capability && <>
      <div className="font-semibold text-foreground">P14 Bass SPL Authority</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div><span className="text-muted-foreground">Target:</span> {target}</div>
        <div><span className="text-muted-foreground">Available capability:</span> {Number.isFinite(availableDb) ? `${availableDb.toFixed(1)} dBC` : "—"}</div>
        <div><span className="text-muted-foreground">P14 result:</span> {capability.p14Pass ? "PASS" : "FAIL"}</div>
        <div><span className="text-muted-foreground">P14 + P18 envelope:</span> {capability.passesRequestedLevel ? "PASS" : "FAIL"}</div>
        <div><span className="text-muted-foreground">Limitation:</span> {limitation ? limitation.primary : "None"}</div>
      </div>
      {limitation && <div className="mt-2 font-medium text-destructive">
        {capability.limitingParameter === "P18" ? "Extension shortfall" : "SPL shortfall"}: {Number.isFinite(capability.shortfallDb)
          ? `${capability.shortfallDb.toFixed(1)} ${capability.limitingParameter === "P18" ? "Hz" : "dB"}`
          : "—"}{Number.isFinite(capability.limitingFrequency) ? ` at ${capability.limitingFrequency.toFixed(1)} Hz` : ""}
      </div>}
    </>}
    <BassTargetWarning warning={targetWarning} />
  </div>;
}