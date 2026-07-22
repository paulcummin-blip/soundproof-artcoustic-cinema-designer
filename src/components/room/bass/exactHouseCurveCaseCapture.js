import { applyBassSmoothing } from "./bassGraphSmoothing";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";
import { getSourceDomainBoostAllowance } from "@/components/utils/subwooferCapability";
import { getRp22BassOperatingDefinitions } from "@/components/utils/rp22BassOperatingDefinitions";
import {
  contentFingerprint, serializeEqCurve, serializeSplCurve, serializeTargetCurve,
  validateExactHouseCurveCapture,
} from "./exactHouseCurveCaptureValidation";

const productSummary = (activeSubs) => {
  const counts = new Map();
  (activeSubs || []).forEach((sub) => {
    const model = sub?.modelKey || sub?.model || "unknown";
    counts.set(model, (counts.get(model) || 0) + 1);
  });
  return Array.from(counts, ([model, quantity]) => ({ model, quantity }));
};

const graphSeriesByKind = (series, kind) => {
  const match = (series || []).find((item) => item?.kind === kind);
  return { source: match ? `live graph series: ${match.label || match.id}` : "unavailable", data: serializeSplCurve(match?.data) };
};

const reconstructedTarget = (frequencyGrid, anchorDb, startHz, endHz) => frequencyGrid
  .filter((frequency) => frequency >= startHz && frequency <= endHz)
  .map((frequency) => ({ frequency, spl: anchorDb + artcousticHouseCurveOffsetAt(frequency) }));

