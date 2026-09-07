// CalibrationOnlyResults.jsx
// Three-tier result display for Stage 11A: Current (A) vs Recommended Calibration (B).
// Shows P19/P20 before/after, tuning changes, and Apply Calibration button.
// Tier C (Optimised Position) is reserved for Stage 11B.

import React from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Settings, AlertCircle } from "lucide-react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { buildCalibrationChangeSummary, isCalibrationApplied } from "./improveBassV2ApplyCalibration";

function levelText(level) {
  if (!Number.isFinite(level)) return "\u2014";
  return level > 0 ? `L${level}` : "FAIL";
}

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : null;
}

function TierPill({ label, level, text }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-[#213428]">{label}</span>
      <RP22GradingPill level={level} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
        {text}
      </RP22GradingPill>
    </div>
  );
}

export default function CalibrationOnlyResults({
  currentResult,
  calibrationResult,
  calibrationMaterial,
  calibrationTuning,
  currentInstances,
  onApplyCalibration,
}) {
  if (!calibrationResult) return null;

  const applied = isCalibrationApplied(currentInstances, calibrationTuning);
  const changes = buildCalibrationChangeSummary(currentInstances, calibrationTuning);

  const beforeP19 = numericLevel(currentResult?.achievedP19Level);
  const afterP19 = numericLevel(calibrationResult.achievedP19Level);
  const beforeP20 = numericLevel(currentResult?.achievedP20Level);
  const afterP20 = numericLevel(calibrationResult.achievedP20Level);

  // Not material
  if (!calibrationMaterial?.material) {
    return (
      <div className="mt-3 rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[#213428]" />
          <span className="text-[12px] font-semibold text-[#213428]">
            NO MATERIAL CALIBRATION IMPROVEMENT FOUND
          </span>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-[#8A7B6A]">
          {calibrationMaterial?.reason || "Current calibration is already near-optimal."}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <TierPill label="Current P19" level={beforeP19} text={levelText(beforeP19)} />
          <TierPill label="Current P20" level={beforeP20} text={levelText(beforeP20)} />
        </div>
      </div>
    );
  }

  // Material improvement
  const hasChanges = (changes?.delays?.length || 0) + (changes?.trims?.length || 0) + (changes?.polarities?.length || 0) > 0;

  return (
    <div className="mt-3 rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3">
      {/* Tier labels */}
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">
        Calibration Improvement
      </div>

      {/* Before -> After headline */}
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TierPill label="P19 Current" level={beforeP19} text={levelText(beforeP19)} />
        <TierPill label="P19 Calibrated" level={afterP19} text={levelText(afterP19)} />
        <TierPill label="P20 Current" level={beforeP20} text={levelText(beforeP20)} />
        <TierPill label="P20 Calibrated" level={afterP20} text={levelText(afterP20)} />
      </div>

      {/* Materiality reason */}
      <div className="mt-2 text-[10px] leading-relaxed text-[#213428]">
        <strong>{calibrationMaterial.reason}</strong>
      </div>

      {/* Tuning changes */}
      {hasChanges && (
        <div className="mt-3 rounded-md border border-[#E0DDD7] bg-white p-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#213428]">
            <Settings className="h-3 w-3" />
            Calibration changes
          </div>
          <ul className="mt-1 space-y-0.5">
            {changes.polarities.map((c, i) => (
              <li key={`pol-${i}`} className="text-[10px] leading-relaxed text-[#625143]">&bull; {c}</li>
            ))}
            {changes.delays.map((c, i) => (
              <li key={`del-${i}`} className="text-[10px] leading-relaxed text-[#625143]">&bull; {c}</li>
            ))}
            {changes.trims.map((c, i) => (
              <li key={`trim-${i}`} className="text-[10px] leading-relaxed text-[#625143]">&bull; {c}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-[9px] italic text-[#8A7B6A]">
            Calibration settings are reproduced in the processor by the installer.
          </p>
        </div>
      )}

      {/* Apply button */}
      <div className="mt-3">
        <Button
          type="button"
          size="sm"
          className="w-full bg-[#213428] text-white hover:bg-[#3E4349]"
          onClick={onApplyCalibration}
          disabled={applied}
        >
          {applied ? "Calibration Applied" : "Apply Calibration"}
        </Button>
      </div>
    </div>
  );
}