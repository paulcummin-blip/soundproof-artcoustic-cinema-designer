import { MODELS, normaliseModelKey } from "@/components/models/speakers/registry";
import { ARTCOUSTIC_HOUSE_CURVE } from "@/components/utils/artcousticHouseCurve";
import { generateCandidatePool, selectCandidateFromPool } from "@/components/utils/bassOperatingEnvelopeOptimiser";
import { computeCalibrationFingerprint, computeGeometryFingerprint, computeHouseCurveFingerprint, computeProductFingerprint } from "./bassAnalysisFingerprints";
import { BASS_NORMALIZED_PHYSICS_DEFAULTS as DEFAULTS } from "./bassPhysicsDefaults";
import { deriveRequestedCalibrationConfig } from "./requestedCalibrationConfig";
import { buildAuthoritativeAutoAlignDelays, buildAuthoritativeBassSources, buildAuthoritativeResponseCurves, buildAuthoritativeRspPosition, simulateAuthoritativeBassResponse } from "./useAuthoritativeBassResponse";

const EXPECTED = {
  rspFrequencies: "a0508a09",
  rspSpl: "c55df033",
  perSeatResponses: "cfd03f6c",
  fingerprints: {
    geometry: "geo:v1:3596cd7dff97dc17",
    product: "prod:v1:3f55cab9863453b3",
    calibration: "cal:v1:7fed44f4d51a6386",
  },
  // Audited fitting-output update: authority inputs and calibration fingerprints
  // remain unchanged; the selected bank, reconstructed curve and derived values change.
  selectedCandidate: "069caf0c",
  filterBank: "46e7db8f",
  postEqCurve: "90a4b8a1",
  parameters: "ab968989",
};

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function hash(value) {
  const text = stable(value);
  let result = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

const APPROVED_AUTHORITY_FIELDS = [
  "officialP19WorstFrequencyHz",
  "officialP19Label",
  "correctableP19Label",
  "perSeatP20Results",
  "p20Label",
];
const PRE_AUTHORITY_SELECTED_CANDIDATE_HASH = "3088219a";

function withoutApprovedAuthorityFields(candidate) {
  return Object.fromEntries(Object.entries(candidate || {}).filter(([key]) => !APPROVED_AUTHORITY_FIELDS.includes(key)));
}

function savedProjectInputs() {
  const roomDims = { widthM: 4.5, lengthM: 6, heightM: 2.4 };
  const rspPosition = buildAuthoritativeRspPosition(roomDims, 3.2);
  const seatingPositions = [
    { id: "seat-1", x: 1.7, y: 3.2, z: 1.2, row: 1, indexInRow: 1 },
    { id: "seat-2", x: 2.8, y: 4.6, z: 1.2, row: 2, indexInRow: 1 },
  ];
  const frontSubsLive = [{ id: "front-sub-left", group: "front", model: "SUB2-12", position: { x: 0.6, y: 0.2, z: 0.35 } }];
  const rearSubsLive = [{ id: "rear-sub-left", group: "rear", model: "SUB2-12", position: { x: 3.9, y: 5.8, z: 0.35 } }];
  const frontSubsCfg = { count: 1, model: "SUB2-12", settingsById: { "front-sub-left": { gainDb: -1.5, delayMs: 0.4, polarity: "normal" } } };
  const rearSubsCfg = { count: 1, model: "SUB2-12", settingsById: { "rear-sub-left": { gainDb: -2, delayMs: 1.1, polarity: "invert" } } };
  const autoAlignDelays = buildAuthoritativeAutoAlignDelays({ enabled: true, rspPosition, frontSubsLive, rearSubsLive, frontSubsCfg, rearSubsCfg });
  const sources = buildAuthoritativeBassSources({ frontSubsLive, rearSubsLive, frontSubsCfg, rearSubsCfg, autoAlignDelays });
  const physics = {
    surfaceAbsorption: DEFAULTS.surfaceAbsorption,
    roomDamping: DEFAULTS.roomDamping,
    enableRewCoreReflections: DEFAULTS.enableRewCoreReflections,
    rewSourceCurveMode: "product",
    modalSourceReferenceMode: DEFAULTS.modalSourceReferenceMode,
    modalGainScalar: DEFAULTS.modalGainScalar,
    axialQ: DEFAULTS.axialQ,
    modalStorageMode: DEFAULTS.modalStorageMode,
    propagationPhaseScale: DEFAULTS.propagationPhaseScale,
    disableReflectionPhaseJitter: DEFAULTS.disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight: DEFAULTS.disableReflectionCoherenceWeight,
    disableLateField: true,
    disableModalPropagationPhase: true,
    mute68HzAxialMode: DEFAULTS.mute68HzAxialMode,
    debugDisableModalContribution: DEFAULTS.debugDisableModalContribution,
    rewParityFieldMode: DEFAULTS.rewParityFieldMode,
    modalDistanceBlend: DEFAULTS.modalDistanceBlend,
    overrideConstantAxialQ: DEFAULTS.overrideConstantAxialQ,
    overrideAbsorptionAxialQ: DEFAULTS.overrideAbsorptionAxialQ,
    debugMode200Multiplier: DEFAULTS.debugMode200Multiplier,
    debugModalPhaseConvention: "normal",
    debugModalHSign: "normal",
    reflectionGainScale: DEFAULTS.reflectionGainScale,
    rewParityModalMagnitudeScale: 1,
    modalCoherenceMode: DEFAULTS.modalCoherenceMode,
    highOrderAxialScale: DEFAULTS.highOrderAxialScale,
    rewModalBandwidthScale: DEFAULTS.rewModalBandwidthScale,
    runtimeVectorCapture: false,
  };
  return { roomDims, rspPosition, seatingPositions, sources, physics };
}

export function runBassAuthorityParityFixtures() {
  const inputs = savedProjectInputs();
  const simulation = simulateAuthoritativeBassResponse({ ...inputs, qStrategyOverride: DEFAULTS.qStrategy });
  const curves = buildAuthoritativeResponseCurves(simulation.seatResponses);
  const usable = inputs.sources.map((sub) => MODELS.find((model) => model.key === normaliseModelKey(sub.modelKey))?.approvedUsableLfHzMinus6dB).filter(Number.isFinite);
  const designEqSystemLimits = { activeSubs: inputs.sources, usableLfHz: usable.length ? Math.max(...usable) : null };
  const transitionHz = 2000 * Math.sqrt(0.4 / (4.5 * 6 * 2.4));
  const splConfig = { globalPowerW: 100, globalEqHeadroomDb: 0, radiationMode: "half-space" };
  const requested = deriveRequestedCalibrationConfig({ splConfig, optimisationTransitionHz: transitionHz, designEqSystemLimits });
  const productCapabilities = inputs.sources.map((sub) => {
    const model = MODELS.find((item) => item.key === normaliseModelKey(sub.modelKey));
    return { modelKey: model.key, response: model.frequency_response_curve, usableLfHz: model.approvedUsableLfHzMinus6dB, continuousSplDb: model.approvedContinuousSplAt1mDb, continuousSpl30HzDb: model.approvedContinuousSplAt30HzDb, peakSplDb: model.approvedPeakSplDb };
  });
  const fingerprintInputs = {
    roomDims: inputs.roomDims, sources: inputs.sources, rspPosition: inputs.rspPosition,
    seatingPositions: inputs.seatingPositions, surfaceAbsorption: inputs.physics.surfaceAbsorption,
    roomDamping: inputs.physics.roomDamping, axialQ: inputs.physics.axialQ,
    modalSourceReferenceMode: inputs.physics.modalSourceReferenceMode, modalGainScalar: inputs.physics.modalGainScalar,
    modalDistanceBlend: inputs.physics.modalDistanceBlend, modalStorageMode: inputs.physics.modalStorageMode,
    propagationPhaseScale: inputs.physics.propagationPhaseScale, enableRewCoreReflections: inputs.physics.enableRewCoreReflections,
    rewSourceCurveMode: inputs.physics.rewSourceCurveMode, qStrategy: DEFAULTS.qStrategy,
    rewModalBandwidthScale: inputs.physics.rewModalBandwidthScale,
    disableReflectionPhaseJitter: inputs.physics.disableReflectionPhaseJitter,
    disableReflectionCoherenceWeight: inputs.physics.disableReflectionCoherenceWeight,
    disableLateField: true, disableModalPropagationPhase: true, mute68HzAxialMode: inputs.physics.mute68HzAxialMode,
    debugDisableModalContribution: inputs.physics.debugDisableModalContribution, rewParityFieldMode: inputs.physics.rewParityFieldMode,
    overrideConstantAxialQ: inputs.physics.overrideConstantAxialQ, overrideAbsorptionAxialQ: inputs.physics.overrideAbsorptionAxialQ,
    debugMode200Multiplier: inputs.physics.debugMode200Multiplier, debugModalPhaseConvention: "normal",
    reflectionGainScale: inputs.physics.reflectionGainScale, debugModalHSign: "normal", rewParityModalMagnitudeScale: 1,
    modalCoherenceMode: inputs.physics.modalCoherenceMode, highOrderAxialScale: inputs.physics.highOrderAxialScale,
    splConfig, optimisationTransitionHz: transitionHz, requestedOutputDb: requested.requestedOutputDb,
    houseCurveFingerprint: computeHouseCurveFingerprint(ARTCOUSTIC_HOUSE_CURVE),
    assessmentStartHz: requested.requestedAssessmentStartHz, assessmentEndHz: requested.requestedAssessmentEndHz,
    targetAnchorDb: requested.requestedTargetAnchorDb, activeFitProfile: requested.requestedFitProfile,
    usableLfHz: requested.requestedUsableLfHz, evaluatedProfiles: requested.evaluatedProfiles,
    productDataVersion: 1, productCapabilities,
  };
  const fingerprints = {
    geometry: computeGeometryFingerprint(fingerprintInputs),
    product: computeProductFingerprint(fingerprintInputs),
    calibration: computeCalibrationFingerprint(fingerprintInputs),
  };
  const pool = generateCandidatePool({ rawCurve: curves.rspRawCurve, activeSubs: inputs.sources, usableLfHz: designEqSystemLimits.usableLfHz, transitionHz, perSeatRawCurves: curves.perSeatRawCurves });
  const selected = selectCandidateFromPool(pool, "balanced");
  const candidate = selected.selectedCandidate;
  const observed = {
    rspFrequencies: hash(simulation.seatResponses.rsp.freqsHz),
    rspSpl: hash(simulation.seatResponses.rsp.splDb),
    perSeatResponses: hash(Object.fromEntries(Object.entries(simulation.seatResponses).filter(([id]) => id !== "rsp").map(([id, response]) => [id, { freqsHz: response.freqsHz, splDb: response.splDb }]))),
    fingerprints,
    selectedCandidate: hash(candidate),
    filterBank: hash(candidate.generatedFilterBank),
    postEqCurve: hash(candidate.finalPostEqCurve),
    parameters: hash({ p14: [candidate.achievedP14Level, candidate.achievedP14Db], p18: [candidate.achievedP18Level, candidate.achievedP18FrequencyHz], p19: [candidate.achievedP19Level, candidate.achievedP19VariationDb], p20: [candidate.achievedP20Level, candidate.achievedP20VariationDb] }),
  };
  const fields = Object.keys(observed);
  const results = fields.map((field) => ({ name: field, passed: EXPECTED != null && stable(observed[field]) === stable(EXPECTED[field]) }));
  const structuralAudit = {
    approvedFields: APPROVED_AUTHORITY_FIELDS,
    strippedCandidateHash: hash(withoutApprovedAuthorityFields(candidate)),
    expectedPreAuthorityHash: PRE_AUTHORITY_SELECTED_CANDIDATE_HASH,
    candidateIdentityPass: candidate?.candidateId === selected.selectedCandidateId
      && candidate?.candidateId === selected.productionCandidateId
      && candidate?.filterBankSignature === selected.filterBankSignature,
  };
  structuralAudit.approvedOnly = structuralAudit.strippedCandidateHash === structuralAudit.expectedPreAuthorityHash
    && structuralAudit.candidateIdentityPass;
  return {
    observed,
    results,
    structuralAudit,
    passed: results.filter((result) => result.passed).length,
    total: results.length,
    allPassed: results.every((result) => result.passed) && structuralAudit.approvedOnly,
  };
}