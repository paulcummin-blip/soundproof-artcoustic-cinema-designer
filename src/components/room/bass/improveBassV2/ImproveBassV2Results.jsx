// ImproveBassV2Results.jsx
// Three-tier results display for the V2 workflow:
//   A. CURRENT DESIGN — always shown
//   B. RECOMMENDED CALIBRATION — only if calibration-only produced material improvement
//   C. OPTIMISED SUBWOOFER POSITION — shown if final winner changes physical positions
//
// Shows P19/P20 raw before→after, displayed level before→after,
// meaningful physical changes, and calibration changes.
// No internal candidate IDs or lowercase model identifiers shown.

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Wrench, Settings, AlertTriangle, FlaskConical, CheckCircle2, MapPin } from "lucide-react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import SharedP19P20SeatResults from "@/components/room/bass/SharedP19P20SeatResults";
import { buildWhatChanged } from "./improveBassV2WhatChanged";
import { buildTreatmentAdvisory, buildRemainingLimitation } from "./improveBassV2Treatment";
import { isOptimisedApplied, buildCalibrationSummary } from "./improveBassV2Apply";
import CalibrationOnlyResults from "./CalibrationOnlyResults";

function levelText(level) {
  if (!Number.isFinite(level)) return "—";
  return level > 0 ? `L${level}` : "FAIL";
}

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : null;
}

function BeforeAfterPill({ label, beforeLevel, afterLevel, beforeText, afterText }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-[#213428]">{label}</span>
      <div className="flex items-center gap-1.5 w-full">
        <RP22GradingPill level={beforeLevel} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
          {beforeText}
        </RP22GradingPill>
        <span className="text-[10px] text-[#8A7B6A]">→</span>
        <RP22GradingPill level={afterLevel} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
          {afterText}
        </RP22GradingPill>
      </div>
    </div>
  );
}

function BeforeAfterDb({ label, beforeLevel, afterLevel, beforeDb, afterDb }) {
  const fmtDb = (v) => v != null && Number.isFinite(v) ? `${v.toFixed(1)} dB` : "—";
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-[#213428]">{label}</span>
      <div className="flex items-center gap-1.5 w-full">
        <RP22GradingPill level={beforeLevel} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
          {fmtDb(beforeDb)}
        </RP22GradingPill>
        <span className="text-[10px] text-[#8A7B6A]">→</span>
        <RP22GradingPill level={afterLevel} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
          {fmtDb(afterDb)}
        </RP22GradingPill>
      </div>
      <div className="flex items-center gap-1.5 w-full text-[9px] text-[#8A7B6A]">
        <span style={{ flex: 1, textAlign: "center" }}>{levelText(beforeLevel)}</span>
        <span>→</span>
        <span style={{ flex: 1, textAlign: "center" }}>{levelText(afterLevel)}</span>
      </div>
    </div>
  );
}

