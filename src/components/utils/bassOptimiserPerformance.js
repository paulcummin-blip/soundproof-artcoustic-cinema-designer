const OPERATION_FIELDS = [
  "curveEvaluationRequests",
  "uniqueCurveFilterEvaluations",
  "reusedCurveEvaluationRequests",
  "metricGridPreparationRequests",
  "uniqueMetricGridPreparations",
  "perSeatMetricEvaluations",
  "uniquePerSeatMetricEvaluations",
  "reusedPerSeatMetricEvaluations",
  "bankValidationRequests",
  "uniqueBankValidations",
  "reusedBankValidations",
  "filterResponseRequests",
  "uniqueFilterResponses",
  "bankFilterPointEvaluations",
  "filterPointEvaluations",
];

export function summarizeCoreOperations(eqResults) {
  const results = Array.from(eqResults || []);
  return Object.fromEntries(OPERATION_FIELDS.map((field) => [
    field,
    results.reduce((sum, eq) => sum + (eq.operationCounts?.[field] || 0), 0),
  ]));
}