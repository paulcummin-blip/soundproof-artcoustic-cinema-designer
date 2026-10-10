// AdiAppliedBassCalibration.jsx
// ---------------------------------------------------------------------------
// What ADI has ALREADY applied, and what still needs the designer.
//
// Two clearly separated lists, never merged:
//
//   1. ADI Applied Bass Calibration — the calibration settings ADI applied on
//      its own (delay, group delay, rear-sub offset, gain trim, polarity,
//      all-pass phase), each with its previous value, the new value, the
//      objective it served and the canonical P19/P20 before and after.
//
//   2. Recommended design changes — the physical changes ADI found but must not
//      apply. Each states its confirmed benefit and that it awaits approval.
//
// Presentation only. It reads the decision authority's own record and the
// persisted Applied Calibration authority; it computes no engineering value and
// never claims an improvement the canonical results do not carry.
// ---------------------------------------------------------------------------

import React from "react";
import { CheckCircle2, Wrench, MoveHorizontal } from "lucide-react";
import {
  ADI_APPLIED_CALIBRATION_TITLE,
  ADI_DESIGN_CHANGE_SUBTITLE,
  ADI_DESIGN_CHANGE_TITLE,
  CALIBRATION_APPLY_DECISION,
  formatLevelValue,
} from "../optimiseWorkflow/adiCalibrationAutoApplyAuthority.js";

const SETTLED = { border: "#CFDCCF", background: "#F4F7F4", accent: "#213428" };
const AWAITING = { border: "#E8D5AE", background: "#FDF6E9", accent: "#B45309" };

function ValueRow({ label, before, after, highlight }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
      <span className="text-[#625143]">{label}</span>
      <span className="font-semibold text-[#1B1A1A]" style={highlight ? { color: SETTLED.accent } : undefined}>
        {before} → {after}
      </span>
    </div>
  );
}

