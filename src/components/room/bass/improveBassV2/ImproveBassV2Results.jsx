// ImproveBassV2Results.jsx
// Three-tier results display for the V2 workflow:
//   A. CURRENT DESIGN — always shown
//   B. RECOMMENDED CALIBRATION — only if calibration-only produced material improvement
//   C. OPTIMISED SUBWOOFER POSITION — shown if final winner changes physical positions
//
// P19/P20 headline = SEAT (per Sound Proof canonical presentation rule).
// Per-seat before→after evidence shown underneath.
// P14 target and capability are separated.
// P18 shows comparable achieved values.
// Materiality explanation surfaces the actual reason + primary-seat trade-offs.

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Wrench, Settings, AlertTriangle, FlaskConical, CheckCircle2, MapPin } from "lucide-react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { buildWhatChanged } from "./improveBassV2WhatChanged";
import { buildTreatmentAdvisory, buildRemainingLimitation } from "./improveBassV2Treatment";
import { isOptimisedApplied, buildCalibrationSummary } from "./improveBassV2Apply";
import CalibrationOnlyResults from "./CalibrationOnlyResults";
import V2SeatBeforeAfterGrid from "./V2SeatBeforeAfterGrid";

function levelText(level) {
  if (!Number.isFinite(level)) return "—";
  return level > 0 ? `L${level}` : "FAIL";
}

function numericLevel(value) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.min(4, Number(value)));
  const match = String(value || "").match(/^L([1-4])$/i);
  return match ? Number(match[1]) : null;
}

function deriveCurrentPositions(instances) {
  return (Array.isArray(instances) ? instances : [])
    .filter((s) => s.enabled !== false)
    .map((inst) => ({ x: Number(inst.position?.x) || 0, y: Number(inst.position?.y) || 0 }));
}

function deriveCurrentTuning(instances) {
  return (Array.isArray(instances) ? instances : [])
    .filter((s) => s.enabled !== false)
    .map((inst) => ({
      delayMs: Number(inst.delayMs) || 0,
      gainDb: Number(inst.gainDb) || 0,
      polarity: Number(inst.polarity) || 0,
    }));
}

function p14TargetLabel(level, db) {
  const lvl = numericLevel(level);
  const lt = lvl != null && lvl > 0 ? `L${lvl}` : "—";
  const dbText = Number.isFinite(Number(db)) ? `${Math.round(Number(db))} dBC` : "";
  return dbText ? `Minimum ${lt} / ${dbText}` : lt;
}

function p18Label(level, hz) {
  const lvl = numericLevel(level);
  const lt = lvl != null && lvl > 0 ? `L${lvl}` : "—";
  const hzText = Number.isFinite(Number(hz)) ? `${Math.round(Number(hz))} Hz` : "";
  return hzText ? `${hzText} / ${lt}` : lt;
}

