// AdiOptimiserResults.jsx
// ---------------------------------------------------------------------------
// The persistent ADI Bass Optimiser results panel.
//
// Rendered after a run completes (in place of the live checklist), this panel
// reads ONLY the saved optimisation plan evidence (useOptimiserPlanView) and the
// existing lever apply/undo authorities. It introduces no second optimisation
// system, performs no calculation, and writes nothing except through the
// existing apply/undo handlers.
//
// It shows, for every category (Phase · Delay · Gain · Placement · Seating ·
// Crossover integration):
//   - an evidence-based status label
//   - the actual recommended adjustment (where retained evidence exists)
//   - the predicted P19/P20 (and P14 where available) before/after
//   - Apply / Undo / Dismiss actions (where the existing handlers support them)
//
// The panel stays visible until a new run replaces it or the underlying design
// changes invalidate the saved plan (in which case the parent shows the Run
// button instead).
// ---------------------------------------------------------------------------

import React, { useMemo, useSyncExternalStore } from "react";
import { Sparkles, Loader2, Check, Undo2, X, RotateCcw } from "lucide-react";
import {
  OPTIMISER_LEVER,
  OPTIMISER_LEVER_STATE,
  OPTIMISER_PLAN_STATUS,
} from "../optimiserPlan/optimiserPlanConstants.js";
import { OPTIMISER_LEVER_VERDICT } from "../optimiserPlan/optimiserLeverVerdict.js";
import {
  deviationText,
  levelText,
  p14DbText,
} from "../optimiserPlan/optimiserWholeNumberDb.js";
import {
  isRecommendationDismissed,
  dismissRecommendation,
  restoreRecommendation,
  subscribeDismiss,
} from "./adiResultsDismissStore.js";

// Per-lever dismiss flag as a stable primitive (boolean), so useSyncExternalStore
// never re-renders on a fresh-object snapshot.
function useRecommendationDismissed(projectId, versionId, leverKey, fingerprint) {
  return useSyncExternalStore(
    subscribeDismiss,
    () => isRecommendationDismissed(projectId, versionId, leverKey, fingerprint),
    () => false,
  );
}

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const fmt = (v, d = 1) => {
  const n = num(v);
  return n == null ? null : n.toFixed(d);
};

// Fixed category order, mapping each to its saved lever key and its
// calibration-evidence key (where one exists).
const CATEGORIES = [
  { key: "phase", label: "Phase", leverKey: null, calibKey: "phase" },
  { key: "delay", label: "Delay", leverKey: OPTIMISER_LEVER.DELAY, calibKey: "delay" },
  { key: "gain", label: "Gain", leverKey: OPTIMISER_LEVER.GAIN, calibKey: "gain" },
  { key: "placement", label: "Placement", leverKey: OPTIMISER_LEVER.PLACEMENT, calibKey: null },
  { key: "seating", label: "Seating", leverKey: OPTIMISER_LEVER.SEATING, calibKey: null },
  { key: "crossover", label: "Crossover integration", leverKey: OPTIMISER_LEVER.COMBINED_ELECTRONIC, calibKey: "combined" },
];

const TONE = {
  analysing: { bg: "#F1F0EE", border: "#C1B6AD", color: "#4A230F" },
  analysed: { bg: "#F4F7F4", border: "#CFDCCF", color: "#625143" },
  identified: { bg: "#E7F0E9", border: "#9DB8A4", color: "#213428" },
  applied: { bg: "#213428", border: "#213428", color: "#FFFFFF" },
  unavailable: { bg: "#F1F0EE", border: "#DCDBD6", color: "#8A7B6A" },
  incomplete: { bg: "#F1F0EE", border: "#C1B6AD", color: "#4A230F" },
  failed: { bg: "#FEE2E2", border: "#FCA5A5", color: "#B91C1C" },
};

// A category-specific reason, read only from saved diagnostics. Never invented.
function reasonFor(catKey, planView) {
  const gate = planView?.hierarchyGateDiagnostics || null;
  if (catKey === "placement") {
    return gate?.placementExclusionReason || null;
  }
  if (catKey === "seating") {
    return gate?.seatingExclusionReason || null;
  }
  const issue = planView?.firstEvaluationIssue;
  if (issue && (issue.stage === catKey || (catKey === "crossover" && issue.stage === "combined"))) {
    return issue.error || (Array.isArray(issue.issues) ? issue.issues.filter(Boolean).join(" · ") : null) || null;
  }
  const calibKey = catKey === "crossover" ? "combined" : catKey;
  const cal = planView?.calibrationEvidence?.levers?.[calibKey] || null;
  return cal?.reason || null;
}

