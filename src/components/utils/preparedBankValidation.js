import { peakingEqResponseDb } from "@/components/utils/designEqCalibration";

function filterSignature(filter) {
  return `${filter?.enabled ? 1 : 0}:${filter?.frequencyHz}:${filter?.gainDb}:${filter?.Q}`;
}

export function prepareBankValidation(raw, activeSubs, usableLfHz, requestedSystemOutputDb) {
  const frequencies = (raw || [])
    .filter((point) => point.frequency >= 20 && point.frequency <= 200)
    .map((point) => point.frequency);
  const permittedBoostDb = frequencies.map(() => 6);
  return { frequencies, permittedBoostDb, filterResponses: new Map() };
}

function responseForFilter(context, filter, operationCounts) {
  const key = filterSignature(filter);
  if (operationCounts) operationCounts.filterResponseRequests += 1;
  let response = context.filterResponses.get(key);
  if (response) return response;
  response = context.frequencies.map((frequency) => peakingEqResponseDb(frequency, filter));
  context.filterResponses.set(key, response);
  if (operationCounts) {
    operationCounts.uniqueFilterResponses += 1;
    operationCounts.bankFilterPointEvaluations += response.length;
  }
  return response;
}

export function evaluatePreparedBankLimits(context, filters, profile, operationCounts) {
  const maximumAggregateBoostDb = (profile?.maximumAggregateBoostDb ?? 6) + 0.05;
  const aggregateCutFloorDb = -((profile?.maximumCutDb ?? 10) + 0.05);
  const filterResponses = filters.map((filter) => responseForFilter(context, filter, operationCounts));
  let maxAggregateBoostDb = 0;
  let maxAggregateBoostHz = null;
  let maxAggregateBoostIndex = -1;
  let maxAggregateCutDb = 0;
  let maxAggregateCutHz = null;
  let boostLimitOk = true;
  let cutLimitOk = true;
  let sourceDomainHeadroomOk = true;
  for (let pointIndex = 0; pointIndex < context.frequencies.length; pointIndex += 1) {
    const aggregateDb = filterResponses.reduce((sum, response) => sum + response[pointIndex], 0);
    const frequency = context.frequencies[pointIndex];
    if (aggregateDb > maxAggregateBoostDb) {
      maxAggregateBoostDb = aggregateDb;
      maxAggregateBoostHz = frequency;
      maxAggregateBoostIndex = pointIndex;
    }
    if (aggregateDb < maxAggregateCutDb) {
      maxAggregateCutDb = aggregateDb;
      maxAggregateCutHz = frequency;
    }
    if (aggregateDb > maximumAggregateBoostDb) boostLimitOk = false;
    if (aggregateDb < aggregateCutFloorDb) cutLimitOk = false;

  }
  const limitingPermittedBoostDb = maxAggregateBoostIndex >= 0
    ? context.permittedBoostDb[maxAggregateBoostIndex]
    : 6;
  return {
    maxAggregateBoostDb, maxAggregateBoostHz, maxAggregateCutDb, maxAggregateCutHz,
    limitingPermittedBoostDb, boostLimitOk, cutLimitOk, sourceDomainHeadroomOk,
    allOk: boostLimitOk && cutLimitOk && sourceDomainHeadroomOk,
  };
}