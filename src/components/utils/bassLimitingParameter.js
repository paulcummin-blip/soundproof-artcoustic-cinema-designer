const levelNumber = (value) => {
  const parsed = typeof value === "string" ? Number(value.replace(/^L/i, "")) : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(4, Math.round(parsed))) : null;
};

const DEFINITIONS = Object.freeze({
  p14: Object.freeze({
    name: "Estimated LFE Capability",
    limitation: "LFE output capability",
    reason: "Available continuous subwoofer output and post-EQ headroom set the lowest achieved RP22 level.",
    recommendation: "Improve by upgrading the subwoofer selection.",
  }),
  p18: Object.freeze({
    name: "Bass Extension",
    limitation: "Low frequency extension",
    reason: "The selected subwoofer system reaches its usable low-frequency limit before a higher RP22 extension level.",
    recommendation: "Improve by selecting a subwoofer with greater low-frequency extension.",
  }),
  p19: Object.freeze({
    name: "Seat Consistency",
    limitation: "Seat-to-seat consistency",
    reason: "Variation across the listening area sets the lowest achieved RP22 level.",
    recommendation: "Improve by adjusting subwoofer placement or adding additional subwoofers.",
  }),
  p20: Object.freeze({
    name: "Worst Seat Performance",
    limitation: "Worst-seat response",
    reason: "The largest response variation at the worst listening seat sets the lowest achieved RP22 level.",
    recommendation: "Improve by reviewing seating position or subwoofer placement.",
  }),
});

export function identifyBassLimitingParameter(candidate) {
  if (!candidate) return null;
  const entries = [
    ["p14", levelNumber(candidate.achievedP14Level)],
    ["p18", levelNumber(candidate.achievedP18Level)],
    ["p19", levelNumber(candidate.achievedP19Level)],
  ];
  if (candidate.p20Available === true && levelNumber(candidate.achievedP20Level) != null) {
    entries.push(["p20", levelNumber(candidate.achievedP20Level)]);
  }
  const available = entries.filter(([, level]) => level != null);
  if (!available.length) return null;
  const weakestLevel = Math.min(...available.map(([, level]) => level));
  if (weakestLevel === 4 && available.every(([, level]) => level === 4)) {
    return {
      parameterKey: "none",
      parameterName: "Balanced RP22 Outcome",
      achievedLevel: "L4",
      limitation: "No material RP22 bass limitation",
      reason: "All available RP22 bass parameters achieve L4 without relying on EQ to create unavailable output or extension.",
      recommendedImprovement: "No physical design change is required. Retain the current subwoofer and seating layout.",
      tiedParameters: [],
    };
  }
  const weakest = available.filter(([, level]) => level === weakestLevel);
  const [parameterKey] = weakest[0];
  const definition = DEFINITIONS[parameterKey];
  const tiedParameters = weakest.slice(1).map(([key]) => DEFINITIONS[key].name);
  const p20Seat = parameterKey === "p20" && candidate.worstP20SeatId ? ` (${candidate.worstP20SeatId})` : "";
  const tieDetail = tiedParameters.length ? ` Joint-lowest with ${tiedParameters.join(", ")}.` : "";
  return {
    parameterKey,
    parameterName: definition.name,
    achievedLevel: weakestLevel > 0 ? `L${weakestLevel}` : "FAIL",
    limitation: `${definition.limitation}${p20Seat}`,
    reason: `${definition.reason}${tieDetail}`,
    recommendedImprovement: definition.recommendation,
    tiedParameters,
  };
}