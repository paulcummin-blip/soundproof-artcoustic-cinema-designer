export function buildPairedP14P18CandidateSummary(authority) {
  const selected = authority?.selectedTargetBasis === "recommended"
    ? authority?.assessments?.recommended
    : authority?.assessments?.minimum;
  const limiting = authority?.limitingResult;

  return {
    status: authority?.status ?? null,
    selectedTargetBasis: authority?.selectedTargetBasis ?? null,
    minimumWinningLevel: authority?.assessments?.minimum?.winningLevel ?? null,
    recommendedWinningLevel: authority?.assessments?.recommended?.winningLevel ?? null,
    selectedWinningLevel: selected?.winningLevel ?? null,
    selectedP18ExtensionHz: selected?.p18?.extensionHz ?? null,
    limitingFrequencyHz: limiting?.limitingFrequencyHz ?? null,
    marginDb: limiting?.marginDb ?? null,
    shortfallDb: limiting?.shortfallDb ?? null,
    broadMiss: limiting?.broadMiss ?? null,
    severeNull: limiting?.severeNull ?? null,
    authorityMethod: authority?.authority?.method ?? null,
    authorityVersion: authority?.authority?.version ?? null,
    schemaVersion: authority?.schemaVersion ?? null,
  };
}