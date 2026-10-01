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
import { AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { OPTIMISER_LEVER, OPTIMISER_LEVER_STATE, OPTIMISER_PLAN_STATUS } from "./optimiserPlanConstants.js";
import { useOptimiserPlanView } from "./useOptimiserPlanView.js";
import {
  LEAST_INTRUSIVE_NOTE,
  PLAN_FAMILY_STATEMENTS,
  leverLabel,
} from "./optimiserLeverOrder.js";
import { OPTIMISER_LEVER_VERDICT } from "./optimiserLeverVerdict.js";
import { PLACEMENT_THEORETICAL_NOTE, describePlacementChange } from "./placementMoveAuthority.js";
import {
  deltaText,
  deviationText,
  frequencyText,
  levelText,
  p14DbText,
  p18HzText,
} from "./optimiserWholeNumberDb.js";
import { readAuthoritativeP20Headline } from "./optimiserPlanMetrics.js";
import { resolveOptimiserCurrentP20 } from "./optimiserCurrentP20.js";

// Lever set-points (delay ms, gain dB). P19/P20/P14/P18 values never go through
// here — they are printed by the whole-number policy helpers below.
const fmt = (value, digits = 1) => (Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : null);
const whole = (value) => (Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : null);
const signedWhole = (value, unit) => {
  const text = whole(Math.abs(Number(value)));
  if (text == null) return null;
  return `${Number(value) >= 0 ? "+" : "−"}${text} ${unit}`;
};
/** Millisecond set-points (timing, not a dB metric). */
const signedMs = (value) => {
  const text = fmt(Math.abs(Number(value)));
  if (text == null) return null;
  return `${Number(value) >= 0 ? "+" : "−"}${text} ms`;
};

/** A verdict pill: a rejected lever must never look actionable. */
function verdictPillStyle(verdict) {
  if (verdict === OPTIMISER_LEVER_VERDICT.RECOMMENDED) return { background: "#E7F0E9", border: "#9DB8A4", color: "#213428" };
  if (verdict === OPTIMISER_LEVER_VERDICT.TRADE_OFF) return { background: "#FBF3E4", border: "#E0C48F", color: "#8A5A2B" };
  if (verdict === OPTIMISER_LEVER_VERDICT.REJECTED) return { background: "#FBEAEA", border: "#E0A9A9", color: "#B91C1C" };
  return { background: "#FFFFFF", border: "#DCDBD6", color: "#3E4349" };
}

/** Persisted P14/P18/P19/P20 headline rows — read, never recalculated. */
function ResultRows({ result }) {
  if (!result) return null;
  const rows = [];
  const p14 = p14DbText(result.p14AchievedDb);
  if (p14) rows.push(`P14: ${p14}`);
  const p18 = p18HzText(result.achievedP18Hz);
  if (p18) rows.push(`P18: ${p18}`);
  const p19 = deviationText(result.p19VariationDb);
  if (p19) {
    const level = levelText(result.p19Level);
    const delta = deltaText(result.p19DeltaDb);
    rows.push(`P19: ${p19}${level ? ` · ${level}` : ""}${delta ? ` (${delta})` : ""}`);
  }
  const p20 = deviationText(result.p20VariationDb);
  if (p20) {
    const level = levelText(result.p20Level);
    const delta = deltaText(result.p20DeltaDb);
    rows.push(`P20: ${p20}${level ? ` · ${level}` : ""}${delta ? ` (${delta})` : ""}`);
  }
  if (result.worstSeatId) {
    const hz = frequencyText(result.worstFrequencyHz);
    rows.push(`Worst seat: ${result.worstSeatId}${hz ? ` · limiting ${hz}` : ""}`);
  }
  if (result.outputDeltaDb != null && Math.abs(result.outputDeltaDb) >= 1) {
    rows.push(`Available output: ${signedWhole(result.outputDeltaDb, "dB")}`);
  }
  if (rows.length === 0) return null;
  return (
    <div className="mt-1 text-[11px] text-[#625143] space-y-0.5">
      {rows.map((row) => <div key={row}>{row}</div>)}
    </div>
  );
}

function changeText(change) {
  if (change.lever === OPTIMISER_LEVER.SEATING) {
    const mm = Number.isFinite(Number(change.deltaMm)) ? Math.abs(Math.round(Number(change.deltaMm))) : null;
    const from = Number.isFinite(Number(change.fromY)) ? Number(change.fromY).toFixed(2) : null;
    const to = Number.isFinite(Number(change.toY)) ? Number(change.toY).toFixed(2) : null;
    const movement = mm != null && mm >= 5
      ? `${mm} mm ${change.direction || ""}`.trim()
      : "no movement recorded";
    return from && to ? `${from} m → ${to} m (${movement})` : movement;
  }
  if (change.lever === OPTIMISER_LEVER.PLACEMENT) {
    // Installer language, never coordinates: the designer reads what physically
    // moves. The exact positions stay in the persisted plan for Apply and Undo.
    return describePlacementChange(change);
  }
  if (change.lever === OPTIMISER_LEVER.DELAY) {
    return `${fmt(change.fromMs)} ms → ${signedMs(change.toMs - change.fromMs)} (total ${fmt(change.toMs)} ms)`;
  }
  if (change.lever === OPTIMISER_LEVER.GAIN) {
    return `${whole(change.fromDb)} dB → ${signedWhole(change.toDb - change.fromDb, "dB")} (total ${whole(change.toDb)} dB)`;
  }
  if (change.lever === OPTIMISER_LEVER.POLARITY) {
    return `${change.fromLabel} → ${change.toLabel}`;
  }
  return null;
}

function EffectBlock({ lever, baseline = null, currentP20 = null }) {
  const effect = lever.effect;
  if (!effect) {
    return <div className="text-[11px] text-[#8B7F76] italic">{lever.effectLabel}</div>;
  }
  const rows = [];
  // The persisted effect is already the candidate's AFTER result. Compare it
  // with the persisted baseline; never add the delta to the after value again.
  const p20Before = deviationText(baseline?.p20VariationDb);
  const p20After = deviationText(effect.p20VariationDb);
  // When the evaluation's own baseline is not what the design measures now, the
  // comparison is labelled as that run's baseline beside the current result.
  const baselineMismatch = currentP20?.runBaselineDiffers === true;
  if (p20After) {
    rows.push(p20Before && p20After !== p20Before
      ? `P20: ${p20Before} → ${p20After}${baselineMismatch
        ? ` (that run's baseline · current design ${currentP20.deviationText})`
        : ""}`
      : `P20: ${p20After}`);
  }
  const p19Before = deviationText(baseline?.p19VariationDb);
  const p19After = deviationText(effect.p19VariationDb);
  if (p19After) {
    rows.push(p19Before && p19After !== p19Before ? `P19: ${p19Before} → ${p19After}` : `P19: ${p19After}`);
  }
  if (effect.worstSeatId) {
    const hz = frequencyText(effect.worstFrequencyHz);
    rows.push(`Worst seat: ${effect.worstSeatId}${hz ? ` · ${hz}` : ""}`);
  }
  if (effect.p14DeltaDb != null && Math.abs(effect.p14DeltaDb) >= 1) {
    rows.push(`P14 change: ${signedWhole(effect.p14DeltaDb, "dB")}`);
  }
  if (effect.outputDeltaDb != null && Math.abs(effect.outputDeltaDb) >= 1) {
    rows.push(`Available output: ${signedWhole(effect.outputDeltaDb, "dB")}`);
  }
  return (
    <div className="text-[11px] text-[#625143] space-y-0.5">
      {rows.map((row) => <div key={row}>{row}</div>)}
    </div>
  );
}

/** The MEASURED before/after of the last applied lever. Never the prediction. */
function LeverOutcome({ outcome }) {
  if (!outcome) return null;
  const p20Text = (headline) => deviationText(headline?.variationDb);
  const seatText = (headline) => {
    const seat = headline?.worstSeatId ? ` · ${headline.worstSeatId}` : "";
    const hz = frequencyText(headline?.worstFrequencyHz) ? ` at ${frequencyText(headline.worstFrequencyHz)}` : "";
    return `${seat}${hz}`;
  };
  const before = p20Text(outcome.before);
  const after = p20Text(outcome.after);
  const line = after
    ? `${outcome.label} applied — measured P20 ${after}${seatText(outcome.after)}${before ? ` (was ${before}${seatText(outcome.before)})` : ""}`
    : `${outcome.label} applied — recalculating the authoritative result…`;
  return (
    <div className="mt-2 rounded-md border border-[#CFDCCF] bg-[#F4F7F4] p-2">
      <div className="text-[10px] font-semibold tracking-wide text-[#3E4349]">AFTER APPLY — MEASURED</div>
      <div className="mt-0.5 text-[11px] text-[#3E4349]">{line}</div>
      <div className="mt-0.5 text-[10px] text-[#8B7F76]">
        The predicted improvement is not claimed as achieved — this is the recalculated authoritative result.
      </div>
    </div>
  );
}

export default function OptimisationPlanStatus({
  projectId = null,
  versionId = null,
  completedBassAuthority = null,
  currentDesignFingerprint = null,
  instances = [],
  seatingPositions = [],
  onApplyLever = null,
  onUndoLever = null,
  leverApplyBusy = null,
  leverOutcome = null,
  className = "",
}) {
  const view = useOptimiserPlanView({
    projectId, versionId, completedBassAuthority, currentDesignFingerprint, instances, seatingPositions,
  });

  // ONE current-P20 authority, the same one the card and the tooltip read. When
  // the run's own baseline differs from it, every absolute before/after value
  // below is labelled as that run's evidence rather than the current design's.
  const currentP20 = resolveOptimiserCurrentP20({
    authorityP20: readAuthoritativeP20Headline(completedBassAuthority),
    planView: { baseline: view.baseline },
  });

  // No evaluated evidence for this version (prose only): state the fact, offer
  // no lever controls.
  if (view.status === OPTIMISER_PLAN_STATUS.ABSENT) {
    return (
      <div className={`rounded-lg border border-[#E7E5E0] bg-[#FAFAF9] p-2.5 text-[11px] text-[#8B7F76] ${className}`}>
        {view.evidenceMessage}
      </div>
    );
  }

  // Saved evidence exists but is unreadable (absent / older schema version).
  // Never reinterpreted, never turned into fabricated levers.
  if (view.status === OPTIMISER_PLAN_STATUS.UNSUPPORTED) {
    return (
      <div className={`rounded-lg border border-[#E0C48F] bg-[#FBF3E4] p-2.5 ${className}`}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-[#8A5A2B]" />
          <span className="text-[12px] font-semibold text-[#1B1A1A]">Optimisation Plan</span>
        </div>
        <div className="mt-1 text-[11px] text-[#8A5A2B]">{view.evidenceMessage}</div>
      </div>
    );
  }

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
        {view.savedAt && (
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Evaluated {new Date(view.savedAt).toLocaleString("en-GB")}
          </span>
        )}
        {view.appliedCount > 0 && <span>{view.appliedCount} applied</span>}
        {view.disabledCount > 0 && <span>{view.disabledCount} disabled</span>}
      </div>

      <div className="mt-1 text-[11px] text-[#625143] leading-relaxed">{LEAST_INTRUSIVE_NOTE}</div>

      {(view.candidateId || view.engineVersion) && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[10px] text-[#8B7F76]">Technical details</summary>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-[#8B7F76]">
            {view.candidateId && <span>Winning candidate: {view.candidateId}</span>}
            {view.engineVersion && <span>Engine: {view.engineVersion}</span>}
          </div>
        </details>
      )}

      {view.baseline && (
        <details className="mt-2 rounded-md border border-[#E7E5E0] bg-[#FAFAF9] p-2">
          <summary className="cursor-pointer text-[10px] font-semibold tracking-wide text-[#3E4349]">
            {currentP20.runBaselineDiffers ? "Design when evaluated" : "Current design details"}
          </summary>
          <ResultRows result={view.baseline} />
        </details>
      )}

      {isStale && view.staleReason && (
        <div className="mt-2 text-[11px] text-[#8A5A2B]">{view.staleReason}</div>
      )}

      <div className="mt-2.5 space-y-2">
        {view.levers.map((lever) => (
          <div key={lever.key} className="rounded-md border border-[#E7E5E0] p-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-semibold text-[#1B1A1A]">{lever.title || lever.label}</span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap"
                style={verdictPillStyle(lever.verdict)}
              >
                {lever.verdictLabel}
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-[#8B7F76]">{lever.stateLabel}</div>
            {lever.verdictSummary && (
              <div className="mt-0.5 text-[11px] text-[#625143] leading-relaxed">{lever.verdictSummary}</div>
            )}

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

            {lever.movementLabel && (
              <div className="mt-1 text-[11px] font-semibold text-[#1B1A1A]">{lever.movementLabel}</div>
            )}
            {lever.practical === false && (
              <div className="mt-1 text-[10px] text-[#8A5A2B]">
                {PLACEMENT_THEORETICAL_NOTE}
                {lever.theoreticalReason ? ` ${lever.theoreticalReason}` : ""}
              </div>
            )}

            {lever.evidenceLabel && (
              <div className="mt-1 text-[10px] text-[#8B7F76]">{lever.evidenceLabel}</div>
            )}

            {lever.notEvaluated && lever.notEvaluatedReason && (
              <div className="mt-1 text-[10px] text-[#8A5A2B]">{lever.notEvaluatedReason}</div>
            )}

            {lever.reason && (
              <div className="mt-1.5 text-[11px] text-[#625143]">Reason: {lever.reason}</div>
            )}

            <div className="mt-1.5">
              <EffectBlock lever={lever} baseline={view.baseline} currentP20={currentP20} />
            </div>

            {lever.tradeOff?.reason && (
              <div className="mt-1 text-[11px] text-[#8A5A2B]">Trade-off: {lever.tradeOff.reason}</div>
            )}

            {/* Seating: the movement itself, and whether every destination
                position is legal. A movement whose destinations could not be
                confirmed is shown with the reason and offers no Apply. */}
            {lever.seating?.movementLabel && (
              <div className="mt-1 text-[11px] font-semibold text-[#1B1A1A]">
                {lever.seating.movementLabel}
                {lever.seating.wholeBlockMoved === true ? " (whole seating block)" : ""}
              </div>
            )}
            {lever.validation && (
              <div className="mt-0.5 text-[10px] text-[#8B7F76]">
                {lever.validation.destinationsValid === true
                  ? `Destination positions checked: valid (${lever.validation.basis}).`
                  : lever.validation.destinationsValid === false
                    ? `Destination positions not valid: ${lever.validation.reason || "a seat position is outside this room."}`
                    : `Destination positions: ${lever.validation.basis || "not re-checked here"}.`}
              </div>
            )}

            {/* Individual Apply / Undo — this lever only. Blocked states state why. */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {lever.canApply && onApplyLever && (
                <button
                  type="button"
                  onClick={() => onApplyLever(lever)}
                  disabled={leverApplyBusy === lever.key}
                  className="inline-flex items-center gap-1 rounded-md bg-[#213428] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#3E4349] disabled:opacity-50"
                >
                  {leverApplyBusy === lever.key && <Loader2 className="h-3 w-3 animate-spin" />}
                  {lever.applyLabel || "Apply"}
                </button>
              )}
              {lever.canUndo && onUndoLever && (
                <button
                  type="button"
                  onClick={() => onUndoLever(lever)}
                  disabled={leverApplyBusy === lever.key}
                  className="inline-flex items-center gap-1 rounded-md border border-[#DCDBD6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#3E4349] transition-colors hover:border-[#1B1A1A] disabled:opacity-50"
                >
                  {lever.undoLabel || "Undo"}
                </button>
              )}
              {!lever.canApply && lever.applyBlockedReason && (
                <span className="text-[10px] text-[#8B7F76]">{lever.applyBlockedReason}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <LeverOutcome outcome={leverOutcome} />

      {view.combined && (
        <details className="mt-2.5 rounded-md border border-[#E7E5E0] bg-[#FAFAF9] p-2">
          <summary className="cursor-pointer text-[10px] font-semibold tracking-wide text-[#3E4349]">Combined candidate details</summary>
          {view.combined.candidateId && (
            <div className="mt-0.5 text-[10px] text-[#8B7F76]">
              {view.combined.candidateId}
              {view.combined.seats.length > 0 ? ` · ${view.combined.seats.length} seats evaluated` : ""}
            </div>
          )}
          <ResultRows result={view.combined.effect} />
          {view.combined.components?.seating?.changes?.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              <div className="text-[10px] font-semibold tracking-wide text-[#3E4349]">
                This candidate moved the seating
              </div>
              {view.combined.components.seating.changes.map((change) => (
                <div key={change.seatId} className="text-[11px] text-[#1B1A1A]">
                  <span className="text-[#625143]">{change.label || change.seatId}</span>
                  {" — "}
                  <span>{changeText(change)}</span>
                </div>
              ))}
            </div>
          )}
          {view.combined.tuning.filter((row) => row.changed).length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              <div className="text-[10px] font-semibold tracking-wide text-[#3E4349]">
                This candidate retuned the tuning
              </div>
              {view.combined.tuning.filter((row) => row.changed).map((row) => (
                <div key={row.subId} className="text-[11px] text-[#1B1A1A]">
                  <span className="text-[#625143]">{row.label || row.subId}</span>
                  {row.toDelayMs !== row.fromDelayMs && <span>{` — delay ${fmt(row.fromDelayMs)} → ${fmt(row.toDelayMs)} ms`}</span>}
                  {row.toGainDb !== row.fromGainDb && <span>{` — gain ${fmt(row.fromGainDb)} → ${fmt(row.toGainDb)} dB`}</span>}
                  {row.fromPolarity !== row.toPolarity && <span>{` — polarity ${row.fromLabel} → ${row.toLabel}`}</span>}
                </div>
              ))}
            </div>
          )}
          {view.combinedTradeOff?.reason && (
            <div className="mt-1 text-[11px] text-[#8A5A2B]">Trade-off: {view.combinedTradeOff.reason}</div>
          )}
        </details>
      )}

      {/* The families this plan cannot carry a result for — stated, never omitted,
          but kept out of the client-facing default view. */}
      <details className="mt-2.5 rounded-md border border-[#E7E5E0] bg-[#FAFAF9] p-2">
        <summary className="cursor-pointer text-[10px] font-semibold tracking-wide text-[#3E4349]">Other options tested</summary>
        <div className="mt-1 space-y-0.5 text-[11px] leading-relaxed">
          {!view.levers.some((lever) => lever.key === OPTIMISER_LEVER.PLACEMENT) && (
            <div>
              <span className="font-semibold text-[#1B1A1A]">Placement — move subwoofers</span>
              <span className="text-[#625143]">
                {" — no alternative sub position was retained for this design."}
              </span>
            </div>
          )}
          {PLAN_FAMILY_STATEMENTS.map((entry) => (
            <div key={entry.key}>
              <span className="font-semibold text-[#1B1A1A]">{leverLabel(entry.key)}</span>
              <span className="text-[#625143]"> — {entry.statement}</span>
            </div>
          ))}
        </div>
      </details>

      {view.notes.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] text-[#8B7F76]">Plan notes</summary>
          <div className="mt-1 space-y-0.5">
          {view.notes.map((note) => (
            <div key={note} className="text-[10px] text-[#8B7F76]">{note}</div>
          ))}
          </div>
        </details>
      )}
    </div>
  );
}