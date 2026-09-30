// OptimisationPlanStatus.jsx
// ---------------------------------------------------------------------------
// The restored Optimisation Plan, presented from SAVED data only.
//
// It shows facts that were persisted with the evaluated optimiser result:
// the winning candidate, each changed lever, its current and recommended
// values, its own evaluated effect, any trade-off, and the live lever state
// (Applied / Not applied / Disabled / Needs re-evaluation / No longer
// applicable).
//
// It performs no calculation and offers no Apply control: a lever is only
// actionable once its own effect path exists.
// ---------------------------------------------------------------------------

import React from "react";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { OPTIMISER_LEVER, OPTIMISER_LEVER_STATE, OPTIMISER_PLAN_STATUS } from "./optimiserPlanConstants.js";
import { useOptimiserPlanView } from "./useOptimiserPlanView.js";

const fmt = (value, digits = 1) => (Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : null);
const signed = (value, unit) => {
  const text = fmt(Math.abs(Number(value)));
  if (text == null) return null;
  return `${Number(value) >= 0 ? "+" : "−"}${text} ${unit}`;
};

function statePillStyle(state) {
  if (state === OPTIMISER_LEVER_STATE.APPLIED) return { background: "#E7F0E9", border: "#9DB8A4", color: "#213428" };
  if (state === OPTIMISER_LEVER_STATE.DISABLED) return { background: "#EFEFEC", border: "#CFCCC4", color: "#625143" };
  if (state === OPTIMISER_LEVER_STATE.NEEDS_REEVALUATION) return { background: "#FBF3E4", border: "#E0C48F", color: "#8A5A2B" };
  if (state === OPTIMISER_LEVER_STATE.NO_LONGER_APPLICABLE) return { background: "#F6EFEA", border: "#D8C3B4", color: "#7A5B4A" };
  return { background: "#FFFFFF", border: "#DCDBD6", color: "#3E4349" };
}

function changeText(change) {
  if (change.lever === OPTIMISER_LEVER.PLACEMENT) {
    return `${change.fromX?.toFixed(2)}, ${change.fromY?.toFixed(2)} m → ${change.toX?.toFixed(2)}, ${change.toY?.toFixed(2)} m`;
  }
  if (change.lever === OPTIMISER_LEVER.DELAY) {
    return `${fmt(change.fromMs)} ms → ${signed(change.toMs - change.fromMs, "ms")} (total ${fmt(change.toMs)} ms)`;
  }
  if (change.lever === OPTIMISER_LEVER.GAIN) {
    return `${fmt(change.fromDb)} dB → ${signed(change.toDb - change.fromDb, "dB")} (total ${fmt(change.toDb)} dB)`;
  }
  if (change.lever === OPTIMISER_LEVER.POLARITY) {
    return `${change.fromLabel} → ${change.toLabel}`;
  }
  return null;
}

function EffectBlock({ lever }) {
  const effect = lever.effect;
  if (!effect) {
    return <div className="text-[11px] text-[#8B7F76] italic">{lever.effectLabel}</div>;
  }
  const rows = [];
  if (effect.p20DeltaDb != null) {
    rows.push(`P20: ${fmt(effect.p20VariationDb)} dB → ${fmt(effect.p20VariationDb + effect.p20DeltaDb)} dB (${signed(effect.p20DeltaDb, "dB")})`);
  } else if (effect.p20VariationDb != null) {
    rows.push(`P20: ${fmt(effect.p20VariationDb)} dB`);
  }
  if (effect.p19DeltaDb != null) {
    rows.push(`P19: ${signed(effect.p19DeltaDb, "dB")}`);
  }
  if (effect.worstSeatId) {
    const hz = effect.worstFrequencyHz != null ? ` · ${fmt(effect.worstFrequencyHz, 0)} Hz` : "";
    rows.push(`Worst seat: ${effect.worstSeatId}${hz}`);
  }
  if (effect.p14DeltaDb != null && Math.abs(effect.p14DeltaDb) >= 0.1) {
    rows.push(`P14 change: ${signed(effect.p14DeltaDb, "dB")}`);
  }
  if (effect.outputDeltaDb != null && Math.abs(effect.outputDeltaDb) >= 0.1) {
    rows.push(`Available output: ${signed(effect.outputDeltaDb, "dB")}`);
  }
  return (
    <div className="text-[11px] text-[#625143] space-y-0.5">
      {rows.map((row) => <div key={row}>{row}</div>)}
    </div>
  );
}

