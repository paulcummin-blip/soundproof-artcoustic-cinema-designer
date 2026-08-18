import BassTargetWarning from "@/components/room/bass/BassTargetWarning";

export default function BassCapabilitySummary({ capability, targetWarning, p14Parameter }) {
  if (!capability && !targetWarning) return null;
  const limitation = capability?.limitation;
  const basis = capability?.requested?.targetBasis === "recommended" ? "Recommended" : "Minimum";
  const targetDb = capability?.requested?.targetSplDb;
  const target = Number.isFinite(targetDb) ? `${basis} ${capability?.requested?.level || "—"} · ${targetDb} dBC` : "—";
  const availableDb = capability?.maximumAvailableSplAfterEqDb;

  // Achieved result — derived from the same authoritative P14 parameter used by
  // the pills. No second target state; this reads the existing analysis output.
  const achievedLevel = p14Parameter?.level;
  const achievedGrade = achievedLevel === 0 ? "FAIL" : (achievedLevel > 0 ? `L${achievedLevel}` : "—");
  const achievedPass = p14Parameter?.pass;
  const outcome = achievedPass === false ? "FAIL" : achievedPass === true ? "PASS" : "—";
  const achievedResult = achievedGrade !== "—" ? `${achievedGrade} ${basis} · ${outcome}` : "—";

  return <div className="mt-2 rounded-md border border-border bg-card p-3 text-xs">
    {capability && <>
      <div className="font-semibold text-foreground">P14 Bass SPL Authority</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div><span className="text-muted-foreground">P14 Target:</span> {target}</div>
        <div><span className="text-muted-foreground">Available Capability:</span> {Number.isFinite(availableDb) ? `${availableDb.toFixed(1)} dBC` : "—"}</div>
        <div><span className="text-muted-foreground">Achieved Result:</span> {achievedResult}</div>
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