// ── SEAT-scoped headline (P19/P20) ──────────────────────────────────────
function SeatScopedHeadline({ label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-[#213428]">{label}</span>
      <div className="flex items-center justify-center w-full">
        <span className="text-[11px] font-bold text-[#213428] bg-[#E7E4DF] rounded px-3 py-1">SEAT</span>
      </div>
    </div>
  );
}

// ── P14 Target (designer-selected, not achieved) ─────────────────────────
function P14TargetPill({ targetLevel, targetDb }) {
  const lvl = numericLevel(targetLevel) || 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-[#213428]">P14 Target</span>
      <div className="flex items-center justify-center w-full">
        <RP22GradingPill level={lvl} compact style={{ whiteSpace: "normal", minWidth: 0, flex: 1 }}>
          {p14TargetLabel(targetLevel, targetDb)}
        </RP22GradingPill>
      </div>
    </div>
  );
}

// ── P14 Capability (achieved before→after) ───────────────────────────────
function P14CapabilityPill({ currentLevel, currentDb, winnerLevel, winnerDb }) {
  const cur = numericLevel(currentLevel) || 0;
  const win = numericLevel(winnerLevel) || 0;
  const curText = cur > 0 ? `L${cur}` : "—";
  const winText = win > 0 ? `L${win}` : "—";
  const curDbText = Number.isFinite(Number(currentDb)) ? `${Number(currentDb).toFixed(1)} dBC` : "";
  const winDbText = Number.isFinite(Number(winnerDb)) ? `${Number(winnerDb).toFixed(1)} dBC` : "";
  const curDisplay = curDbText ? `${curDbText} / ${curText}` : curText;
  const winDisplay = winDbText ? `${winDbText} / ${winText}` : winText;
  const dbChanged = Number.isFinite(Number(currentDb)) && Number.isFinite(Number(winnerDb))
    && Math.abs(Number(currentDb) - Number(winnerDb)) > 0.05;
  const changed = cur !== win || dbChanged;
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-[#213428]">P14 Capability</span>
      <div className="flex items-center gap-1.5 w-full">
        {changed ? (
          <>
            <RP22GradingPill level={cur} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
              {curDisplay}
            </RP22GradingPill>
            <span className="text-[10px] text-[#8A7B6A]">→</span>
            <RP22GradingPill level={win} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
              {winDisplay}
            </RP22GradingPill>
          </>
        ) : (
          <RP22GradingPill level={cur} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
            {curDisplay}
          </RP22GradingPill>
        )}
      </div>
    </div>
  );
}

// ── P18 achieved before→after ────────────────────────────────────────────
function P18BeforeAfter({ beforeLevel, beforeHz, afterLevel, afterHz }) {
  const beforeText = p18Label(beforeLevel, beforeHz);
  const afterText = p18Label(afterLevel, afterHz);
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold text-[#213428]">P18</span>
      <div className="flex items-center gap-1.5 w-full">
        <RP22GradingPill level={numericLevel(beforeLevel) || 0} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
          {beforeText}
        </RP22GradingPill>
        <span className="text-[10px] text-[#8A7B6A]">→</span>
        <RP22GradingPill level={numericLevel(afterLevel) || 0} compact style={{ flex: 1, whiteSpace: "normal", minWidth: 0 }}>
          {afterText}
        </RP22GradingPill>
      </div>
    </div>
  );
}

// ── Materiality explanation + primary-seat trade-offs ────────────────────
function MaterialityExplanation({ reason, currentResult, winner, seatingPositions }) {
  if (!reason) return null;

  const REF_IDS = new Set(["rsp", "mlp", "synthetic-rsp", "synthetic_rsp"]);
  const tradeOffs = [];
  const beforeP19Map = new Map((currentResult?.perSeatP19 || []).map((s) => [String(s.seatId), s]));
  const afterP19Map = new Map((winner?.perSeatP19 || []).map((s) => [String(s.seatId), s]));
  const beforeP20Map = new Map((currentResult?.perSeatP20 || []).map((s) => [String(s.seatId), s]));
  const afterP20Map = new Map((winner?.perSeatP20 || []).map((s) => [String(s.seatId), s]));

  (Array.isArray(seatingPositions) ? seatingPositions : []).forEach((seat) => {
    const id = String(seat.id || seat.seatId || "");
    if (!id || REF_IDS.has(id.toLowerCase())) return;
    if (seat.priority === "secondary") return;

    const beforeP20 = beforeP20Map.get(id);
    const afterP20 = afterP20Map.get(id);
    if (beforeP20 && afterP20) {
      const beforeRaw = Math.abs(Number(beforeP20.variationDbRaw) || 0);
      const afterRaw = Math.abs(Number(afterP20.variationDbRaw) || 0);
      const delta = afterRaw - beforeRaw;
      const afterLevel = numericLevel(afterP20.level);
      if (delta > 0.05) {
        tradeOffs.push({ seatId: id, parameter: "P20", beforeRaw, afterRaw, delta, afterLevel });
      }
    }

    const beforeP19 = beforeP19Map.get(id);
    const afterP19 = afterP19Map.get(id);
    if (beforeP19 && afterP19) {
      const beforeRaw = Math.abs(Number(beforeP19.variationDbRaw) || 0);
      const afterRaw = Math.abs(Number(afterP19.variationDbRaw) || 0);
      const delta = afterRaw - beforeRaw;
      const afterLevel = numericLevel(afterP19.level);
      if (delta > 0.05) {
        tradeOffs.push({ seatId: id, parameter: "P19", beforeRaw, afterRaw, delta, afterLevel });
      }
    }
  });

  return (
    <div className="mt-2 rounded-md border border-[#E0DDD7] bg-[#F8F7F4] p-2">
      <div className="text-[10px] font-semibold text-[#213428]">Why this was recommended</div>
      <p className="mt-0.5 text-[10px] leading-relaxed text-[#625143]">{reason}</p>
      {tradeOffs.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {tradeOffs.map((t, i) => (
            <div key={i} className="text-[9px] text-[#625143]">
              Primary seat {t.seatId}: {t.parameter} {t.beforeRaw.toFixed(1)} → {t.afterRaw.toFixed(1)} dB; remains L{t.afterLevel}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Optimised Design headline grid (shared by position + global winners) ─
function OptimisedHeadlineGrid({ snapshot, currentResult, winner }) {
  const p14TargetLevel = snapshot?.p14TargetLevel;
  const p14TargetDb = snapshot?.p14TargetDb;
  const currentP14Level = currentResult?.p14AchievedLevel ?? snapshot?.currentP14;
  const currentP14Db = currentResult?.p14AchievedDb ?? null;
  const currentP18Level = currentResult?.p18AchievedLevel ?? snapshot?.currentP18;
  const currentP18Hz = currentResult?.achievedP18Hz;
  const afterP14Level = winner.p14AchievedLevel;
  const afterP14Db = winner.p14AchievedDb;
  const afterP18Level = winner.p18AchievedLevel;
  const afterP18Hz = winner.achievedP18Hz;

  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <SeatScopedHeadline label="P19" />
      <SeatScopedHeadline label="P20" />
      <P14TargetPill targetLevel={p14TargetLevel} targetDb={p14TargetDb} />
      <P14CapabilityPill currentLevel={currentP14Level} currentDb={currentP14Db} winnerLevel={afterP14Level} winnerDb={afterP14Db} />
      <P18BeforeAfter
        beforeLevel={currentP18Level}
        beforeHz={currentP18Hz}
        afterLevel={afterP18Level}
        afterHz={afterP18Hz}
      />
    </div>
  );
}

export default function ImproveBassV2Results({
  snapshot,
  selection,
  currentInstances,
  roomDims,
  seatingPositions,
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
  const currentP14Db = currentResult?.p14AchievedDb ?? null;
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

  // Derive current positions/tuning from currentInstances (startup snapshot
  // lacks positions — this fixes "subs added" false messaging).
  const currentPositions = deriveCurrentPositions(currentInstances);
  const currentTuning = deriveCurrentTuning(currentInstances);
  const augmentedSnapshot = {
    ...snapshot,
    positions: (snapshot?.positions && snapshot.positions.length > 0) ? snapshot.positions : currentPositions,
    tuning: (snapshot?.tuning && snapshot.tuning.length > 0) ? snapshot.tuning : currentTuning,
  };

  const whatChanged = buildWhatChanged(augmentedSnapshot, winner);
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
          <P14TargetPill targetLevel={snapshot?.p14TargetLevel} targetDb={snapshot?.p14TargetDb} />
          <P14CapabilityPill currentLevel={currentP14} currentDb={currentP14Db} winnerLevel={currentP14} winnerDb={currentP14Db} />
          <SeatScopedHeadline label="P19" />
          <SeatScopedHeadline label="P20" />
        </div>
      </div>

      {/* ── Calibration immaterial notice ── */}
      {selection.calibrationResult && !selection.calibrationMaterial?.material && (
        <div className="rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-2">
          <p className="text-[10px] leading-relaxed text-[#625143]">
            Calibration alone did not materially improve the room, so Sound Proof tested subwoofer position changes.
          </p>
        </div>
      )}

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

          {/* SEAT-scoped headline + P14 target/capability + P18 */}
          <OptimisedHeadlineGrid snapshot={snapshot} currentResult={currentResult} winner={winner} />

          {/* Materiality explanation */}
          <MaterialityExplanation
            reason={selection.materialityReason}
            currentResult={currentResult}
            winner={winner}
            seatingPositions={seatingPositions}
          />

          {/* Per-seat before→after evidence */}
          <div className="mt-3">
            <div className="text-[10px] font-semibold text-[#625143] mb-1.5">P19 / P20 per-seat evidence (before → after)</div>
            <V2SeatBeforeAfterGrid
              seatingPositions={seatingPositions}
              beforeP19={currentResult?.perSeatP19 || []}
              afterP19={winner.perSeatP19 || []}
              beforeP20={currentResult?.perSeatP20 || []}
              afterP20={winner.perSeatP20 || []}
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

          {/* Apply button — established Sound Proof primary action styling */}
          <div className="mt-3">
            <Button
              type="button"
              className="w-full bg-[#213428] text-white hover:bg-[#3E4349] font-semibold"
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
          <OptimisedHeadlineGrid snapshot={snapshot} currentResult={currentResult} winner={winner} />

          {/* Materiality explanation */}
          <MaterialityExplanation
            reason={selection.materialityReason}
            currentResult={currentResult}
            winner={winner}
            seatingPositions={seatingPositions}
          />

          {/* Per-seat before→after evidence */}
          <div className="mt-3">
            <div className="text-[10px] font-semibold text-[#625143] mb-1.5">P19 / P20 per-seat evidence (before → after)</div>
            <V2SeatBeforeAfterGrid
              seatingPositions={seatingPositions}
              beforeP19={currentResult?.perSeatP19 || []}
              afterP19={winner.perSeatP19 || []}
              beforeP20={currentResult?.perSeatP20 || []}
              afterP20={winner.perSeatP20 || []}
            />
          </div>
          <div className="mt-3">
            <Button
              type="button"
              className="w-full bg-[#213428] text-white hover:bg-[#3E4349] font-semibold"
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