function resolveCategoryStatus({ cat, lever, calibLever, planView, isRunning }) {
  if (isRunning) return { key: "analysing", label: "Analysing…", tone: "analysing" };
  if (lever?.state === OPTIMISER_LEVER_STATE.APPLIED) {
    return { key: "applied", label: "Improvement applied", tone: "applied" };
  }
  // Crossover / combined electronic is applied by the run's guarded auto-apply,
  // not by a single-lever apply. The run's own decision is the authority here.
  if (cat.key === "crossover" && planView?.decisionApplied === true && lever) {
    return { key: "applied", label: "Improvement applied", tone: "applied" };
  }
  if (lever && (lever.verdict === OPTIMISER_LEVER_VERDICT.RECOMMENDED
      || lever.verdict === OPTIMISER_LEVER_VERDICT.TRADE_OFF)) {
    return {
      key: "identified", label: "Improvement identified", tone: "identified",
      note: lever.applyBlockedReason
        || (lever.verdict === OPTIMISER_LEVER_VERDICT.TRADE_OFF ? "Trade-off — not applied automatically" : null),
    };
  }
  if (!lever && calibLever) {
    if (calibLever.result === "applied") return { key: "applied", label: "Improvement applied", tone: "applied" };
    if (calibLever.result === "improvement_not_applied" || calibLever.result === "trade_off") {
      return { key: "identified", label: "Improvement identified", tone: "identified", note: calibLever.reason || null };
    }
    if (calibLever.result === "no_useful_improvement") {
      return { key: "analysed", label: "Analysed — no improvement found", tone: "analysed" };
    }
    if (calibLever.result === "not_tested_in_run") {
      return { key: "unavailable", label: "Unavailable", tone: "unavailable", note: calibLever.reason || "Search did not run in this evaluation" };
    }
  }
  const cs = cat.searchStatus?.status;
  if (cs === "completed") return { key: "analysed", label: "Analysed — no improvement found", tone: "analysed" };
  if (cs === "failed") return { key: "failed", label: "Failed", tone: "failed", note: reasonFor(cat.key, planView) };
  if (cs === "incomplete") return { key: "incomplete", label: "Incomplete", tone: "incomplete", note: reasonFor(cat.key, planView) };
  if (cs === "skipped" || cs === "not_applicable" || cs === "not_run") {
    return { key: "unavailable", label: "Unavailable", tone: "unavailable", note: reasonFor(cat.key, planView) };
  }
  return { key: "incomplete", label: "Incomplete", tone: "incomplete" };
}

// ── Change formatters (read only from retained evidence) ──

function formatDelayChange(c) {
  return `${c.label || "Subwoofer"}: delay ${fmt(c.fromMs, 1)} ms → ${fmt(c.toMs, 1)} ms`;
}
function formatGainChange(c) {
  return `${c.label || "Subwoofer"}: gain ${fmt(c.fromDb, 1)} dB → ${fmt(c.toDb, 1)} dB`;
}
function formatPolarityChange(c) {
  return `${c.label || "Subwoofer"}: polarity ${c.fromLabel || "—"} → ${c.toLabel || "—"}`;
}
function formatPlacementChange(c) {
  const mm = c.distanceMm != null ? `${c.distanceMm} mm` : "move";
  return `${c.label || "Subwoofer"}: ${mm}${c.direction ? ` ${c.direction}` : ""}`;
}
function formatSeatingChange(c) {
  const mm = c.deltaMm != null ? ` (${Math.abs(c.deltaMm)} mm${c.direction ? ` ${c.direction}` : ""})` : "";
  return `${c.label || "Seat"}: ${fmt(c.fromY, 2)} m → ${fmt(c.toY, 2)} m${mm}`;
}

// ── Seating grouping by row ──
// Where all seats in one row share the same confirmed movement (same deltaMm
// and direction), show one recommendation instead of repeating every seat.
// Only groups seats whose actual proposed movement matches; individual details
// are preserved where movements differ or the row cannot be inferred.
const ROW_LABEL_RE = /Row\s*(\d+)/i;

