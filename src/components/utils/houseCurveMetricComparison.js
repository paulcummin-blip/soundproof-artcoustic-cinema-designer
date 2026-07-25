const finiteOrLarge = (value) => Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
const filterCount = (metrics) => {
  const bank = metrics?.generatedFilterBank;
  return Array.isArray(bank) ? bank.filter((filter) => filter?.enabled).length : 0;
};

const MAX_EQUIVALENCE_DB = 0.05;
const MEAN_EQUIVALENCE_DB = 0.05;
const RMS_EPSILON_DB = 0.01;

// Continuous acoustic comparison only. Compliance levels and thresholds are not inputs.
export function compareHouseCurveMetrics(a, b) {
  if (!a) return b ? 1 : 0;
  if (!b) return -1;
  if (Number.isFinite(a.rspMaxDeviationDb) && Number.isFinite(b.rspMaxDeviationDb)) {
    if (Math.abs(a.rspMaxDeviationDb - b.rspMaxDeviationDb) > MAX_EQUIVALENCE_DB) return a.rspMaxDeviationDb - b.rspMaxDeviationDb;
    if (Number.isFinite(a.rspRmsDeviationDb) && Number.isFinite(b.rspRmsDeviationDb)
      && Math.abs(a.rspRmsDeviationDb - b.rspRmsDeviationDb) > RMS_EPSILON_DB) return a.rspRmsDeviationDb - b.rspRmsDeviationDb;
  }
  const aWorst = finiteOrLarge(a.worstSeatMaxDeviationDb ?? a.worstRealSeatHouseCurveVariationDb);
  const bWorst = finiteOrLarge(b.worstSeatMaxDeviationDb ?? b.worstRealSeatHouseCurveVariationDb);
  if (Math.abs(aWorst - bWorst) > MAX_EQUIVALENCE_DB) return aWorst - bWorst;
  if (Number.isFinite(a.meanSeatMaxDeviationDb) && Number.isFinite(b.meanSeatMaxDeviationDb)
    && Math.abs(a.meanSeatMaxDeviationDb - b.meanSeatMaxDeviationDb) > MEAN_EQUIVALENCE_DB) {
    return a.meanSeatMaxDeviationDb - b.meanSeatMaxDeviationDb;
  }
  if (Number.isFinite(a.rmsSeatTargetErrorDb) && Number.isFinite(b.rmsSeatTargetErrorDb)
    && Math.abs(a.rmsSeatTargetErrorDb - b.rmsSeatTargetErrorDb) > RMS_EPSILON_DB) {
    return a.rmsSeatTargetErrorDb - b.rmsSeatTargetErrorDb;
  }
  const aRsp = finiteOrLarge(a.rspMaxDeviationDb);
  const bRsp = finiteOrLarge(b.rspMaxDeviationDb);
  if (Math.abs(aRsp - bRsp) > RMS_EPSILON_DB) return aRsp - bRsp;
  return filterCount(a) - filterCount(b);
}