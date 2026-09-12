// gainRationaleBuilder.js
// Builds a human-readable explanation for WHY a gain (or delay) recommendation
// wins, using the actual canonical ranking authority — not hard-coded prose.
//
// The explanation identifies:
//   1. Which seats improved RP22 LEVELS (the ranking-dominant signal)
//   2. Whether the primary seat's raw deviation got worse (same-level trade-off)
//   3. Why the net result is still an improvement (level > same-level raw)
//
// This makes the ranking logic transparent to the designer so they can
// understand why a recommendation that increases primary raw deviation
// is still a net RP22 improvement.

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : 0;
}

function levelText(level) {
  const n = numericLevel(level);
  return n > 0 ? `L${n}` : "FAIL";
}

function fmtDb(raw) {
  if (!Number.isFinite(Number(raw))) return "—";
  return Math.abs(Number(raw)).toFixed(2);
}

/**
 * Build a per-seat level change map for a specific parameter (P19 or P20).
 * @returns {Array} [{ seatId, isPrimary, fromLevel, toLevel, improved, fromRaw, toRaw }]
 */
function buildSeatLevelChanges(currentResult, candidateResult, field) {
  const before = new Map((currentResult?.[field] || []).map((s) => [String(s.seatId), s]));
  const after = candidateResult?.[field] || [];
  return after.map((s) => {
    const prev = before.get(String(s.seatId));
    const fromLevel = numericLevel(prev?.level);
    const toLevel = numericLevel(s.level);
    return {
      seatId: s.seatId,
      isPrimary: !!s.isPrimary,
      fromLevel,
      toLevel,
      improved: toLevel > fromLevel,
      fromRaw: prev?.variationDbRaw,
      toRaw: s.variationDbRaw,
    };
  });
}

/**
 * Build the gain recommendation rationale text.
 *
 * @param {object} currentResult - the current/baseline canonical result
 * @param {object} candidateResult - the gain (or delay) candidate result
 * @param {object} [grouping] - optional grouping for group label
 * @returns {string} explanation text, or empty string if no explanation possible
 */
export function buildGainRationale(currentResult, candidateResult, grouping) {
  if (!currentResult || !candidateResult) return "";

  const p19Changes = buildSeatLevelChanges(currentResult, candidateResult, "perSeatP19");
  const p20Changes = buildSeatLevelChanges(currentResult, candidateResult, "perSeatP20");

  const improvedSeats = [
    ...p19Changes.filter((s) => s.improved).map((s) => ({ ...s, param: "P19" })),
    ...p20Changes.filter((s) => s.improved).map((s) => ({ ...s, param: "P20" })),
  ];

  const primaryP19 = p19Changes.find((s) => s.isPrimary) || p19Changes[0];
  const primaryP20 = p20Changes.find((s) => s.isPrimary) || p20Changes[0];

  const parts = [];

  // 1. Identify seats that improved RP22 levels
  if (improvedSeats.length > 0) {
    const seatLabels = improvedSeats.map((s) => {
      const scope = s.isPrimary ? "Primary" : "Secondary";
      return `${scope} seat${improvedSeats.filter((x) => x.seatId === s.seatId && !x.isPrimary).length > 0 ? "" : ""}`;
    });
    const uniqueSeats = new Map();
    for (const s of improvedSeats) {
      const key = `${s.isPrimary ? "Primary" : "Secondary"}_${s.seatId}`;
      if (!uniqueSeats.has(key)) uniqueSeats.set(key, s);
    }
    const seatParts = [...uniqueSeats.values()].map((s) => {
      const scope = s.isPrimary ? "Primary" : "Secondary";
      return `${scope} ${s.param} ${levelText(s.fromLevel)} → ${levelText(s.toLevel)}`;
    });
    parts.push(seatParts.join(", ") + ".");
  }

  // 2. Note primary raw deviation change if same-level
  if (primaryP19 && primaryP19.fromLevel === primaryP19.toLevel) {
    const fromRaw = fmtDb(primaryP19.fromRaw);
    const toRaw = fmtDb(primaryP19.toRaw);
    if (fromRaw !== "—" && toRaw !== "—" && Math.abs(parseFloat(toRaw) - parseFloat(fromRaw)) > 0.05) {
      const worse = parseFloat(toRaw) > parseFloat(fromRaw);
      parts.push(
        `Primary remains P19 ${levelText(primaryP19.toLevel)}, raw deviation ${fromRaw} → ${toRaw} dB${worse ? " (increased)" : ""}.`,
      );
    }
  }

  // 3. Explain the ranking logic
  if (improvedSeats.length > 0) {
    const hasSecondaryImprovement = improvedSeats.some((s) => !s.isPrimary);
    const hasPrimarySameLevel = primaryP19 && primaryP19.fromLevel === primaryP19.toLevel;
    if (hasSecondaryImprovement && hasPrimarySameLevel) {
      parts.push(
        "Net RP22 improvement: a level improvement for Secondary seats outranks a same-level raw-dB change at the Primary seat, while Primary safety is preserved.",
      );
    } else if (improvedSeats.length > 0) {
      parts.push("Net RP22 improvement: level improvements dominate the canonical ranking.");
    }
  }

  return parts.join(" ");
}

/**
 * Extract the actual gain adjustment from the candidate result.
 * @param {object} result - the gain candidate result
 * @returns {number} adjustment in dB (negative = cut)
 */
export function extractGainAdjustmentDb(result) {
  const groupedDelay = result?.groupedDelay;
  return Number(groupedDelay?.adjustmentDb) || 0;
}

/**
 * Extract the gain group label from the result + grouping.
 * @param {object} result - the gain candidate result
 * @param {object} [grouping] - optional grouping from diagnostics
 * @returns {string|null} group label
 */
export function extractGainGroupLabel(result, grouping) {
  const groupedDelay = result?.groupedDelay;
  if (!groupedDelay || !grouping?.groups?.length) return null;
  const group = grouping.groups.find((g) => g.id === groupedDelay.direction);
  return group?.label || null;
}