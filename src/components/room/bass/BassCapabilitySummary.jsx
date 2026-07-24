export default function BassCapabilitySummary({ capability }) {
  if (!capability) return null;
  return <div className="mt-2 rounded-md border border-border bg-card p-3 text-xs">
    <div className="font-semibold text-foreground">Bass Capability</div>
    <div className="mt-2 grid gap-1 sm:grid-cols-3">
      <div><span className="text-muted-foreground">Target:</span> RP22 Level {capability.requestedLevel}</div>
      <div><span className="text-muted-foreground">Available:</span> RP22 {capability.achievedP14LevelLabel === "FAIL" ? "FAIL" : `Level ${capability.achievedP14Level}`}</div>
      <div><span className="text-muted-foreground">Limitation:</span> {capability.limitation || "None"}</div>
    </div>
    {capability.failureMessage && <div className="mt-2 font-medium text-destructive">{capability.failureMessage}</div>}
    {capability.recommendation && <div className="mt-1 text-muted-foreground">{capability.recommendation}</div>}
  </div>;
}