function rowNumberOf(label) {
  const m = String(label || "").match(ROW_LABEL_RE);
  return m ? Number(m[1]) : null;
}

function formatSeatingChangesGrouped(changes) {
  if (!Array.isArray(changes) || changes.length === 0) return [];
  const groups = new Map();
  const ungrouped = [];
  for (const c of changes) {
    const row = rowNumberOf(c.label);
    if (row == null) { ungrouped.push(c); continue; }
    const key = `${row}|${c.deltaMm ?? ""}|${c.direction ?? ""}`;
    if (!groups.has(key)) groups.set(key, { row, deltaMm: c.deltaMm, direction: c.direction, seats: [] });
    groups.get(key).seats.push(c);
  }
  const lines = [];
  for (const [, group] of groups) {
    if (group.seats.length < 2) {
      // Single seat or no grouping — show individual detail.
      for (const c of group.seats) lines.push({ primary: formatSeatingChange(c), detail: null });
      continue;
    }
    // All seats in this row moved the same distance in the same direction.
    const mm = Math.abs(group.deltaMm || 0);
    const dir = group.direction || "";
    const fromYs = group.seats.map((c) => num(c.fromY)).filter(Number.isFinite);
    const toYs = group.seats.map((c) => num(c.toY)).filter(Number.isFinite);
    const moveText = `Move Row ${group.row}${dir ? ` ${dir}` : ""} by ${mm} mm`;
    const detail = `${group.seats.length} seats · ${fmt(fromYs[0], 2)} m → ${fmt(toYs[0], 2)} m`;
    lines.push({ primary: moveText, detail });
  }
  for (const c of ungrouped) lines.push({ primary: formatSeatingChange(c), detail: null });
  return lines;
}
function formatCombinedRow(row) {
  if (!row?.changed) return null;
  const parts = [];
  if (num(row.fromDelayMs) !== num(row.toDelayMs)) parts.push(`delay ${fmt(row.fromDelayMs, 1)} → ${fmt(row.toDelayMs, 1)} ms`);
  if (num(row.fromGainDb) !== num(row.toGainDb)) parts.push(`gain ${fmt(row.fromGainDb, 1)} → ${fmt(row.toGainDb, 1)} dB`);
  if (row.fromPolarity !== row.toPolarity) parts.push(`polarity ${row.fromLabel || ""} → ${row.toLabel || ""}`);
  return parts.length ? { label: row.label || row.subId, text: parts.join(" · ") } : null;
}
function formatCrossoverChange(lever) {
  const before = lever?.crossover?.before;
  const after = lever?.crossover?.after;
  if (!before || !after) return null;
  const fB = num(before.frequencyHz);
  const fA = num(after.frequencyHz);
  if (fB != null && fA != null && fB !== fA) return `Crossover frequency ${fB} Hz → ${fA} Hz`;
  return null;
}

// ── RP22 parameter level changes ──
// Leads with the RP22 Level transition (e.g. "P19: L1 → L4") when the level
// changed, with the supporting before/after dB values underneath. If the
// level remains unchanged despite a worthwhile dB improvement, the dB
// improvement is shown without inventing a level upgrade. P19 and P20 are
// displayed as separate lines. This never implies that improving one
// parameter changes the overall cinema Performance Level.
function metricLevelNumber(level) {
  if (level == null) return null;
  if (Number.isFinite(Number(level))) return Number(level);
  const m = String(level).trim().toUpperCase().match(/^L?([1-4])$/);
  return m ? Number(m[1]) : null;
}

function formatMetricLines(label, beforeDb, afterDb, levelBefore, levelAfter) {
  const lines = [];
  const lvlBefore = metricLevelNumber(levelBefore);
  const lvlAfter = metricLevelNumber(levelAfter);
  const levelChanged = lvlBefore != null && lvlAfter != null && lvlAfter !== lvlBefore;
  const dbChanged = Boolean(beforeDb && afterDb && beforeDb !== afterDb);

  if (levelChanged) {
    // Lead with the Level transition prominently.
    lines.push({ kind: "level", text: `${label}: ${levelText(lvlBefore)} → ${levelText(lvlAfter)}` });
    // Supporting dB values underneath.
    if (beforeDb && afterDb) {
      lines.push({ kind: "db", text: `${beforeDb} → ${afterDb}` });
    } else if (afterDb) {
      lines.push({ kind: "db", text: afterDb });
    }
  } else if (dbChanged) {
    // dB improvement, Level unchanged — show dB without inventing a level upgrade.
    lines.push({ kind: "db", text: `${label}: ${beforeDb} → ${afterDb}` });
  } else if (afterDb) {
    lines.push({ kind: "db", text: `${label}: ${afterDb}` });
  }
  return lines;
}

