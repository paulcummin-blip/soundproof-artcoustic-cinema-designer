import { RP22_CATALOG } from "@/components/data/rp22Catalog";

export const isCatalogSeatScope = (scope) => {
  const normalized = String(scope || "").trim().toLowerCase();
  return normalized === "seat" || normalized === "per seat";
};

const displayUnit = (unit) => {
  const normalized = String(unit || "");
  if (normalized === "deg") return "°";
  if (normalized === "count") return "speakers";
  if (normalized === "yes/no") return "Yes/No";
  return normalized;
};

const displayDirection = (parameter) => {
  const direction = String(parameter?.direction || "").toLowerCase();
  if (parameter?.number === 21 || direction.includes("lower is better")) return "<=";
  if (direction === "allowed" || direction === "boolean") return "=";
  if (direction.includes("max")) return "<=";
  if (direction === "min") return ">=";
  return direction;
};

export const RP22_PRESENTATION_PARAMETERS = Object.values(RP22_CATALOG)
  .map((parameter) => ({
    id: parameter.number,
    number: parameter.number,
    title: parameter.title,
    scope: isCatalogSeatScope(parameter.scope) ? "Seat" : "Room",
    short: parameter.notes,
    unit: displayUnit(parameter.unit),
    thresholds: { direction: displayDirection(parameter), ...parameter.levels },
  }))
  .sort((left, right) => left.number - right.number);

export const RP22_SEAT_PARAMETERS = RP22_PRESENTATION_PARAMETERS.filter((parameter) => parameter.scope === "Seat");
export const RP22_SEAT_PARAMETER_KEYS = RP22_SEAT_PARAMETERS.map((parameter) => `p${parameter.number}`);

/**
 * Reusable RP22 headline presentation rule:
 * - Room-scoped parameter → headline shows the authoritative result.
 * - Seat-scoped parameter → headline shows "SEAT"; individual results belong
 *   in the per-seat presentation below. Never infer a headline from seats.
 */
export const isSeatScopedParameterKey = (paramKey) => {
  const num = parseInt(String(paramKey || "").replace(/^p/i, ""), 10);
  return RP22_SEAT_PARAMETERS.some((parameter) => parameter.number === num);
};

export const seatScopeHeadlinePill = (label) => ({
  label,
  resultText: "SEAT",
  text: `${label} SEAT`,
  level: "—",
  detail: null,
});

export const createEmptySeatRp22Metrics = () => Object.fromEntries(
  RP22_SEAT_PARAMETER_KEYS.map((key) => [key, { value: null, formatted: "—", level: "—" }])
);