export default function ImproveBassV2Results({
  snapshot,
  selection,
  currentInstances,
  roomDims,
  onApply,
  onApplyCalibration,
}) {
  const [showChanges, setShowChanges] = useState(false);

  if (!selection) return null;

  const winner = selection.winner;
  const currentResult = selection.currentResult;
  const isPositionWinner = winner && !selection.isCurrent && winner.isPositionCandidate;

  // ── Tier A: CURRENT DESIGN — always shown ────────────────────────────
  const currentP19 = numericLevel(currentResult?.achievedP19Level ?? snapshot?.currentP19);
  const currentP20 = numericLevel(currentResult?.achievedP20Level ?? snapshot?.currentP20);
  const currentP14 = numericLevel(currentResult?.p14AchievedLevel ?? snapshot?.currentP14);
  const currentP18 = numericLevel(currentResult?.p18AchievedLevel ?? snapshot?.currentP18);

  // ── Tier B: RECOMMENDED CALIBRATION ──────────────────────────────────
  const showCalibration = selection.calibrationResult && selection.calibrationMaterial?.material;

  // ── Tier C: OPTIMISED SUBWOOFER POSITION ──────────────────────────────
  const showPosition = isPositionWinner;

  // No safer improvement found
  if (selection.isCurrent || !winner) {
    return (
      <div className="mt-3 rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[#213428]" />
          <span className="text-[12px] font-semibold text-[#213428]">
            {selection.message || "No safer automatic improvement found — current design retained"}
          </span>
        </div>
        {selection.rejectionReason && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-[#8A7B6A]">{selection.rejectionReason}</p>
        )}
        {selection.positionOptimisation?.subOptimisationExhausted && !selection.positionOptimisation?.materialSubImprovementFound && (
          <p className="mt-1.5 text-[10px] italic text-[#8A7B6A]">
            All practical subwoofer search tiers exhausted. Consider seating adjustments or additional subwoofers.
          </p>
        )}
      </div>
    );
  }

  // Winner values
  const afterP14 = numericLevel(winner.p14AchievedLevel);
  const afterP18 = numericLevel(winner.p18AchievedLevel);
  const afterP19 = numericLevel(winner.achievedP19Level);
  const afterP20 = numericLevel(winner.achievedP20Level);
  const afterP19Db = winner.achievedP19VariationDb;
  const afterP20Db = winner.achievedP20VariationDb;
  const beforeP19Db = currentResult?.achievedP19VariationDb;
  const beforeP20Db = currentResult?.achievedP20VariationDb;

  const whatChanged = buildWhatChanged(snapshot, winner);
  const treatmentAdvisory = buildTreatmentAdvisory(winner, roomDims);
  const remainingLimitation = buildRemainingLimitation(winner);
  const calSummary = buildCalibrationSummary(winner);
  const applied = isOptimisedApplied(currentInstances, winner, roomDims);

  const movement = winner.movementDescription || "Position optimised";
  const phaseLabel = winner.positionPhase === "asymmetric-pair" ? "Asymmetric"
    : winner.positionPhase === "individual" ? "Individual"
    : "Symmetric";

  return (
    <div className="mt-3 space-y-3">
      {/* ── Tier A: Current Design ── */}
      <div className="rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Current Design</div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <BeforeAfterPill label="P14" beforeLevel={currentP14} afterLevel={currentP14} beforeText={levelText(currentP14)} afterText={levelText(currentP14)} />
          <BeforeAfterPill label="P18" beforeLevel={currentP18} afterLevel={currentP18} beforeText={levelText(currentP18)} afterText={levelText(currentP18)} />
          <BeforeAfterPill label="P19" beforeLevel={currentP19} afterLevel={currentP19} beforeText={levelText(currentP19)} afterText={levelText(currentP19)} />
          <BeforeAfterPill label="P20" beforeLevel={currentP20} afterLevel={currentP20} beforeText={levelText(currentP20)} afterText={levelText(currentP20)} />
        </div>
      </div>

      {/* ── Tier B: Recommended Calibration ── */}
      {showCalibration && (
        <CalibrationOnlyResults
          currentResult={currentResult || snapshot}
          calibrationResult={selection.calibrationResult}
          calibrationMaterial={selection.calibrationMaterial}
          calibrationTuning={selection.calibrationTuning}
          currentInstances={currentInstances}
          onApplyCalibration={onApplyCalibration}
        />
      )}

      {/* ── Tier C: Optimised Subwoofer Position ── */}
      {showPosition && (
        <div className="rounded-md border border-[#213428] bg-[#F8F7F4] p-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#213428]" />
            <span className="text-[12px] font-semibold text-[#213428]">Optimised Subwoofer Position</span>
            {winner.positionPhase !== "symmetric" && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                {phaseLabel}
              </span>
            )}
          </div>

          {/* Movement description */}
          <div className="mt-2 text-[11px] text-[#625143] font-medium">{movement}</div>

          {/* Before → After with raw dB + displayed levels */}
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <BeforeAfterDb
              label="P19"
              beforeLevel={currentP19}
              afterLevel={afterP19}
              beforeDb={beforeP19Db}
              afterDb={afterP19Db}
            />
            <BeforeAfterDb
              label="P20"
              beforeLevel={currentP20}
              afterLevel={afterP20}
              beforeDb={beforeP20Db}
              afterDb={afterP20Db}
            />
            <BeforeAfterPill
              label="P14"
              beforeLevel={currentP14}
              afterLevel={afterP14}
              beforeText={levelText(currentP14)}
              afterText={levelText(afterP14)}
            />
            <BeforeAfterPill
              label="P18"
              beforeLevel={currentP18}
              afterLevel={afterP18}
              beforeText={levelText(currentP18)}
              afterText={levelText(afterP18)}
            />
          </div>

          {/* P19/P20 per-seat results (After) */}
          <div className="mt-3">
            <div className="text-[10px] font-semibold text-[#625143] mb-1.5">P19 / P20 seat results (optimised)</div>
            <SharedP19P20SeatResults
              p19Rows={winner.perSeatP19 || []}
              p20Rows={winner.perSeatP20 || []}
              publicationVerified
              authorityStatus="COMPLETE"
              p14TargetUnselected={false}
              compact
            />
          </div>

          {/* Physical changes + Calibration settings */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowChanges(!showChanges)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-[#213428] hover:underline"
            >
              {showChanges ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              What changed
            </button>
            {showChanges && (
              <div className="mt-2 space-y-2">
                {whatChanged.designChanges.length > 0 && (
                  <div className="rounded-md border border-[#E0DDD7] bg-white p-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#213428]">
                      <Wrench className="h-3 w-3" />
                      Design changes
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {whatChanged.designChanges.map((change, i) => (
                        <li key={i} className="text-[10px] leading-relaxed text-[#625143]">• {change}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {whatChanged.calibrationChanges.length > 0 && (
                  <div className="rounded-md border border-[#E0DDD7] bg-white p-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#213428]">
                      <Settings className="h-3 w-3" />
                      Calibration settings
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {whatChanged.calibrationChanges.map((change, i) => (
                        <li key={i} className="text-[10px] leading-relaxed text-[#625143]">• {change}</li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[9px] italic text-[#8A7B6A]">
                      Calibration settings are reproduced in the processor by the installer.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Remaining limitation */}
          {remainingLimitation && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-700 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] font-semibold text-amber-800">Remaining limitation</div>
                <p className="text-[10px] leading-relaxed text-amber-700">{remainingLimitation}</p>
              </div>
            </div>
          )}

          {/* Treatment advisory */}
          {treatmentAdvisory?.showAdvisory && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-[#E0DDD7] bg-white p-2">
              <FlaskConical className="h-3.5 w-3.5 text-[#625143] mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] font-semibold text-[#213428]">{treatmentAdvisory.title}</div>
                <p className="text-[10px] leading-relaxed text-[#625143]">{treatmentAdvisory.body}</p>
              </div>
            </div>
          )}

          {/* Apply button */}
          <div className="mt-3">
            <Button
              type="button"
              size="sm"
              className="w-full bg-[#213428] text-white hover:bg-[#3E4349]"
              onClick={onApply}
              disabled={applied}
            >
              {applied ? "Applied" : "Apply Optimised Design"}
            </Button>
          </div>
        </div>
      )}

      {/* Non-position winner (global placement) — show in original format */}
      {!showPosition && !showCalibration && (
        <div className="rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Before → After</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <BeforeAfterPill label="P14" beforeLevel={currentP14} afterLevel={afterP14} beforeText={levelText(currentP14)} afterText={levelText(afterP14)} />
            <BeforeAfterPill label="P18" beforeLevel={currentP18} afterLevel={afterP18} beforeText={levelText(currentP18)} afterText={levelText(afterP18)} />
            <BeforeAfterPill label="P19" beforeLevel={currentP19} afterLevel={afterP19} beforeText={levelText(currentP19)} afterText={levelText(afterP19)} />
            <BeforeAfterPill label="P20" beforeLevel={currentP20} afterLevel={afterP20} beforeText={levelText(currentP20)} afterText={levelText(afterP20)} />
          </div>
          <div className="mt-3">
            <div className="text-[10px] font-semibold text-[#625143] mb-1.5">P19 / P20 seat results (optimised)</div>
            <SharedP19P20SeatResults
              p19Rows={winner.perSeatP19 || []}
              p20Rows={winner.perSeatP20 || []}
              publicationVerified
              authorityStatus="COMPLETE"
              p14TargetUnselected={false}
              compact
            />
          </div>
          <div className="mt-3">
            <Button
              type="button"
              size="sm"
              className="w-full bg-[#213428] text-white hover:bg-[#3E4349]"
              onClick={onApply}
              disabled={applied}
            >
              {applied ? "Applied" : "Apply Optimised Design"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}