export default function OptimisationPlanStatus({
  projectId = null,
  versionId = null,
  completedBassAuthority = null,
  currentDesignFingerprint = null,
  instances = [],
  className = "",
}) {
  const view = useOptimiserPlanView({
    projectId, versionId, completedBassAuthority, currentDesignFingerprint, instances,
  });

  if (view.status === OPTIMISER_PLAN_STATUS.ABSENT) return null;

  const isStale = view.status === OPTIMISER_PLAN_STATUS.STALE;
  const headerStyle = isStale
    ? { background: "#FBF3E4", border: "#E0C48F", color: "#8A5A2B" }
    : { background: "#F4F7F4", border: "#CFDCCF", color: "#213428" };

  return (
    <div className={`rounded-lg border border-[#DCDBD6] bg-white p-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isStale ? <AlertTriangle className="w-3.5 h-3.5 text-[#8A5A2B]" /> : <CheckCircle2 className="w-3.5 h-3.5 text-[#213428]" />}
          <span className="text-[12px] font-semibold text-[#1B1A1A]">Optimisation Plan</span>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap"
          style={headerStyle}
        >
          {isStale ? "Stale — needs re-evaluation" : "Current"}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-[#8B7F76]">
        {view.candidateId && <span>Candidate: {view.candidateId}</span>}
        {view.engineVersion && <span>Engine: {view.engineVersion}</span>}
        {view.savedAt && (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Saved {new Date(view.savedAt).toLocaleString("en-GB")}
          </span>
        )}
        {view.appliedCount > 0 && <span>{view.appliedCount} applied</span>}
        {view.disabledCount > 0 && <span>{view.disabledCount} disabled</span>}
      </div>

      {isStale && view.staleReason && (
        <div className="mt-2 text-[11px] text-[#8A5A2B]">{view.staleReason}</div>
      )}

      <div className="mt-2.5 space-y-2">
        {view.levers.map((lever) => (
          <div key={lever.key} className="rounded-md border border-[#E7E5E0] p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold tracking-wide text-[#3E4349]">{lever.label}</span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap"
                style={statePillStyle(lever.state)}
              >
                {lever.stateLabel}
              </span>
            </div>

            <div className="mt-1.5 space-y-1">
              {lever.changes.map((change) => (
                <div key={`${change.subId}-${change.lever}`} className="text-[11px] text-[#1B1A1A]">
                  <span className="text-[#625143]">{change.label || change.subId}</span>
                  {" — "}
                  <span>{changeText(change)}</span>
                  {change.distanceMm != null && (
                    <span className="text-[#8B7F76]">
                      {" "}(move {change.distanceMm} mm {change.direction})
                    </span>
                  )}
                </div>
              ))}
            </div>

            {lever.reason && (
              <div className="mt-1.5 text-[11px] text-[#625143]">Reason: {lever.reason}</div>
            )}

            <div className="mt-1.5">
              <EffectBlock lever={lever} />
            </div>

            {lever.tradeOff?.reason && (
              <div className="mt-1 text-[11px] text-[#8A5A2B]">Trade-off: {lever.tradeOff.reason}</div>
            )}
          </div>
        ))}
      </div>

      {view.combinedEffect && (
        <div className="mt-2.5 rounded-md border border-[#E7E5E0] bg-[#FAFAF9] p-2">
          <div className="text-[10px] font-semibold tracking-wide text-[#3E4349]">COMBINED CANDIDATE</div>
          <div className="mt-1 text-[11px] text-[#625143]">
            {view.combinedEffect.p20VariationDb != null && (
              <div>P20: {fmt(view.combinedEffect.p20VariationDb)} dB{view.combinedEffect.p20DeltaDb != null ? ` (${signed(view.combinedEffect.p20DeltaDb, "dB")})` : ""}</div>
            )}
            {view.combinedEffect.p19VariationDb != null && (
              <div>P19: {fmt(view.combinedEffect.p19VariationDb)} dB</div>
            )}
            {view.combinedEffect.worstSeatId && (
              <div>Worst seat: {view.combinedEffect.worstSeatId}{view.combinedEffect.worstFrequencyHz != null ? ` · ${fmt(view.combinedEffect.worstFrequencyHz, 0)} Hz` : ""}</div>
            )}
          </div>
          {view.combinedTradeOff?.reason && (
            <div className="mt-1 text-[11px] text-[#8A5A2B]">Trade-off: {view.combinedTradeOff.reason}</div>
          )}
        </div>
      )}

      {view.notes.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {view.notes.map((note) => (
            <div key={note} className="text-[10px] text-[#8B7F76]">{note}</div>
          ))}
        </div>
      )}
    </div>
  );
}