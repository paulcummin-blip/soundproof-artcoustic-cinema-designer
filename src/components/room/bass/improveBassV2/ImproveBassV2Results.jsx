// ImproveBassV2Results.jsx
// Ranked recommendation cards for the V2 Improve Bass Response results.
//
// Shows:
//   - Current Design summary (always)
//   - Calibration immaterial notice (if calibration found nothing)
//   - Ranked recommendation cards (level change > raw improvement > practical priority)
//   - Per-seat before→after evidence for the winner
//   - Remaining limitation + treatment advisory for the winner
//
// The canonical winner from selectWinnerWithProtection is always #1.
// Other material improvements are ranked below using the user's hierarchy.

import React from "react";
import { AlertTriangle, FlaskConical, CheckCircle2 } from "lucide-react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { buildTreatmentAdvisory, buildRemainingLimitation } from "./improveBassV2Treatment";
import { isOptimisedApplied } from "./improveBassV2Apply";
import V2SeatBeforeAfterGrid from "./V2SeatBeforeAfterGrid";
import RecommendationCard from "./RecommendationCard";
import { rankRecommendations } from "./recommendationRanker.js";

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
  const curDbText = (currentDb != null && Number.isFinite(Number(currentDb))) ? `${Number(currentDb).toFixed(1)} dBC` : "";
  const winDbText = (winnerDb != null && Number.isFinite(Number(winnerDb))) ? `${Number(winnerDb).toFixed(1)} dBC` : "";
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

// ── Derived materiality explanation (from canonical before/after metrics) ──
// Used ONLY when the engine's materialityReason is null (e.g. compact-contract
// per-seat results lack isPrimary, preventing the engine's Path B from firing).
// This formats the SAME canonical before/after evidence the engine already
// computed — it does NOT re-evaluate materiality or create a second gate.
function deriveMaterialityExplanation(currentResult, winner, seatingPositions) {
  if (!currentResult || !winner) return null;

  const beforeP20 = Array.isArray(currentResult.perSeatP20) ? currentResult.perSeatP20 : [];
  const afterP20 = Array.isArray(winner.perSeatP20) ? winner.perSeatP20 : [];
  if (!beforeP20.length || !afterP20.length) return null;

  const beforeMap = new Map(beforeP20.map((s) => [String(s.seatId), s]));
  const afterMap = new Map(afterP20.map((s) => [String(s.seatId), s]));

  // Worst-seat P20 (all seats, excluding RSP/synthetic)
  const REF_IDS = new Set(["rsp", "mlp", "synthetic-rsp", "synthetic_rsp"]);
  let worstBefore = 0;
  let worstAfter = 0;
  let worstSeatId = null;
  for (const seat of afterP20) {
    const id = String(seat.seatId || "");
    if (REF_IDS.has(id.toLowerCase())) continue;
    const beforeSeat = beforeMap.get(id);
    if (!beforeSeat) continue;
    const bRaw = Math.abs(Number(beforeSeat.variationDbRaw) || 0);
    const aRaw = Math.abs(Number(seat.variationDbRaw) || 0);
    if (aRaw > worstAfter) { worstAfter = aRaw; worstSeatId = id; }
    if (bRaw > worstBefore) worstBefore = bRaw;
  }
  // Use the worst-seat's before value for the comparison
  if (worstSeatId) {
    const beforeSeat = beforeMap.get(worstSeatId);
    if (beforeSeat) worstBefore = Math.abs(Number(beforeSeat.variationDbRaw) || 0);
  }

  const worstImprovement = worstBefore - worstAfter;
  if (worstImprovement < 0.5) return null; // no meaningful improvement

  // Primary seats: check they did not regress
  const primarySeatIds = new Set(
    (Array.isArray(seatingPositions) ? seatingPositions : [])
      .filter((s) => s.priority !== "secondary")
      .map((s) => String(s.id || s.seatId || ""))
      .filter((id) => id && !REF_IDS.has(id.toLowerCase()))
  );

  let primaryImproved = 0;
  let primarySame = 0;
  let primaryRegressed = 0;
  for (const id of primarySeatIds) {
    const before = beforeMap.get(id);
    const after = afterMap.get(id);
    if (!before || !after) continue;
    const bRaw = Math.abs(Number(before.variationDbRaw) || 0);
    const aRaw = Math.abs(Number(after.variationDbRaw) || 0);
    if (aRaw < bRaw - 0.05) primaryImproved++;
    else if (Math.abs(aRaw - bRaw) <= 0.05) primarySame++;
    else if (aRaw > bRaw + 0.05) primaryRegressed++;
  }

  if (primaryRegressed > 0) return null; // primary seats regressed — don't explain

  const parts = [];
  parts.push(`Seat-to-seat bass consistency improves materially. Worst-seat P20 reduces from ${worstBefore.toFixed(1)} dB to ${worstAfter.toFixed(1)} dB`);
  if (primaryImproved > 0 && primarySame > 0) {
    parts.push(`while ${primaryImproved} primary seat${primaryImproved > 1 ? "s" : ""} also improve${primaryImproved > 1 ? "" : "s"}`);
  } else if (primaryImproved > 0) {
    parts.push(`while all ${primaryImproved} primary seat${primaryImproved > 1 ? "s" : ""} improve${primaryImproved > 1 ? "" : "s"}`);
  } else if (primarySame > 0) {
    parts.push(`while ${primarySame} primary seat${primarySame > 1 ? "s" : ""} remain${primarySame > 1 ? "" : "s"} unchanged`);
  }
  parts.push(".");

  return parts.join(", ").replace(/\.$/, ".");
}