/** Setting / previous / new, as the designer will enter it on site. */
function SettingsTable({ settings }) {
  if (!settings?.length) return null;
  return (
    <div className="overflow-hidden rounded-md border border-[#E7E5E0] bg-white">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-[#F7F6F3] text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
            <th className="px-2 py-1.5">Setting</th>
            <th className="px-2 py-1.5">Subwoofer</th>
            <th className="px-2 py-1.5">Previous</th>
            <th className="px-2 py-1.5">Applied</th>
          </tr>
        </thead>
        <tbody>
          {settings.map((row) => (
            <tr key={row.key} className="border-t border-[#EFEDE8] text-[11px] text-[#3E4349]">
              <td className="px-2 py-1.5 font-medium text-[#1B1A1A]">{row.setting}</td>
              <td className="px-2 py-1.5">{row.label}</td>
              <td className="px-2 py-1.5">{row.from}</td>
              <td className="px-2 py-1.5 font-semibold text-[#213428]">{row.to}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The settings a previously applied calibration is holding, with no history. */
function AppliedValuesList({ appliedCalibration }) {
  const values = Array.isArray(appliedCalibration?.values) ? appliedCalibration.values : [];
  if (!values.length) return null;
  return (
    <div className="space-y-0.5 text-[11px] text-[#3E4349]">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        Applied calibration in this design
      </div>
      {values.map((value, index) => (
        <div key={String(value.id || index)}>
          Sub {index + 1}: delay {Number(value.delayMs) || 0} ms · gain {(Number(value.gainDb) || 0) > 0 ? "+" : ""}
          {Number(value.gainDb) || 0} dB · polarity {Number(value.polarity) < 0 ? "inverted" : "normal"} · phase{" "}
          {Math.round(Number(value.phaseControlDeg) || 0)}° at 80 Hz
        </div>
      ))}
      {appliedCalibration.status && (
        <div className="text-[10px] text-[#8A7B6A]">Authority: {appliedCalibration.status}</div>
      )}
    </div>
  );
}

export default function AdiAppliedBassCalibration({
  evidence = null,
  appliedCalibration = null,
  designChanges = [],
  className = "",
}) {
  const decision = evidence?.decision || null;
  const applied = decision === CALIBRATION_APPLY_DECISION.APPLIED;
  const held = decision === CALIBRATION_APPLY_DECISION.HOLD;
  const nothing = decision === CALIBRATION_APPLY_DECISION.NONE;
  const hasPersistedValues = Array.isArray(appliedCalibration?.values) && appliedCalibration.values.length > 0;
  const changes = Array.isArray(designChanges) ? designChanges : [];

  if (!applied && !held && !nothing && !hasPersistedValues && !changes.length) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      {/* ── 1. What ADI applied on its own ── */}
      {applied && (
        <div
          className="space-y-2 rounded-md border px-3 py-2"
          style={{ borderColor: SETTLED.border, background: SETTLED.background }}
          data-adi-applied-calibration="true"
        >
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: SETTLED.accent }} />
            <span className="text-[13px] font-bold text-[#1B1A1A]">{ADI_APPLIED_CALIBRATION_TITLE}</span>
            <span
              className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase text-white"
              style={{ background: SETTLED.accent }}
            >
              Applied
            </span>
          </div>

          <div className="text-[12px] text-[#3E4349] leading-relaxed">
            {evidence.statement}
          </div>

          {evidence.objectiveLabel && (
            <div className="text-[11px] text-[#625143]">
              Objective: <span className="font-semibold text-[#1B1A1A]">{evidence.objectiveLabel}</span>
            </div>
          )}

          <SettingsTable settings={evidence.settings} />

          <div className="space-y-1">
            <ValueRow
              label="P19"
              before={formatLevelValue(evidence.before?.p19?.level, evidence.before?.p19?.deviationDb)}
              after={formatLevelValue(evidence.after?.p19?.level, evidence.after?.p19?.deviationDb)}
              highlight={evidence.improvement?.p19Improved}
            />
            <ValueRow
              label="P20"
              before={formatLevelValue(evidence.before?.p20?.level, evidence.before?.p20?.deviationDb)}
              after={formatLevelValue(evidence.after?.p20?.level, evidence.after?.p20?.deviationDb)}
              highlight={evidence.improvement?.p20Improved}
            />
            {(evidence.limitingSeat?.before || evidence.limitingSeat?.after) && (
              <div className="text-[12px] text-[#625143]">
                Limiting seat:{" "}
                <span className="font-semibold text-[#1B1A1A]">
                  {evidence.limitingSeat.before || "unavailable"}
                  {evidence.limitingSeat.after && evidence.limitingSeat.after !== evidence.limitingSeat.before
                    ? ` → ${evidence.limitingSeat.after}`
                    : ""}
                </span>
              </div>
            )}
          </div>

          {evidence.inRoomNote && (
            <div className="text-[10px] text-[#8A7B6A] leading-relaxed">{evidence.inRoomNote}</div>
          )}
        </div>
      )}

      {/* Nothing was applied: the applied calibration already in the design is
          still stated — from the persisted authority, with no invented history. */}
      {!applied && hasPersistedValues && (
        <div
          className="space-y-1.5 rounded-md border border-[#E7E5E0] bg-white px-3 py-2"
          data-adi-applied-calibration="persisted"
        >
          <div className="flex items-center gap-2">
            <Wrench className="h-3.5 w-3.5 text-[#625143]" />
            <span className="text-[12px] font-bold text-[#1B1A1A]">{ADI_APPLIED_CALIBRATION_TITLE}</span>
          </div>
          <AppliedValuesList appliedCalibration={appliedCalibration} />
        </div>
      )}

      {/* ── A candidate that was confirmed but NOT applied ── */}
      {held && (
        <div
          className="space-y-1 rounded-md border px-3 py-2"
          style={{ borderColor: AWAITING.border, background: AWAITING.background }}
          data-adi-calibration-held="true"
        >
          <div className="text-[12px] font-semibold" style={{ color: AWAITING.accent }}>
            Calibration change confirmed — not applied
          </div>
          <div className="text-[11px] leading-relaxed" style={{ color: AWAITING.accent }}>
            {evidence.statement}
          </div>
          <SettingsTable settings={evidence.settings} />
        </div>
      )}

      {nothing && (
        <div className="text-[11px] text-[#625143] leading-relaxed" data-adi-calibration-none="true">
          {evidence.statement}
        </div>
      )}

      {/* ── 2. What still needs the designer ── */}
      {changes.length > 0 && (
        <div
          className="space-y-1.5 rounded-md border px-3 py-2"
          style={{ borderColor: AWAITING.border, background: AWAITING.background }}
          data-adi-design-changes="true"
        >
          <div className="flex items-center gap-2">
            <MoveHorizontal className="h-3.5 w-3.5" style={{ color: AWAITING.accent }} />
            <span className="text-[12px] font-bold" style={{ color: AWAITING.accent }}>
              {ADI_DESIGN_CHANGE_TITLE}
            </span>
          </div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: AWAITING.accent }}>
            {ADI_DESIGN_CHANGE_SUBTITLE}
          </div>
          {changes.map((change) => (
            <div key={change.key} className="text-[11px] leading-relaxed" style={{ color: AWAITING.accent }}>
              {change.statement}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}