// P20 is a per-seat parameter. The saved lever evidence carries only the
// worst-seat headline level (baseline.p20Level / effect.p20Level), not a
// primary/secondary split — summariseSeats drops isPrimary during
// persistence. So the main panel shows the worst-seat P20 level, clearly
// labelled. Primary/secondary detail stays in Technical diagnostics, which
// read the richer per-seat evidence. No level is ever inferred from a rounded
// dB figure, and a parameter Level change never implies an overall cinema
// Performance Level change.
function formatEffectLines(effect, baseline) {
  if (!effect) return [];
  const lines = [];

  const p19BeforeDb = deviationText(baseline?.p19VariationDb);
  const p19AfterDb = deviationText(effect.p19VariationDb);
  const p19LevelBefore = levelText(effect.p19LevelBefore ?? baseline?.p19Level);
  const p19LevelAfter = levelText(effect.p19LevelAfter);
  lines.push(...formatMetricLines("P19 \u00b7 Reference seat", p19BeforeDb, p19AfterDb, p19LevelBefore, p19LevelAfter));

  const p20BeforeDb = deviationText(baseline?.p20VariationDb);
  const p20AfterDb = deviationText(effect.p20VariationDb);
  const p20LevelBefore = levelText(effect.p20LevelBefore ?? baseline?.p20Level);
  const p20LevelAfter = levelText(effect.p20LevelAfter);
  lines.push(...formatMetricLines("P20 \u00b7 Worst seat", p20BeforeDb, p20AfterDb, p20LevelBefore, p20LevelAfter));

  if (effect.p14DeltaDb != null && Math.abs(effect.p14DeltaDb) >= 1) {
    const p14 = p14DbText(effect.p14AchievedDb);
    if (p14) lines.push({ kind: "db", text: `P14 ${p14}` });
  }
  // Worst-seat identifiers and limiting frequencies are diagnostic detail —
  // kept in the Technical diagnostics panel, not the main recommendation.
  return lines;
}

function describeAppliedLever(lever) {
  const c = (lever?.changes || [])[0];
  if (!c) {
    if (lever?.key === OPTIMISER_LEVER.COMBINED_ELECTRONIC) return "crossover & tuning applied";
    return null;
  }
  if (lever.key === OPTIMISER_LEVER.DELAY) return `${c.label || "Subwoofer"} delay ${fmt(c.fromMs, 1)} ms → ${fmt(c.toMs, 1)} ms`;
  if (lever.key === OPTIMISER_LEVER.GAIN) return `${c.label || "Subwoofer"} gain ${fmt(c.fromDb, 1)} dB → ${fmt(c.toDb, 1)} dB`;
  if (lever.key === OPTIMISER_LEVER.PLACEMENT) return `${c.label || "Subwoofer"} moved ${c.distanceMm ?? ""} mm`.trim();
  if (lever.key === OPTIMISER_LEVER.SEATING) return lever.seating?.movementLabel || "seating moved";
  if (lever.key === OPTIMISER_LEVER.COMBINED_ELECTRONIC) return "crossover & tuning applied";
  return null;
}

function buildSummary({ planView, dismissedCount }) {
  const applied = [];
  const identified = [];
  for (const lever of (planView?.levers || [])) {
    if (lever.state === OPTIMISER_LEVER_STATE.APPLIED) applied.push(lever);
    else if (lever.verdict === OPTIMISER_LEVER_VERDICT.RECOMMENDED
      || lever.verdict === OPTIMISER_LEVER_VERDICT.TRADE_OFF) identified.push(lever);
  }
  const combined = (planView?.levers || []).find((l) => l.key === OPTIMISER_LEVER.COMBINED_ELECTRONIC);
  if (combined && planView?.decisionApplied === true && !applied.includes(combined)) {
    applied.push(combined);
    const idx = identified.indexOf(combined);
    if (idx >= 0) identified.splice(idx, 1);
  }

  const parts = [];
  if (applied.length > 0) {
    const descs = applied.slice(0, 2).map(describeAppliedLever).filter(Boolean);
    parts.push(`Electronic optimisation applied${descs.length ? `: ${descs.join("; ")}` : "."}`);
  } else {
    parts.push("Electronic optimisation completed.");
  }
  if (identified.length > 0) {
    parts.push(`${identified.length} improvement${identified.length === 1 ? "" : "s"} available for review${dismissedCount > 0 ? ` (${dismissedCount} dismissed)` : ""}.`);
  } else if (applied.length === 0) {
    parts.push("No improvements applied or recommended.");
  }
  return parts.join(" ");
}

