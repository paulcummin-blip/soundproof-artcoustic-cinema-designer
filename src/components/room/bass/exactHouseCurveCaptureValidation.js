const finite = (value) => Number.isFinite(Number(value));
const close = (a, b, tolerance = 1e-9) => finite(a) && finite(b) && Math.abs(Number(a) - Number(b)) <= tolerance;

export const serializeSplCurve = (curve) => (Array.isArray(curve) ? curve : [])
  .filter((point) => finite(point?.frequency) && finite(point?.spl))
  .map((point) => ({ frequency: Number(point.frequency), spl: Number(point.spl) }));

export const serializeEqCurve = (curve) => (Array.isArray(curve) ? curve : [])
  .filter((point) => finite(point?.frequency) && finite(point?.gainDb ?? point?.spl))
  .map((point) => ({ frequency: Number(point.frequency), gainDb: Number(point.gainDb ?? point.spl) }));

export const serializeTargetCurve = (curve) => serializeSplCurve(curve);

const strictlyIncreasing = (curve) => curve.every((point, index) => index === 0 || point.frequency > curve[index - 1].frequency);
const sameCurve = (left, right, valueKey, tolerance = 1e-9) => left.length === right.length && left.every((point, index) => (
  close(point.frequency, right[index]?.frequency, tolerance) && close(point[valueKey], right[index]?.[valueKey], tolerance)
));

const parameterParity = (candidate, parameters) => {
  const pairs = [
    ["p14", candidate?.achievedP14Level, candidate?.achievedP14Db],
    ["p18", candidate?.achievedP18Level, candidate?.achievedP18FrequencyHz],
    ["p19", candidate?.achievedP19Level, candidate?.achievedP19VariationDb],
    ["p20", candidate?.achievedP20Level, candidate?.achievedP20VariationDb],
  ];
  return pairs.every(([key, level, value]) => {
    const live = parameters?.[key];
    if (live?.status === "not_applicable") return key === "p20" && !candidate?.p20Available;
    return live && close(live.level, level) && close(live.value, value);
  });
};

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function contentFingerprint(value) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `exact-case-v2-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function validateExactHouseCurveCapture(capture, live) {
  const failures = [];
  const before = capture.productionSeries.rspBeforeEq.data;
  const after = capture.productionSeries.rspAfterEq.data;
  const eq = capture.aggregateEqResponse;
  const targets = [capture.productionHouseCurveTarget, capture.graphHouseCurveTarget, capture.fitterHouseCurveTarget];
  const namedCurves = [
    ["RSP before EQ", before, "spl"], ["RSP after EQ", after, "spl"],
    ["aggregate EQ", eq, "gainDb"], ["production target", targets[0], "spl"],
    ["graph target", targets[1], "spl"], ["fitter target", targets[2], "spl"],
  ];
  namedCurves.forEach(([name, curve, key]) => {
    if (!curve.length) failures.push(`${name} is empty`);
    else if (!strictlyIncreasing(curve)) failures.push(`${name} frequencies are not strictly increasing`);
    else if (!curve.every((point) => finite(point.frequency) && finite(point[key]))) failures.push(`${name} contains non-finite values`);
  });
  if (!sameCurve(before, after, "spl", Infinity) || !sameCurve(before.map(({ frequency }) => ({ frequency, value: 0 })), eq.map(({ frequency }) => ({ frequency, value: 0 })), "value")) {
    failures.push("before, after and aggregate EQ frequency grids differ");
  }
  let maximumError = null;
  if (before.length && before.length === after.length && before.length === eq.length) {
    maximumError = Math.max(...before.map((point, index) => Math.abs(after[index].spl - point.spl - eq[index].gainDb)));
    if (maximumError > 1e-9) failures.push(`after-EQ reconstruction error is ${maximumError} dB`);
  }
  if (!sameCurve(targets[0], targets[1], "spl") || !sameCurve(targets[0], targets[2], "spl")) failures.push("production, graph and fitter targets differ");
  const assessmentTargets = targets[0].filter((point) => point.frequency >= capture.assessment.startHz && point.frequency <= capture.assessment.endHz);
  if (!assessmentTargets.length || !assessmentTargets.every((point) => finite(point.spl))) failures.push("target is incomplete in the assessment band");
  if (capture.targetSource !== "exact-live-authority") failures.push("target authority is reconstructed fallback");
  if (live.designEqEnabled && !capture.selectedFilterBank.some((filter) => filter?.enabled)) failures.push("selected EQ filter bank is empty");
  if (!sameCurve(after, serializeSplCurve(live.candidate?.finalPostEqCurve), "spl") || !sameCurve(after, serializeSplCurve(live.result?.finalPostEqCurve), "spl")) failures.push("exported final curve differs from selected candidate or production result");
  if (!parameterParity(live.candidate, capture.parameters)) failures.push("P14–P20 values differ from the live contract");
  const ids = [capture.captureValidation.graphCandidateId, capture.captureValidation.contractCandidateId, capture.captureValidation.productionCandidateId];
  const signatures = [live.graphFilterBankSignature, live.contractFilterBankSignature, live.productionFilterBankSignature];
  const identityPass = ids.every(Boolean) && new Set(ids).size === 1 && signatures.every(Boolean) && new Set(signatures).size === 1;
  if (!identityPass) failures.push("graph, contract and production candidate identity differs");
  if (live.detailedStatus !== "COMPLETE") failures.push(`analysis status is ${live.detailedStatus || "unavailable"}, not COMPLETE`);
  return { valid: failures.length === 0, failures, maximumAfterEqReconstructionErrorDb: maximumError, graphCandidateId: ids[0], contractCandidateId: ids[1], productionCandidateId: ids[2], identityPass };
}