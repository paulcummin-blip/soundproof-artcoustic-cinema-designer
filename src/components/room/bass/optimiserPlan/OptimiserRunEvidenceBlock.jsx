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
import { OPTIMISER_FAMILY_STATUS } from "./optimiserRunFamilies.js";

/** A published number, or null. Never turns an unavailable metric into 0.00. */
const fmt = (value, digits = 2, unit = "") => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(digits)}${unit}` : null;
};

const UNAVAILABLE = "Not published for this design";

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

function FamilyRow({ family }) {
  const best = family.bestAttempt || null;
  const p20 = fmt(best?.p20VariationDb, 2, " dB");
  const p19 = fmt(best?.p19VariationDb, 2, " dB");
  const delta = best?.p20DeltaDb != null
    ? ` (${best.p20DeltaDb < 0 ? "−" : "+"}${Math.abs(best.p20DeltaDb).toFixed(2)} dB vs current)`
    : "";

  return (
    <div className="border-t border-[#EFEDE8] pt-1 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-1.5">
        <span className="font-semibold text-[#1B1A1A]">{family.label}</span>
        <span style={{ color: statusColor(family.status) }}>— {family.statusLabel}</span>
        {family.candidatesEvaluated != null && (
          <span className="text-[#8B7F76]">· {family.candidatesEvaluated} confirmed</span>
        )}
      </div>
      {best && (
        <div className="text-[#1B1A1A]">
          <span className="text-[#8B7F76]">Best attempt: </span>
          {best.candidateId ? `${best.candidateId} · ` : ""}
          P20 {p20 || UNAVAILABLE}
          {best.p20Level ? ` · L${best.p20Level}` : ""}
          {p19 ? ` · P19 ${p19}` : ""}
          {delta ? <span className="text-[#8B7F76]">{delta}</span> : null}
        </div>
      )}
      {family.reason && <div className="text-[#625143]">{family.reason}</div>}
      {!family.applicable && (
        <div className="text-[#8B7F76]">Not applicable — no confirmed winner.</div>
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

  const currentP20 = fmt(current?.p20VariationDb, 2, " dB");
  const bestP20 = fmt(best?.p20VariationDb, 2, " dB");
  const delta = best?.p20DeltaDb != null
    ? `${best.p20DeltaDb < 0 ? "−" : "+"}${Math.abs(best.p20DeltaDb).toFixed(2)} dB`
    : null;

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
      <div className="text-[10px] font-semibold tracking-wide text-[#3E4349]">RUN EVIDENCE</div>

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
            <span className="text-[#8B7F76]">Best attempted (rejected): </span>
            {best.candidateId ? `${best.candidateId} · ` : ""}P20 {bestP20 || UNAVAILABLE}
            {best.p20Level ? ` · L${best.p20Level}` : ""}
            {delta ? <span className="text-[#8B7F76]"> ({delta} vs current)</span> : null}
          </div>
        )}
      </div>

      {families.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-semibold tracking-wide text-[#3E4349]">
            EVERY FAMILY THE OPTIMISER CAN SEARCH
          </div>
          <div className="mt-1 space-y-1 text-[11px] leading-relaxed">
            {families.map((family) => <FamilyRow key={family.family} family={family} />)}
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