// ── Category row ──

function CategoryRow({
  cat, status, lever, calibLever, planView,
  projectId, versionId, fingerprint,
  onApply, onUndo, onDismiss, onRestore, applyBusy,
}) {
  const dismissedFlag = useRecommendationDismissed(projectId, versionId, cat.leverKey, fingerprint);
  const dismissed = cat.leverKey ? dismissedFlag : false;
  const tone = TONE[status.tone] || TONE.analysed;
  const isApplied = status.key === "applied";
  const isIdentified = status.key === "identified";
  const directApplySupported = cat.leverKey && cat.leverKey !== OPTIMISER_LEVER.COMBINED_ELECTRONIC;
  const canApply = directApplySupported && lever?.canApply === true && !isApplied;
  const canUndo = directApplySupported && lever?.canUndo === true && isApplied;

  // The recommended adjustment block (changes + predicted effect).
  const changes = Array.isArray(lever?.changes) ? lever.changes : [];
  const effect = lever?.effect || null;
  const baseline = planView?.baseline || null;

  let adjustmentLines = [];
  if ((isIdentified || isApplied) && lever) {
    if (cat.key === "crossover") {
      const rows = (Array.isArray(lever.tuning) ? lever.tuning : [])
        .map(formatCombinedRow).filter(Boolean);
      adjustmentLines = rows.map((r) => `${r.label}: ${r.text}`);
      const xo = formatCrossoverChange(lever);
      if (xo) adjustmentLines.unshift(xo);
    } else if (cat.key === "seating") {
      // Group identical seating movements by row; fall back to individual detail.
      adjustmentLines = formatSeatingChangesGrouped(changes);
      if (lever.seating?.movementLabel && adjustmentLines.length === 0) {
        adjustmentLines.push(lever.seating.movementLabel);
      }
    } else {
      adjustmentLines = changes.slice(0, 4).map((c) => {
        if (cat.key === "delay") return formatDelayChange(c);
        if (cat.key === "gain") return formatGainChange(c);
        if (cat.key === "placement") return formatPlacementChange(c);
        return null;
      }).filter(Boolean);
      if (cat.key === "placement" && lever.movementLabel && adjustmentLines.length === 0) {
        adjustmentLines.push(lever.movementLabel);
      }
    }
  } else if (!lever && calibLever?.bestCandidate && (isIdentified || isApplied)) {
    // Phase (no individual lever): show the calibration best-candidate effect.
    const bc = calibLever.bestCandidate;
    const p20 = deviationText(bc.p20After) || deviationText(bc.p20Before);
    if (p20) adjustmentLines.push(`Best option P20 ${deviationText(bc.p20Before) && deviationText(bc.p20After) ? `${deviationText(bc.p20Before)} → ${deviationText(bc.p20After)}` : p20}`);
  }

  const effectLines = formatEffectLines(effect, baseline);

  return (
    <div className="rounded-md border border-[#E7E5E0] bg-white px-3 py-2" data-adi-result-category={cat.key}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-[#1B1A1A]">{cat.label}</span>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, borderColor: tone.border, color: tone.color }}
          data-adi-result-status={status.key}
        >
          {isApplied && <Check className="h-3 w-3" />}
          {status.label}
        </span>
      </div>

      {status.note && (
        <div className="mt-1 text-[11px] leading-relaxed" style={{ color: tone.color }}>
          {status.note}
        </div>
      )}

      {!dismissed && (isIdentified || isApplied) && (adjustmentLines.length > 0 || effectLines.length > 0) && (
        <div className="mt-1.5 space-y-1">
          {/* RP22 Level changes lead, above the movement description. */}
          {effectLines.length > 0 && (
            <div className="text-[11px] text-[#625143] leading-relaxed">
              {effectLines.map((line, i) => (
                <div
                  key={`eff-${i}`}
                  className={line.kind === "level" ? "font-semibold text-[#213428]" : ""}
                >
                  {line.text}
                </div>
              ))}
            </div>
          )}
          {/* Proposed movement, below the level improvement. */}
          {adjustmentLines.map((line, i) => {
            if (typeof line === "string") {
              return <div key={`adj-${i}`} className="text-[11px] text-[#1B1A1A] leading-relaxed">{line}</div>;
            }
            // Structured seating line: bold movement, detail underneath.
            return (
              <div key={`adj-${i}`} className="text-[11px] leading-relaxed">
                <div className="font-semibold text-[#1B1A1A]">{line.primary}</div>
                {line.detail && <div className="text-[#625143]">{line.detail}</div>}
              </div>
            );
          })}
        </div>
      )}

      {dismissed && (isIdentified || isApplied) && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[11px] text-[#8A7B6A]">Recommendation dismissed.</span>
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex items-center gap-1 text-[11px] text-[#625143] underline underline-offset-2 hover:no-underline"
          >
            <RotateCcw className="h-3 w-3" /> Restore
          </button>
        </div>
      )}

      {!dismissed && (isIdentified || isApplied) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {canApply && (
            <button
              type="button"
              onClick={onApply}
              disabled={applyBusy === lever?.key}
              className="inline-flex items-center gap-1 rounded-md bg-[#213428] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#3E4349] disabled:opacity-50"
            >
              {applyBusy === lever?.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {lever?.applyLabel || "Apply"}
            </button>
          )}
          {canUndo && (
            <button
              type="button"
              onClick={onUndo}
              disabled={applyBusy === lever?.key}
              className="inline-flex items-center gap-1 rounded-md border border-[#DCDBD6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#3E4349] transition-colors hover:border-[#1B1A1A] disabled:opacity-50"
            >
              <Undo2 className="h-3 w-3" />
              {lever?.undoLabel || "Undo"}
            </button>
          )}
          {isIdentified && !isApplied && (
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium text-[#625143] transition-colors hover:text-[#213428]"
            >
              <X className="h-3 w-3" /> Dismiss
            </button>
          )}
          {cat.key === "crossover" && isIdentified && !isApplied && (
            <span className="text-[11px] text-[#8A7B6A]">Re-run ADI to apply the combined electronic change.</span>
          )}
          {canApply === false && directApplySupported && isIdentified && lever?.applyBlockedReason && (
            <span className="text-[11px] text-[#8A7B6A]">{lever.applyBlockedReason}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ──

export default function AdiOptimiserResults({
  planView,
  projectId,
  versionId,
  currentDesignFingerprint,
  onRunAgain,
  handleApplyLever,
  handleUndoLever,
  leverApplyBusy,
  isRunning = false,
}) {
  const fingerprint = currentDesignFingerprint;

  // Attach the matching searchStatus entry to each category.
  const searchCats = planView?.searchStatus?.categories || [];
  const cats = CATEGORIES.map((c) => ({
    ...c,
    searchStatus: searchCats.find((s) => s.key === c.key) || null,
  }));

  const leversById = useMemo(() => {
    const m = {};
    for (const l of (planView?.levers || [])) m[l.key] = l;
    return m;
  }, [planView]);

  // Dismiss state per identified lever, re-derived from the store.
  const dismissedCount = useSyncExternalStore(
    subscribeDismiss,
    () => {
      let n = 0;
      for (const c of cats) {
        if (c.leverKey && isRecommendationDismissed(projectId, versionId, c.leverKey, fingerprint)) n += 1;
      }
      return n;
    },
    () => 0,
  );
  const summary = buildSummary({ planView, dismissedCount });

  // ── Verified-apply header ──
  // After a verified application, show "ADI optimisation complete" with the
  // actual RP22 performance improvement (P19 level transition) and the applied
  // design change. P20 is displayed separately. This reads ONLY the verified
  // levels from the plan's appliedLeverRecords — it never invents improvements.
  const appliedVerification = planView?.appliedVerification || null;
  const appliedVerified = planView?.appliedVerified === true;
  const appliedPending = planView?.appliedPending === true;
  const appliedIncomplete = planView?.appliedIncomplete === true;
  const verifiedLevels = appliedVerification?.levels || null;
  const baselineLevels = planView?.baseline || null;

  const verifiedImprovementLines = [];
  if (appliedVerified && verifiedLevels) {
    const p19Before = levelText(baselineLevels?.p19Level);
    const p19After = levelText(verifiedLevels.p19Level);
    if (p19Before && p19After) {
      verifiedImprovementLines.push({
        kind: "level",
        text: `P19: ${p19Before} \u2192 ${p19After}`,
      });
    }
    const p20Before = levelText(baselineLevels?.p20Level);
    const p20After = levelText(verifiedLevels.p20Level);
    if (p20Before && p20After) {
      verifiedImprovementLines.push({
        kind: "level",
        text: `P20: ${p20Before} \u2192 ${p20After}`,
      });
    }
  }

  // Describe the applied change(s) from the applied lever records.
  const appliedLeverKeys = planView?.appliedLeverKeys || [];
  const appliedLevers = (planView?.levers || []).filter((l) => appliedLeverKeys.includes(l.key));
  const appliedChangeDescriptions = appliedLevers.map(describeAppliedLever).filter(Boolean);

  return (
    <div className="space-y-2.5" data-adi-optimiser-results="true">
      {/* Verified-apply header */}
      {appliedVerified && (
        <div className="rounded-md border border-[#213428] bg-[#213428] px-3 py-2.5" data-adi-applied-verified="true">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-white/80">ADI optimisation complete</div>
          {verifiedImprovementLines.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {verifiedImprovementLines.map((line, i) => (
                <div key={`vl-${i}`} className="text-[13px] font-semibold text-white">{line.text}</div>
              ))}
            </div>
          )}
          {appliedChangeDescriptions.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {appliedChangeDescriptions.map((desc, i) => (
                <div key={`ac-${i}`} className="text-[11px] text-white/85">{desc} \u00b7 Applied</div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Pending verification (recalc in progress or failed) */}
      {(appliedPending || appliedIncomplete) && (
        <div className="rounded-md border border-[#C1B6AD] bg-[#F1F0EE] px-3 py-2" data-adi-applied-pending="true">
          <div className="text-[11px] font-semibold text-[#4A230F]">
            {appliedPending ? "Recommendation applied — verifying performance…" : "Recommendation applied — verification incomplete"}
          </div>
          {appliedChangeDescriptions.length > 0 && (
            <div className="mt-0.5 text-[11px] text-[#625143]">
              {appliedChangeDescriptions.join(" \u00b7 ")}
            </div>
          )}
        </div>
      )}

      {/* Result summary */}
      <div className="rounded-md border border-[#CFDCCF] bg-[#F4F7F4] px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#213428]">ADI summary</div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-[#1B1A1A]">{summary}</div>
      </div>

      {/* The six categories */}
      <div className="space-y-1.5" data-adi-result-checklist="true">
        {cats.map((cat) => {
          const lever = cat.leverKey ? leversById[cat.leverKey] : null;
          const calibLever = cat.calibKey
            ? (planView?.calibrationEvidence?.levers?.[cat.calibKey]
              || (cat.calibKey === "combined" ? planView?.calibrationEvidence?.combined : null))
            : null;
          const status = resolveCategoryStatus({ cat, lever, calibLever, planView, isRunning });
          return (
            <CategoryRow
              key={cat.key}
              cat={cat}
              status={status}
              lever={lever}
              calibLever={calibLever}
              planView={planView}
              projectId={projectId}
              versionId={versionId}
              fingerprint={fingerprint}
              onApply={handleApplyLever ? () => handleApplyLever(lever) : null}
              onUndo={handleUndoLever ? () => handleUndoLever(lever) : null}
              onDismiss={() => dismissRecommendation(projectId, versionId, cat.leverKey, fingerprint)}
              onRestore={() => restoreRecommendation(projectId, versionId, cat.leverKey, fingerprint)}
              applyBusy={leverApplyBusy}
            />
          );
        })}
      </div>

      {/* Run again */}
      <button
        type="button"
        onClick={onRunAgain}
        className="w-full rounded-lg bg-[#213428] px-4 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#3E4349] flex items-center justify-center gap-2"
        data-adi-result-run-again="true"
      >
        <Sparkles className="h-4 w-4" />
        Run ADI Bass Optimiser
      </button>
    </div>
  );
}