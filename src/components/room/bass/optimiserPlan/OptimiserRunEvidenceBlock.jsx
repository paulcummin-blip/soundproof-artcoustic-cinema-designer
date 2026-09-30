// OptimiserRunEvidenceBlock.jsx
// ---------------------------------------------------------------------------
// The evidence a completed optimiser run left behind when it produced no
// actionable plan: how many candidates were confirmed, which families were
// tested, the best attempt per family and the current result they are compared
// with, why no candidate was accepted, and the fact that the design was not
// changed.
//
// Read-only. It offers no Apply control, and it never presents a rejected
// candidate as an available change. A metric the run did not publish is shown
// as unavailable — never as 0.00 dB.
// ---------------------------------------------------------------------------

import React from "react";
import { OPTIMISER_FAMILY_STATUS, OPTIMISER_RUN_FAMILY } from "./optimiserRunFamilies.js";
import { LEAST_INTRUSIVE_NOTE, leverTitle } from "./optimiserLeverOrder.js";
import { OPTIMISER_LEVER_VERDICT, resolveLeverVerdict } from "./optimiserLeverVerdict.js";
import { deltaText, deviationText, frequencyText, levelText } from "./optimiserWholeNumberDb.js";
import CrossoverRegionPhaseEvidence from "./CrossoverRegionPhaseEvidence.jsx";

/**
 * What a family's counter actually counts. Polarity is explored inside the
 * per-candidate proxy search, so its number is proxy searches — never presented
 * as confirmed candidates.
 */
const FAMILY_COUNT_UNIT = Object.freeze({
  [OPTIMISER_RUN_FAMILY.POLARITY]: "proxy searches",
});

const familyCountUnit = (familyKey) => FAMILY_COUNT_UNIT[familyKey] || "confirmed";

const UNAVAILABLE = "Not published for this design";

/** Verdicts worth a pill — the reason this lever is not being offered. */
const PILL_VERDICTS = new Set([
  OPTIMISER_LEVER_VERDICT.RECOMMENDED,
  OPTIMISER_LEVER_VERDICT.TRADE_OFF,
  OPTIMISER_LEVER_VERDICT.REJECTED,
  OPTIMISER_LEVER_VERDICT.NO_IMPROVEMENT,
]);

function verdictPillStyle(verdict) {
  if (verdict === OPTIMISER_LEVER_VERDICT.RECOMMENDED) return { background: "#E7F0E9", border: "#9DB8A4", color: "#213428" };
  if (verdict === OPTIMISER_LEVER_VERDICT.TRADE_OFF) return { background: "#FBF3E4", border: "#E0C48F", color: "#8A5A2B" };
  if (verdict === OPTIMISER_LEVER_VERDICT.REJECTED) return { background: "#FBEAEA", border: "#E0A9A9", color: "#B91C1C" };
  return { background: "#FFFFFF", border: "#DCDBD6", color: "#3E4349" };
}

const COUNTER_LABEL = Object.freeze({
  generated: "generated",
  screened: "screened",
  promotedToV2: "promoted",
  confirmed: "confirmed",
  coarse: "coarse",
  fine: "fine",
  retained: "retained",
  valid: "valid",
  tested: "tested",
  optionCount: "options",
  proxySearches: "proxy searches",
  currentRecalculations: "current recalculations",
});

const statusColor = (status) => {
  if (status === OPTIMISER_FAMILY_STATUS.REJECTED
    || status === OPTIMISER_FAMILY_STATUS.EVALUATED) return "#213428";
  if (status === OPTIMISER_FAMILY_STATUS.FAILED) return "#B91C1C";
  if (status === OPTIMISER_FAMILY_STATUS.NOT_TESTED_SEPARATELY) return "#8A5A2B";
  return "#8B7F76";
};