// ── Materiality explanation + primary-seat trade-offs ────────────────────
function MaterialityExplanation({ reason, currentResult, winner, seatingPositions }) {
  // If the engine provided a canonical materiality reason, use it.
  // Otherwise derive a presentation string from the canonical before/after
  // metrics (option 2/3 in the authority hierarchy). This does NOT re-evaluate
  // materiality — it formats the evidence the engine already computed.
  const effectiveReason = reason || deriveMaterialityExplanation(currentResult, winner, seatingPositions);
  if (!effectiveReason) return null;

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
      <p className="mt-0.5 text-[10px] leading-relaxed text-[#625143]">{effectiveReason}</p>
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
  if (!selection) return null;

  const winner = selection.winner;
  const currentResult = selection.currentResult;
  const recommendations = rankRecommendations(selection);

  // ── Current Design metrics ───────────────────────────────────────────
  const currentP14 = numericLevel(currentResult?.p14AchievedLevel ?? snapshot?.currentP14);
  const currentP14Db = currentResult?.p14AchievedDb ?? null;

  // No safer improvement found
  if (recommendations.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[#213428]" />
          <span className="text-[12px] font-semibold text-[#213428]">
            {selection.message || "No verified material automatic improvement found."}
          </span>
        </div>
        {selection.rejectionReason && (
          <p className="mt-1.5 text-[10px] leading-relaxed text-[#8A7B6A]">{selection.rejectionReason}</p>
        )}
        {selection.positionOptimisation?.subOptimisationExhausted && !selection.positionOptimisation?.materialSubImprovementFound && (
          <p className="mt-1.5 text-[10px] italic text-[#8A7B6A]">
            The completed checks cover the evaluated options only; they do not establish a global optimum.
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
    tuning: currentResult?.appliedTuning || snapshot?.effectiveTuning || snapshot?.tuning || currentTuning,
  };

  const applied = isOptimisedApplied(currentInstances, winner, roomDims);

  // ── Ranked recommendation cards ─────────────────────────────────────
  // Build the ranked list from all material confirmed results + calibration.
  // The canonical winner is always #1. Other material improvements are ranked
  // below by: level change > raw improvement > practical priority.
  return (
    <div className="mt-3 space-y-3">
      {/* ── Current Design summary ── */}
      <div className="rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#625143]">Current Design</div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <P14TargetPill targetLevel={snapshot?.p14TargetLevel} targetDb={snapshot?.p14TargetDb} />
          <P14CapabilityPill currentLevel={currentP14} currentDb={currentP14Db} winnerLevel={currentP14} winnerDb={currentP14Db} />
          <SeatScopedHeadline label="P19" />
          <SeatScopedHeadline label="P20" />
        </div>
      </div>

      {(selection.calibrationDiagnostics?.invalid > 0 || selection.calibrationDiagnostics?.error) && (
        <p className="text-[10px] text-[#625143]">Some calibration options could not be validated. Recommendations below use only confirmed valid results; calibration is not exhausted.</p>
      )}

      {/* ── Calibration immaterial notice ── */}
      {selection.calibrationDiagnostics?.valid > 0 && !selection.calibrationDiagnostics?.invalid && !selection.calibrationDiagnostics?.error && !selection.calibrationMaterial?.material && (
        <div className="rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-2">
          <p className="text-[10px] leading-relaxed text-[#625143]">
            Calibration alone did not materially improve the room, so Sound Proof tested subwoofer position changes.
          </p>
        </div>
      )}

      {/* ── Ranked recommendation cards ── */}
      {recommendations.length > 0 && (
        <div className="space-y-2">
          {recommendations.map((rec) => (
            <RecommendationCard
              key={rec.result.candidateId}
              recommendation={rec}
              snapshot={augmentedSnapshot}
              currentInstances={currentInstances}
              onApply={onApply}
              onApplyCalibration={onApplyCalibration}
              isApplied={isOptimisedApplied(currentInstances,rec.result,roomDims)}
              currentResult={currentResult}
              seatingPositions={seatingPositions}
            />
          ))}
        </div>
      )}

      {/* ── Per-seat evidence for the winner ── */}
      {recommendations.length > 0 && recommendations[0]?.isWinner && (
        <div data-comparison-candidate-id={winner.candidateId} className="rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3">
          <div className="text-[10px] font-semibold text-[#625143] mb-1.5">
            P19 / P20 per-seat evidence (before → after) — {recommendations[0].interventionLabel}
          </div>
          <V2SeatBeforeAfterGrid
            seatingPositions={seatingPositions}
            beforeP19={currentResult?.perSeatP19 || []}
            afterP19={winner.perSeatP19 || []}
            beforeP20={currentResult?.perSeatP20 || []}
            afterP20={winner.perSeatP20 || []}
          />
        </div>
      )}

      {/* ── Remaining limitation + treatment advisory for the winner ── */}
      {(() => {
        const treatmentAdvisory = buildTreatmentAdvisory(winner, roomDims);
        const remainingLimitation = buildRemainingLimitation(winner);
        return (
          <>
            {remainingLimitation && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[10px] font-semibold text-amber-800">Remaining limitation</div>
                  <p className="text-[10px] leading-relaxed text-amber-700">{remainingLimitation}</p>
                </div>
              </div>
            )}
            {treatmentAdvisory?.showAdvisory && (
              <div className="flex items-start gap-2 rounded-md border border-[#E0DDD7] bg-white p-2">
                <FlaskConical className="h-3.5 w-3.5 text-[#625143] mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-[10px] font-semibold text-[#213428]">{treatmentAdvisory.title}</div>
                  <p className="text-[10px] leading-relaxed text-[#625143]">{treatmentAdvisory.body}</p>
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}