export function buildExactHouseCurveCaseCapture(inputs) {
  const {
    result, contract, lifecycle, rspRawCurve, perSeatRawCurves, activeSubs = [], usableLfHz,
    transitionFrequencyHz, graphSeries, graphCandidateId, graphFilterBankSignature,
    designEqEnabled, detailedStatus,
  } = inputs || {};
  const candidate = result?.selectedCandidate || null;
  const before = serializeSplCurve(rspRawCurve);
  const after = serializeSplCurve(candidate?.finalPostEqCurve);
  const aggregateEqResponse = serializeEqCurve(candidate?.combinedEqCurve);
  const targetAnchorDb = Number.isFinite(candidate?.requestedTargetSpl) ? candidate.requestedTargetSpl : null;
  const startHz = candidate?.assessmentStartHz ?? null;
  const endHz = candidate?.assessmentEndHz ?? null;
  const fallback = Number.isFinite(targetAnchorDb) && Number.isFinite(startHz) && Number.isFinite(endHz)
    ? reconstructedTarget(before.map((point) => point.frequency), targetAnchorDb, startHz, endHz) : [];
  const productionTargetExact = serializeTargetCurve(candidate?.productionHouseCurveTarget);
  const fitterTargetExact = serializeTargetCurve(candidate?.fitterHouseCurveTarget);
  const graphBefore = graphSeriesByKind(graphSeries, "raw");
  const graphAfter = graphSeriesByKind(graphSeries, "post-eq");
  const graphTarget = graphSeriesByKind(graphSeries, "house-curve");
  const exactTargetAuthority = productionTargetExact.length > 0 && fitterTargetExact.length > 0 && graphTarget.data.length > 0;
  const productionHouseCurveTarget = productionTargetExact.length ? productionTargetExact : fallback;
  const fitterHouseCurveTarget = fitterTargetExact.length ? fitterTargetExact : fallback;
  const graphHouseCurveTarget = graphTarget.data.length ? graphTarget.data : fallback;
  const selectedModels = productSummary(activeSubs);
  const assessment = { startHz, endHz, transitionFrequencyHz: Number.isFinite(transitionFrequencyHz) ? transitionFrequencyHz : null, targetAnchorDb };
  const selectedFilterBank = candidate?.generatedFilterBank || result?.selectedFilters || [];
  const content = {
    frequencyGrid: before.map((point) => point.frequency), before, after,
    target: productionHouseCurveTarget, aggregateEqResponse, selectedFilterBank,
    products: selectedModels, assessment,
  };
  const productionCandidateId = result?.productionCandidateId || result?.selectedCandidateId || candidate?.candidateId || null;
  const contractCandidateId = contract?.selectedCandidateId || null;
  const productionFilterBankSignature = result?.filterBankSignature || candidate?.filterBankSignature || null;
  const contractFilterBankSignature = contract?.provenance?.filterBankSignature || null;
  const capture = {
    captureType: "exact-live-house-curve-production-case",
    captureVersion: 2,
    capturedAt: new Date().toISOString(),
    caseFingerprint: contentFingerprint(content),
    calibrationFingerprint: contract?.fingerprints?.calibration || lifecycle?.currentCalibrationFingerprint || null,
    frequencyGrid: content.frequencyGrid,
    productionSeries: {
      rspBeforeEq: { source: "authoritative rspRawCurve supplied to production optimiser", data: before },
      rspAfterEq: { source: "selectedCandidate.finalPostEqCurve", data: after },
    },
    graphSeries: { rspBeforeEq: graphBefore, rspAfterEq: graphAfter, absoluteHouseCurveTarget: graphTarget },
    aggregateEqResponse,
    aggregateEqSource: "selectedCandidate.combinedEqCurve ({frequency, spl}; spl is aggregate gain dB)",
    productionHouseCurveTarget,
    graphHouseCurveTarget,
    fitterHouseCurveTarget,
    targetSource: exactTargetAuthority ? "exact-live-authority" : "reconstructed-fallback",
    targetSources: {
      production: productionTargetExact.length ? "selectedCandidate.productionHouseCurveTarget" : "reconstructed-fallback",
      graph: graphTarget.data.length ? graphTarget.source : "reconstructed-fallback",
      fitter: fitterTargetExact.length ? "selectedCandidate.fitterHouseCurveTarget" : "reconstructed-fallback",
    },
    rspResponseThirdOctave: serializeSplCurve(applyBassSmoothing(before, "third")),
    realSeatResponses: (perSeatRawCurves || []).filter((seat) => seat?.seatId !== "rsp" && !seat?.__isSyntheticRsp)
      .map((seat) => ({ seatId: seat.seatId, isPrimary: !!seat.isPrimary, responseData: serializeSplCurve(seat.responseData) })),
    assessment,
    products: {
      selectedModels, activeSubs, usableLfHz: Number.isFinite(usableLfHz) ? usableLfHz : null,
      capabilityAndHeadroom: content.frequencyGrid.map((frequency) => ({ frequency, ...getSourceDomainBoostAllowance({ frequency, requestedBoostDb: 6, activeSubs, usableLfHz, requestedSystemOutputDb: targetAnchorDb }) })),
    },
    rp22Definitions: getRp22BassOperatingDefinitions(),
    globalTrimDb: Number.isFinite(candidate?.globalTrimDb) ? candidate.globalTrimDb : null,
    selectedFilterBank,
    protectedNullRegions: candidate?.houseCurveDiagnostics?.protectedNullRegions || [],
    protectedNullDiagnostics: { blockedResiduals: candidate?.blockedResiduals || [], worstResiduals: candidate?.designEqWorstResidualDiagnostics || [] },
    parameters: { ...contract?.productAnalysis?.parameters },
    fingerprints: contract?.fingerprints || null,
    authority: {
      requestFingerprint: lifecycle?.currentJobFingerprint || null,
      returnedFingerprint: lifecycle?.returnedFingerprint || null,
      resultFingerprint: lifecycle?.resultFingerprint || null,
      filterBankSignature: productionFilterBankSignature,
      engineVersion: result?.engineVersion || lifecycle?.requestIdentity?.engineVersion || null,
      resultSchemaVersion: result?.resultSchemaVersion || lifecycle?.requestIdentity?.resultSchemaVersion || null,
    },
    bankValidation: candidate?.bankValidationResult || candidate?.aggregateBankLimits || null,
    captureValidation: { graphCandidateId, contractCandidateId, productionCandidateId },
  };
  capture.captureValidation = validateExactHouseCurveCapture(capture, {
    candidate, result, designEqEnabled, detailedStatus, graphFilterBankSignature,
    contractFilterBankSignature, productionFilterBankSignature,
  });
  return JSON.parse(JSON.stringify(capture));
}