function FamilyRow({ family, current }) {
  const best = family.bestAttempt || null;
  const title = leverTitle(family.family) || family.label;
  const p20 = deviationText(best?.p20VariationDb);
  const p20Level = levelText(best?.p20Level);
  const p19 = deviationText(best?.p19VariationDb);
  const delta = deltaText(best?.p20DeltaDb);
  const verdict = resolveLeverVerdict({
    effect: best
      ? { p19DeltaDb: best.p19DeltaDb, p20DeltaDb: best.p20DeltaDb, p14DeltaDb: best.p14DeltaDb }
      : null,
    baseline: current,
    tested: family.tested === true,
    notTestedReason: family.reason || null,
  });

  return (
    <div className="border-t border-[#EFEDE8] pt-1 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="font-semibold text-[#1B1A1A]">{title}</span>
        <span style={{ color: statusColor(family.status) }}>— {family.statusLabel}</span>
        {family.candidatesEvaluated != null && (
          <span className="text-[#8B7F76]">
            · {family.candidatesEvaluated} {familyCountUnit(family.family)}
          </span>
        )}
      </div>

      {best && (
        <div className="text-[#1B1A1A]">
          <span className="text-[#8B7F76]">
            {family.bestAttemptScope === "subwoofer_phase_only"
              ? "Subwoofer phase only — best attempt: "
              : "Best attempt: "}
          </span>
          P20 {p20 || UNAVAILABLE}
          {p20Level ? ` · ${p20Level}` : ""}
          {p19 ? ` · P19 ${p19}` : ""}
          {delta ? <span className="text-[#8B7F76]"> ({delta} vs current)</span> : null}
        </div>
      )}

      {/* The verdict is what the dealer acts on: recommended, trade-off,
          rejected, or no useful improvement. */}
      {PILL_VERDICTS.has(verdict.verdict) ? (
        <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
          <span
            className="text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap"
            style={verdictPillStyle(verdict.verdict)}
          >
            {verdict.label}
          </span>
          <span className="text-[#625143]">{verdict.summary}</span>
        </div>
      ) : (
        family.reason && <div className="text-[#625143]">{family.reason}</div>
      )}

      {/* Phase / crossover-region alignment states its band, its purpose and
          whether the region is evaluated at all. */}
      <CrossoverRegionPhaseEvidence region={family.crossoverRegion} />

      {family.reason && best && (
        <details className="mt-0.5">
          <summary className="cursor-pointer text-[10px] text-[#8B7F76]">Technical details</summary>
          <div className="mt-0.5 text-[10px] text-[#8B7F76] leading-relaxed">
            {family.reason}
            {best.candidateId ? ` · candidate ${best.candidateId}` : ""}
          </div>
        </details>
      )}

      {!family.applicable && family.tested !== true && (
        <div className="text-[#8B7F76]">Nothing from this family can be applied.</div>
      )}
    </div>
  );
}

export default function OptimiserRunEvidenceBlock({ evidence = null, className = "" }) {
  if (!evidence) return null;
  const best = evidence.bestAttempted || null;
  const current = evidence.current || null;
  const families = Array.isArray(evidence.families) ? evidence.families : [];
  const stageOperations = Array.isArray(evidence.stageOperations) ? evidence.stageOperations : [];
  const baselineFailed = evidence.baselineValidation?.valid === false;

  const currentP20 = deviationText(current?.p20VariationDb);
  const bestP20 = deviationText(best?.p20VariationDb);
  const bestLevel = levelText(best?.p20Level);
  const delta = deltaText(best?.p20DeltaDb);
  const calculationCount = evidence.canonicalJobsRun ?? evidence.candidatesEvaluated ?? null;

  const headlineRows = [];
  if (evidence.canonicalJobsRun != null) headlineRows.push(["Optimiser jobs run", `${evidence.canonicalJobsRun}`]);
  if (evidence.candidatesEvaluated != null) headlineRows.push(["Candidates confirmed", `${evidence.candidatesEvaluated}`]);
  if (evidence.resultsRetained != null) headlineRows.push(["Result records retained", `${evidence.resultsRetained}`]);
  headlineRows.push([
    "Run outcome",
    evidence.outcome === "evaluation_incomplete"
      ? "Incomplete — no usable comparison"
      : "Complete — no useful improvement confirmed",
  ]);

  return (
    <div className={`rounded-md border border-[#E7E5E0] bg-[#FAFAF9] p-2.5 ${className}`}>
      <div className="text-[10px] font-semibold tracking-wide text-[#3E4349]">BASS OPTIMISATION RESULT</div>

      <div className="mt-1 text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">
        {calculationCount != null
          ? `ADI tested ${calculationCount} design calculations.`
          : "ADI completed the optimisation search."}
      </div>
      <div className="mt-0.5 text-[11px] text-[#3E4349] leading-relaxed">
        {baselineFailed || evidence.outcome === "evaluation_incomplete"
          ? "No usable recommendation was confirmed because the evaluation did not complete."
          : "No safe improvement was confirmed for this design."}
      </div>
      {best && (
        <div className="mt-1 text-[11px] text-[#1B1A1A] leading-relaxed">
          <span className="text-[#8B7F76]">Best attempt (not applied): </span>
          P20 {bestP20 || UNAVAILABLE}
          {bestLevel ? ` · ${bestLevel}` : ""}
          {delta ? <span className="text-[#8B7F76]"> ({delta} vs current)</span> : null}
        </div>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-[#625143]">Engineer details</summary>
        <div className="mt-1 space-y-0.5 text-[11px] text-[#625143]">
        {headlineRows.map(([label, value]) => (
          <div key={label}>
            <span className="text-[#8B7F76]">{label}: </span>
            <span className="text-[#1B1A1A]">{value}</span>
          </div>
        ))}
        {evidence.completedAt && (
          <div>
            <span className="text-[#8B7F76]">Run completed: </span>
            <span className="text-[#1B1A1A]">{new Date(evidence.completedAt).toLocaleString()}</span>
          </div>
        )}
      </div>

      {evidence.candidatesEvaluated > 0 && (
        <div className="mt-1.5 text-[12px] font-semibold text-[#1B1A1A] leading-relaxed">
          ADI completed {evidence.candidatesEvaluated} confirmed design calculations
          {evidence.candidatesEvaluatedBasis === "stage-confirmed-max"
            ? " across the searched stages"
            : ""}
          .
        </div>
      )}

      {baselineFailed && (
        <div className="mt-1.5 text-[11px] text-[#8A5A2B] leading-relaxed">
          The current design could not be validated, so no candidate could be compared against it.
        </div>
      )}

      <div className="mt-1.5 space-y-0.5 text-[11px]">
        <div className="text-[#1B1A1A]">
          <span className="text-[#8B7F76]">Current P20 (canonical): </span>
          {currentP20 || UNAVAILABLE}
          {current?.worstSeatId ? ` · worst seat ${current.worstSeatId}` : ""}
          {current?.worstFrequencyHz != null ? ` at ${Math.round(Number(current.worstFrequencyHz))} Hz` : ""}
        </div>
        {best && (
          <div className="text-[#1B1A1A]">
            <span className="text-[#8B7F76]">Best attempted (not applied): </span>
            P20 {bestP20 || UNAVAILABLE}
            {bestLevel ? ` · ${bestLevel}` : ""}
            {delta ? <span className="text-[#8B7F76]"> ({delta} vs current)</span> : null}
          </div>
        )}
      </div>

      {families.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-semibold tracking-wide text-[#3E4349]">
            EVERY LEVER THE OPTIMISER CAN SEARCH — LEAST INTRUSIVE FIRST
          </div>
          <div className="mt-0.5 text-[10px] text-[#8B7F76] leading-relaxed">{LEAST_INTRUSIVE_NOTE}</div>
          <div className="mt-1 space-y-1 text-[11px] leading-relaxed">
            {families.map((family) => <FamilyRow key={family.family} family={family} current={current} />)}
          </div>
        </div>
      )}

      {stageOperations.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-semibold tracking-wide text-[#3E4349]">STAGE OPERATIONS</div>
          <div className="mt-0.5 space-y-0.5 text-[11px] text-[#625143]">
            {stageOperations.map((entry) => (
              <div key={entry.stage}>
                <span className="text-[#1B1A1A]">{entry.stage}: </span>
                {entry.counters
                  .map((counter) => `${COUNTER_LABEL[counter.key] || counter.key} ${counter.value}`)
                  .join(" · ")}
              </div>
            ))}
          </div>
          {evidence.stageOperationsNote && (
            <div className="mt-0.5 text-[10px] text-[#8B7F76] leading-relaxed">
              {evidence.stageOperationsNote}
            </div>
          )}
        </div>
      )}

        {evidence.rejectionReasons?.length > 0 && (
          <div className="mt-1.5 text-[11px] text-[#8A5A2B] leading-relaxed">
            {evidence.rejectionReasons.map((reason) => <div key={reason}>{reason}</div>)}
          </div>
        )}
      </details>

      <div className="mt-1.5 text-[10px] text-[#8B7F76] leading-relaxed">
        {evidence.designUnchanged
          ? "The current design was not changed — nothing was applied."
          : "The design was changed during the run."}
        {best && !best.validationPassed ? " The rejected candidate is shown as evidence only and cannot be applied." : ""}
        {families.some((family) => family.status === OPTIMISER_FAMILY_STATUS.NOT_TESTED_SEPARATELY)
          ? " A family marked not tested separately has no standalone evaluation — its value can only come from a combined candidate."
          : ""}
      </div>
    </div>
  );
}