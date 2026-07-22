import { RP22_SEAT_PARAMETERS } from "@/components/utils/rp22ParameterPresentation";
import { p20LevelText } from "@/components/room/bass/p20SeatPresentation";

const normalizeLevel = (level) => {
  if (typeof level === "number" && level >= 0 && level <= 4) return level === 0 ? "FAIL" : `L${level}`;
  const text = String(level || "").trim().toUpperCase();
  if (["L1", "L2", "L3", "L4", "FAIL", "N/A"].includes(text)) return text;
  return "—";
};

const finiteMetricValue = (metric) => {
  if (!metric || typeof metric !== "object") return null;
  for (const key of ["value", "valueM", "valueDb", "valueDeg", "valueHz"]) {
    if (Number.isFinite(Number(metric[key]))) return Number(metric[key]);
  }
  return null;
};

const formatFallback = (value, unit) => {
  if (!Number.isFinite(value)) return "—";
  if (unit === "m") return `${value.toFixed(2)}m`;
  if (unit === "°") return `${Math.round(value)}°`;
  if (unit === "± dB") return `±${Math.abs(value).toFixed(1)} dB`;
  if (unit === "dB") return `${value.toFixed(1)} dB`;
  return String(value);
};

export function presentSeatMetric(parameter, metric) {
  if (!metric || typeof metric !== "object") return { valueText: "—", level: "—" };
  const status = String(metric.status || "").toLowerCase();
  const formatted = String(metric.formatted ?? metric.hudLabel ?? "").trim();
  const notApplicable = status === "not_applicable" || formatted.toUpperCase() === "N/A" || formatted.toLowerCase().includes("insufficient data");
  if (notApplicable) return { valueText: "N/A", level: "N/A" };
  if (!formatted || formatted === "—" || formatted === "Not Calculated") return { valueText: "—", level: "—" };
  return { valueText: formatted || formatFallback(finiteMetricValue(metric), parameter.unit), level: normalizeLevel(metric.level) };
}

export function buildSeatHudParameterRows(snapshot) {
  const metrics = snapshot?.rp22 || {};
  return RP22_SEAT_PARAMETERS.map((parameter) => ({
    parameter,
    key: `p${parameter.number}`,
    ...presentSeatMetric(parameter, metrics[`p${parameter.number}`]),
  }));
}

export function attachAuthoritativeP20ToSeatSnapshot(snapshot, seatId, perSeatP20Results) {
  if (!snapshot) return snapshot;
  const result = (Array.isArray(perSeatP20Results) ? perSeatP20Results : [])
    .find((item) => String(item?.seatId || "") === String(seatId || ""));
  const p20Level = p20LevelText(result?.level);
  const valid = result && Number.isFinite(Number(result.variationDbRaw)) && p20Level !== "—";
  return {
    ...snapshot,
    rp22: {
      ...(snapshot.rp22 || {}),
      p20: valid ? {
        value: Number(result.variationDbRaw),
        valueDb: Number(result.variationDbRaw),
        formatted: result.displayVariationDb || "—",
        level: p20Level,
        source: "authoritative-perSeatP20Results",
      } : { value: null, formatted: "—", level: "—", source: "authoritative-perSeatP20Results" },
    },
  };
}