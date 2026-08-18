import BassTargetWarning from "@/components/room/bass/BassTargetWarning";

export default function BassCapabilitySummary({ capability, targetWarning, p14Parameter }) {
  if (!capability && !targetWarning) return null;
  const limitation = capability?.limitation;
  const basis = capability?.requested?.targetBasis === "recommended" ? "Recommended" : "Minimum";
  const targetDb = capability?.requested?.targetSplDb;
  const target = Number.isFinite(targetDb) ? `${basis} ${capability?.requested?.level || "—"} · ${targetDb} dBC` : "—";
  const availableDb = capability?.maximumAvailableSplAfterEqDb;

  // P14 design operating point (RULE 1/2): when the selected target is achieved,
  // the design result is the selected level (not the capability level). Only when
  // the target cannot be achieved does the result fall to the highest achievable level.
  const pass = p14Parameter?.pass;
  const designLevel = pass === true ? p14Parameter?.selectedLevel : p14Parameter?.level;
  const designGrade = designLevel === 0 ? "FAIL" : (designLevel > 0 ? `L${designLevel}` : "—");
  const outcome = pass === false ? "FAIL" : pass === true ? "PASS" : "—";
  const achievedResult = designGrade !== "—" ? `${designGrade} ${basis} · ${outcome}` : "—";

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