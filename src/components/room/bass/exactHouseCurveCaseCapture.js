import { applyBassSmoothing } from "./bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";

const exactCurve = (curve) => (Array.isArray(curve) ? curve : [])
  .filter((point) => Number.isFinite(point?.frequency) && Number.isFinite(point?.spl))
  .map((point) => ({ frequency: point.frequency, spl: point.spl }));

const productSummary = (activeSubs) => {
  const counts = new Map();
  (activeSubs || []).forEach((sub) => {
    const model = sub?.modelKey || sub?.model || "unknown";
    counts.set(model, (counts.get(model) || 0) + 1);
  });
  return Array.from(counts, ([model, quantity]) => ({ model, quantity }));
};

export function buildExactHouseCurveCaseCapture({
  result, contract, lifecycle, rspRawCurve, perSeatRawCurves, activeSubs,
  usableLfHz, transitionFrequencyHz,
}) {
  const candidate = result?.selectedCandidate || null;
  const rawRsp = exactCurve(rspRawCurve);
  const targetAnchorDb = Number.isFinite(candidate?.requestedTargetSpl)
    ? candidate.requestedTargetSpl
    : Number.isFinite(result?.selectedP14TargetDb) ? result.selectedP14TargetDb : null;
  const requestedSystemOutputDb = targetAnchorDb;
  const frequencyGrid = rawRsp.map((point) => point.frequency);
  const aggregateFilterResponse = exactCurve(candidate?.combinedEqCurve);
  const capabilityAndHeadroom = frequencyGrid.map((frequency) => ({
    frequency,
    ...getSourceDomainBoostAllowance({
      frequency,
      requestedBoostDb: 6,
      activeSubs: activeSubs || [],
      usableLfHz,
      requestedSystemOutputDb,
    }),
  }));
  const capture = {
    captureType: "exact-live-house-curve-production-case",
    captureVersion: 1,
    capturedAt: new Date().toISOString(),
    caseFingerprint: contract?.fingerprints?.calibration || lifecycle?.currentCalibrationFingerprint || null,
    candidateId: result?.selectedCandidateId || candidate?.candidateId || null,
    frequencyGrid,
    rspResponseUnsmoothed: rawRsp,
    rspResponseThirdOctave: exactCurve(applyBassSmoothing(rawRsp, "third")),
    realSeatResponses: (perSeatRawCurves || [])
      .filter((seat) => seat?.seatId !== "rsp" && !seat?.__isSyntheticRsp)
      .map((seat) => ({ seatId: seat.seatId, isPrimary: !!seat.isPrimary, responseData: exactCurve(seat.responseData) })),
    absoluteHouseCurveTarget: frequencyGrid.map((frequency) => ({
      frequency,
      spl: Number.isFinite(targetAnchorDb) ? targetAnchorDb + artcousticHouseCurveOffsetAt(frequency) : null,
    })),
    assessment: {
      startHz: candidate?.assessmentStartHz ?? null,
      endHz: candidate?.assessmentEndHz ?? null,
      transitionFrequencyHz: Number.isFinite(transitionFrequencyHz) ? transitionFrequencyHz : null,
      targetAnchorDb,
    },
    products: {
      selectedModels: productSummary(activeSubs),
      activeSubs: activeSubs || [],
      usableLfHz: Number.isFinite(usableLfHz) ? usableLfHz : null,
      capabilityAndHeadroom,
    },
    rp22Definitions: getRp22BassOperatingDefinitions(),
    globalTrimDb: Number.isFinite(candidate?.globalTrimDb) ? candidate.globalTrimDb : null,
    selectedFilterBank: candidate?.generatedFilterBank || result?.selectedFilters || [],
    aggregateFilterResponse,
    protectedNullRegions: candidate?.houseCurveDiagnostics?.protectedNullRegions || [],
    protectedNullDiagnostics: {
      blockedResiduals: candidate?.blockedResiduals || [],
      worstResiduals: candidate?.designEqWorstResidualDiagnostics || [],
    },
    parameters: {
      p14: contract?.productAnalysis?.parameters?.p14 || null,
      p18: contract?.productAnalysis?.parameters?.p18 || null,
      p19: contract?.productAnalysis?.parameters?.p19 || null,
      p20: contract?.productAnalysis?.parameters?.p20 || null,
    },
    fingerprints: contract?.fingerprints || null,
    authority: {
      requestFingerprint: lifecycle?.currentJobFingerprint || null,
      returnedFingerprint: lifecycle?.returnedFingerprint || null,
      resultFingerprint: lifecycle?.resultFingerprint || null,
      filterBankSignature: result?.filterBankSignature || candidate?.filterBankSignature || null,
      engineVersion: result?.engineVersion || lifecycle?.requestIdentity?.engineVersion || null,
      resultSchemaVersion: result?.resultSchemaVersion || lifecycle?.requestIdentity?.resultSchemaVersion || null,
    },
    finalPostEqCurve: exactCurve(candidate?.finalPostEqCurve || result?.finalPostEqCurve),
    bankValidation: candidate?.bankValidationResult || candidate?.aggregateBankLimits || null,
  };
  return JSON.parse(JSON.stringify(capture));
}