export default function BassCapabilitySummary({ capability }) {
  if (!capability) return null;
  const limitation = capability.limitation;
  const target = Number.isFinite(capability.requested?.targetSplDb) ? `${capability.requested.targetSplDb} dBC` : "—";
  const achieved = capability.achieved?.level ? `RP22 ${capability.achieved.level}` : "Below RP22 L1";
  return <div className="mt-2 rounded-md border border-border bg-card p-3 text-xs">
    <div className="font-semibold text-foreground">Bass Authority</div>
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <div><span className="text-muted-foreground">Requested design:</span> RP22 {capability.requested?.level || "—"}</div>
      <div><span className="text-muted-foreground">Target:</span> {target}</div>
      <div><span className="text-muted-foreground">System capability:</span> {achieved}</div>
      <div><span className="text-muted-foreground">Limitation:</span> {limitation ? `${limitation.limitingParameter || "Authority"} · ${limitation.primary}` : "None"}</div>
    </div>
    {limitation && <div className="mt-2 font-medium text-destructive">
      Shortfall: {Number.isFinite(capability.shortfallDb) ? `${capability.shortfallDb.toFixed(1)} dB` : "—"}
      {Number.isFinite(capability.limitingFrequency) ? ` at ${capability.limitingFrequency.toFixed(1)} Hz` : ""}
    </div>}
  </div>;
}