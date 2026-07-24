const asArray = (value) => Array.isArray(value) ? value : [];

function maxCurveDifference(preEqCurve, postEqCurve) {
  const postByFrequency = new Map(asArray(postEqCurve).filter((point) => Number.isFinite(point?.frequency) && Number.isFinite(point?.spl)).map((point) => [point.frequency, point.spl]));
  const differences = asArray(preEqCurve).filter((point) => Number.isFinite(point?.frequency) && Number.isFinite(point?.spl) && postByFrequency.has(point.frequency)).map((point) => Math.abs(postByFrequency.get(point.frequency) - point.spl));
  return differences.length ? Math.max(...differences) : null;
}

export function buildDesignEqLifecycleModel({ result, rspRawCurve, graphCandidateId, graphFilterBankSignature }) {
  const candidate = result?.selectedCandidate || null;
  const finalResponse = result?.finalOptimisedBassResponse || null;
  const acceptance = asArray(candidate?.designEqCandidateAcceptanceDiagnostics);
  const selections = asArray(candidate?.designEqCandidateSelectionDiagnostics);
  const bank = asArray(candidate?.generatedFilterBank);
  const enabledBank = bank.filter((filter) => filter?.enabled);
  const handedOffFilters = asArray(finalResponse?.eqFilterBank).filter((filter) => filter?.enabled);
  const acceptedCount = acceptance.filter((item) => item?.accepted).length;
  const chosenCount = selections.filter((item) => item?.chosen).length;
  const graphIdentityMatches = !!finalResponse?.selectedCandidateId && finalResponse.selectedCandidateId === graphCandidateId && finalResponse.filterBankSignature === graphFilterBankSignature;
  const firstEmptyStage = acceptedCount === 0 ? "A. No candidates accepted"
    : chosenCount === 0 ? "B. Candidates accepted but none chosen"
      : enabledBank.length === 0 ? "C. Candidate chosen but not written to final bank"
        : handedOffFilters.length === 0 || !graphIdentityMatches ? "D. Final bank populated but not passed to graph"
          : "Complete — no lifecycle stage is empty";
  return {
    candidate, finalResponse, acceptance, selections, bank, enabledBank, handedOffFilters, firstEmptyStage,
    regions: asArray(candidate?.designEqDetectedRegions),
    protectedNullRegions: asArray(candidate?.protectedNullRegions),
    sortedRows: selections.flatMap((selection) => asArray(selection?.sortedCandidateOrder).map((item) => ({ ...item, iteration: selection.iteration }))),
    maximumCurveDifferenceDb: maxCurveDifference(rspRawCurve, finalResponse?.postEqRspCurve),
    graphCandidateId, graphFilterBankSignature,
  };
}