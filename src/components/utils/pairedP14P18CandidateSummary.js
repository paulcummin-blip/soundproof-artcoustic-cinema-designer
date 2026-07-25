export function buildPairedP14P18CandidateSummary(authority) {
  const selected = authority?.selectedTargetBasis === "recommended"
    ? authority?.assessments?.recommended
    : authority?.assessments?.minimum;
  const limiting = authority?.limitingResult;

  return {
    status: authority?.status ?? null,
    selectedTargetBasis: authority?.selectedTargetBasis ?? null,
    requestedLevel: authority?.requested?.level ?? null,
    requestedTargetSplDb: authority?.requested?.targetSplDb ?? null,
    minimumAchievedLevel: authority?.assessments?.minimum?.achievedLevel ?? null,
    recommendedAchievedLevel: authority?.assessments?.recommended?.achievedLevel ?? null,
    selectedAchievedLevel: authority?.achieved?.level ?? selected?.achievedLevel ?? null,
    selectedP18ExtensionHz: authority?.achieved?.p18?.extensionHz ?? selected?.p18?.extensionHz ?? null,
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