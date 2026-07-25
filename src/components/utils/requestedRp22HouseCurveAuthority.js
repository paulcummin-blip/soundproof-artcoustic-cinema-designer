const clampRequestedLevel = (value) => Math.max(1, Math.min(4, Math.round(Number(value) || 4)));

export function resolveRequestedRp22HouseCurveTarget(definitions, requestedLevel = 4) {
  const level = clampRequestedLevel(requestedLevel);
  const definition = (definitions || []).find((item) => item.value === level);
  return Object.freeze({
    requestedLevel: level,
    requestedLevelLabel: `L${level}`,
    targetAnchorDb: Number.isFinite(Number(definition?.p14TargetDb)) ? Number(definition.p14TargetDb) : null,
    targetExtensionHz: Number.isFinite(Number(definition?.p18LimitHz)) ? Number(definition.p18LimitHz) : null,
    targetConsistencyToleranceDb: Number.isFinite(Number(definition?.p19ToleranceDb)) ? Number(definition.p19ToleranceDb) : null,
    targetSeatToSeatToleranceDb: Number.isFinite(Number(definition?.p20ToleranceDb)) ? Number(definition.p20ToleranceDb) : null,
    targetBasis: definition?.p14TargetBasis ?? null,
    definitionAvailable: !!definition,
    source: "designer-selected-rp22-level",
  });
}