const clampRequestedLevel = (value) => Math.max(1, Math.min(4, Math.round(Number(value) || 4)));

export function resolveRequestedRp22HouseCurveTarget(definitions, requestedLevel = 4) {
  const level = clampRequestedLevel(requestedLevel);
  const definition = (definitions || []).find((item) => item.value === level);
  return {
    requestedLevel: level,
    requestedLevelLabel: `L${level}`,
    targetAnchorDb: Number.isFinite(Number(definition?.p14TargetDb)) ? Number(definition.p14TargetDb) : null,
    targetBasis: definition?.p14TargetBasis ?? null,
    source: "requested-rp22-level",
  };
}