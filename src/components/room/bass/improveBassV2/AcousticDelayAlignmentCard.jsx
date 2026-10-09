// AcousticDelayAlignmentCard.jsx
// ---------------------------------------------------------------------------
// "Best acoustic delay" — the installer-facing statement of the grouped
// front/rear delay search.
//
// It is a DETAIL of the delay lever ADI already tested, not a second
// recommendation surface: it renders inside the tested-options area of the one
// optimiser card. Every number it shows was confirmed canonically by the
// optimiser; when nothing improved it says so.
//
// Wording is deliberate: distance timing is correct, the acoustic optimum may
// differ.
// ---------------------------------------------------------------------------

import React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { buildAcousticDelayAlignment } from "./acousticDelayAlignment.js";

function levelText(level) {
  if (!Number.isFinite(Number(level))) return "—";
  const value = Number(level);
  return value > 0 ? `L${value}` : "FAIL";
}

function fmtDb(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} dB` : "—";
}

function deltaText(delta) {
  const value = Number(delta);
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) <= 0.05) return "unchanged";
  return value > 0
    ? `${value.toFixed(1)} dB better`
    : `${Math.abs(value).toFixed(1)} dB worse`;
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A] pt-[1px]">
        {label}
      </span>
      <span className="text-[11px] text-[#213428] text-right leading-relaxed">{children}</span>
    </div>
  );
}

function ValueList({ rows }) {
  if (!rows?.length) return <>—</>;
  return <>{rows.map((row) => `${row.label} ${row.value}`).join(" · ")}</>;
}

function ObjectiveMetricRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="text-[10px] leading-relaxed text-[#625143]">
      <span className="font-semibold text-[#213428]">{label}:</span>{" "}
      P19 {fmtDb(value.p19)} · P20 {fmtDb(value.p20)}
      {value.damages ? " · damages an objective" : ""}
    </div>
  );
}

function AlignmentGraph({ curves }) {
  if (!curves?.before?.length || !curves?.after?.length) return null;
  const data = curves.before.map((point, index) => ({
    hz: point.hz,
    before: point.db,
    after: curves.after[index]?.db ?? null,
  }));
  return (
    <div className="mt-2 rounded-md border border-[#E7E4DF] bg-white p-2">
      <div className="text-[10px] font-semibold text-[#213428]">
        RSP response — before / after the recommended delay
      </div>
      <div style={{ width: "100%", height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
            <CartesianGrid stroke="#EDEAE5" strokeDasharray="2 3" />
            <XAxis dataKey="hz" tick={{ fontSize: 9, fill: "#8A7B6A" }} unit=" Hz" />
            <YAxis tick={{ fontSize: 9, fill: "#8A7B6A" }} domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{ fontSize: 10, borderRadius: 6, border: "1px solid #E7E4DF" }}
              formatter={(value) => `${Number(value).toFixed(1)} dB`}
              labelFormatter={(label) => `${label} Hz`}
            />
            <Line type="monotone" dataKey="before" name="Current" stroke="#8A7B6A" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="after" name="Recommended" stroke="#213428" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function AcousticDelayAlignmentCard({ lever = null, evidence = null, className = "" }) {
  const alignment = buildAcousticDelayAlignment({
    lever,
    evidence: evidence || lever?.alignment || null,
  });
  if (!alignment?.hasEvidence) return null;

  const before = alignment.before;
  const after = alignment.after;
  const p19 = deltaText(alignment.p19DeltaDb);
  const p20 = deltaText(alignment.p20DeltaDb);

  return (
    <section
      className={`mt-3 rounded-md border border-[#E7E4DF] bg-[#F8F7F4] p-3 ${className}`}
      data-best-acoustic-delay="true"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold text-[#213428]">{alignment.labels.title}</div>
          <div className="text-[10px] uppercase tracking-wide text-[#8A7B6A] mt-0.5">
            {alignment.labels.alignment} &middot; {alignment.labels.summation}
          </div>
        </div>
        {alignment.objectiveText && (
          <span className="rounded-full border border-[#213428] px-2 py-0.5 text-[10px] font-semibold text-[#213428]">
            {alignment.objectiveText}
          </span>
        )}
      </div>

      <div className="mt-2 divide-y divide-[#EDEAE5]">
        <Row label="Current (distance-aligned)"><ValueList rows={alignment.currentDelays} /></Row>
        <Row label="Recommended"><ValueList rows={alignment.recommendedDelays} /></Row>
        <Row label={alignment.labels.rearOffset}>{alignment.offsetText || "—"}</Row>
      </div>

      {(before || after) && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-[#8A7B6A] w-[62px]">P19</span>
            <RP22GradingPill level={before?.p19Level} compact>{levelText(before?.p19Level)}</RP22GradingPill>
            <span className="text-[11px] text-[#213428]">
              {fmtDb(before?.p19DeviationDb)} → {fmtDb(after?.p19DeviationDb)}
            </span>
            {p19 && <span className="text-[10px] text-[#625143]">({p19})</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-[#8A7B6A] w-[62px]">P20</span>
            <RP22GradingPill level={before?.p20Level} compact>{levelText(before?.p20Level)}</RP22GradingPill>
            <span className="text-[11px] text-[#213428]">
              {fmtDb(before?.p20DeviationDb)} → {fmtDb(after?.p20DeviationDb)}
            </span>
            {p20 && <span className="text-[10px] text-[#625143]">({p20})</span>}
          </div>
        </div>
      )}

      {(alignment.limitingSeatId || alignment.limitingFrequencyHz != null) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {alignment.limitingSeatId && (
            <span className="text-[10px] text-[#625143]">
              Limiting seat <span className="font-semibold text-[#213428]">{alignment.limitingSeatId}</span>
            </span>
          )}
          {alignment.limitingFrequencyHz != null && (
            <span className="text-[10px] text-[#625143]">
              Limiting frequency{" "}
              <span className="font-semibold text-[#213428]">{Number(alignment.limitingFrequencyHz).toFixed(0)} Hz</span>
            </span>
          )}
        </div>
      )}

      {alignment.objectiveCandidates && (
        <div className="mt-2 rounded-md border border-[#E7E4DF] bg-white p-2 space-y-0.5">
          <div className="text-[10px] font-semibold text-[#213428]">Delay candidates found</div>
          <ObjectiveMetricRow label="Best P19" value={alignment.objectiveCandidates.bestP19} />
          <ObjectiveMetricRow label="Best P20" value={alignment.objectiveCandidates.bestP20} />
          <ObjectiveMetricRow label="Balanced" value={alignment.objectiveCandidates.balanced} />
        </div>
      )}

      <AlignmentGraph curves={alignment.curves} />

      {alignment.statement && (
        <p className="mt-2 text-[11px] leading-relaxed text-[#213428]">{alignment.statement}</p>
      )}

      <p className="mt-1.5 text-[10px] italic leading-relaxed text-[#8A7B6A]">
        ADI: {alignment.explanation}
      </p>
      <p className="mt-1 text-[9px] leading-relaxed text-[#8A7B6A]">
        Values are the confirmed canonical results of the tested delay candidates.
      </p>
    </section>
  );
}