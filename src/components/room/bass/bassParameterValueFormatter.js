// bassParameterValueFormatter.js — Dependency-safe extraction of
// formatBassParameterValue to break the circular import between
// bassResultsPresentation.js and bassCompliancePresentation.js.
//
// This module has NO imports back into either presentation module.
// Behaviour is identical to the original function — pure extraction.

import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";

const isFiniteNumber = (value) => value !== null
  && value !== undefined
  && value !== ""
  && typeof value !== "boolean"
  && Number.isFinite(Number(value));

const normalizeIntegerNoise = (value) => {
  const number = Number(value);
  const nearestInteger = Math.round(number);
  return Math.abs(number - nearestInteger) <= 1e-8 ? nearestInteger : number;
};

export function formatBassParameterValue(key, value) {
  if (!isFiniteNumber(value)) return "";
  const number = normalizeIntegerNoise(value);
  if (key === "p14") return `${Math.floor(number + 1e-8)} dBC`;
  if (key === "p18") return `${Math.floor(number)} Hz`;
  if (key === "p19" || key === "p20") {
    const pid = key === "p19" ? 19 : 20;
    const designVal = resolveRp22DesignValue(pid, Math.abs(number));
    return `±${designVal} dB`;
  }
  return `${number.toFixed(1)} dB`;
}