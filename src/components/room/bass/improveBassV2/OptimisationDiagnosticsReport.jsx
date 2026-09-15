// OptimisationDiagnosticsReport.jsx
// Developer/debug ONLY collapsible panel that renders the V2 optimisation
// diagnostics report. Mounted behind the SHOW_DEBUG_PANEL flag so it never
// appears in production. Read-only — displays data the engine already
// produced; does not alter optimiser behaviour.

import React, { useState } from "react";
import { ChevronDown, ChevronRight, Bug } from "lucide-react";
import { SHOW_DEBUG_PANEL } from "@/components/utils/diagnostics";

function fmt(value) {
  if (value == null) return "—";
  if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(2) : "—";
  return String(value);
}

function ScoreCell({ score }) {
  if (!score) return <span className="text-gray-400">—</span>;
  return (
    <span className="text-[10px] leading-tight">
      <span className="text-gray-500">P19</span> {fmt(score.p19VariationDb)}dB L{fmt(score.p19Level)}
      <span className="text-gray-400"> · </span>
      <span className="text-gray-500">P20</span> {fmt(score.p20VariationDb)}dB L{fmt(score.p20Level)}
    </span>
  );
}

function SignificanceBadge({ significance }) {
  const colors = {
    significant: "bg-green-100 text-green-800 border-green-300",
    negligible: "bg-amber-100 text-amber-800 border-amber-300",
    none: "bg-gray-100 text-gray-600 border-gray-300",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${colors[significance] || colors.none}`}>
      {significance}
    </span>
  );
}

function TuningTable({ detail }) {
  if (!detail) return <span className="text-gray-400 text-[10px]">none</span>;
  const subs = (detail.gainPerSub || []).map((_, i) => i);
  if (!subs.length) return <span className="text-gray-400 text-[10px]">none</span>;
  return (
    <table className="text-[10px] border-collapse">
      <thead>
        <tr className="text-gray-500">
          <th className="px-1.5 py-0.5 text-left font-medium">Sub</th>
          <th className="px-1.5 py-0.5 text-right font-medium">Gain dB</th>
          <th className="px-1.5 py-0.5 text-right font-medium">Delay ms</th>
          <th className="px-1.5 py-0.5 text-right font-medium">Pol</th>
          <th className="px-1.5 py-0.5 text-right font-medium">Phase °</th>
        </tr>
      </thead>
      <tbody>
        {subs.map((i) => (
          <tr key={i} className="border-t border-gray-100">
            <td className="px-1.5 py-0.5">{i + 1}</td>
            <td className="px-1.5 py-0.5 text-right">{fmt(detail.gainPerSub[i])}</td>
            <td className="px-1.5 py-0.5 text-right">{fmt(detail.delayPerSub[i])}</td>
            <td className="px-1.5 py-0.5 text-right">{fmt(detail.polarityPerSub[i])}</td>
            <td className="px-1.5 py-0.5 text-right">{fmt(detail.phasePerSub[i])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StageRow({ stage }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-50"
      >
        {open ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
        <span className="text-[11px] font-semibold text-gray-800 w-20">{stage.name}</span>
        <SignificanceBadge significance={stage.significance} />
        <span className="text-[10px] text-gray-500 ml-auto">
          {stage.improvement?.p19VarDelta != null ? `P19 Δ ${fmt(stage.improvement.p19VarDelta)}dB` : ""}
        </span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1.5 bg-gray-50/50">
          <div className="text-[10px] text-gray-600">
            <span className="font-medium">Candidates:</span>{" "}
            <code className="text-[9px]">{JSON.stringify(stage.candidatesEvaluated)}</code>
          </div>
          <div className="flex gap-4 text-[10px]">
            <div>
              <span className="text-gray-500 font-medium">Before:</span> <ScoreCell score={stage.bestScoreBefore} />
            </div>
            <div>
              <span className="text-gray-500 font-medium">After:</span> <ScoreCell score={stage.bestScoreAfter} />
            </div>
          </div>
          {stage.improvement && (
            <div className="text-[10px] text-gray-600">
              <span className="font-medium">Improvement:</span>{" "}
              P19 {fmt(stage.improvement.p19VarDelta)}dB / P20 {fmt(stage.improvement.p20VarDelta)}dB
              {stage.improvement.p19LevelDelta != null ? ` · LΔ P19 ${fmt(stage.improvement.p19LevelDelta)}` : ""}
            </div>
          )}
          {stage.acousticPerformance && (
            <div className="text-[10px] text-gray-600 space-y-0.5 pt-0.5">
              <div className="font-medium text-gray-700">Acoustic performance</div>
              <div className="flex gap-4">
                <span>
                  <span className="text-gray-500">P19:</span> {fmt(stage.acousticPerformance.p19?.before)} → {fmt(stage.acousticPerformance.p19?.after)} dB
                  {stage.acousticPerformance.p19?.improvement != null && (
                    <span className={stage.acousticPerformance.p19.improvement > 0 ? "text-green-600 font-medium" : "text-gray-500"}>
                      {" "}({fmt(stage.acousticPerformance.p19.improvement)} dB)
                    </span>
                  )}
                </span>
                <span>
                  <span className="text-gray-500">P20:</span> {fmt(stage.acousticPerformance.p20?.before)} → {fmt(stage.acousticPerformance.p20?.after)} dB
                  {stage.acousticPerformance.p20?.improvement != null && (
                    <span className={stage.acousticPerformance.p20.improvement > 0 ? "text-green-600 font-medium" : "text-gray-500"}>
                      {" "}({fmt(stage.acousticPerformance.p20.improvement)} dB)
                    </span>
                  )}
                </span>
              </div>
              {stage.acousticPerformance.seatStats && (
                <div className="flex gap-4">
                  {stage.acousticPerformance.seatStats.p19 && (
                    <span>
                      <span className="text-gray-500">P19 seats:</span>{" "}
                      worst {fmt(stage.acousticPerformance.seatStats.p19.worst)} ·
                      avg {fmt(stage.acousticPerformance.seatStats.p19.average)} ·
                      best {fmt(stage.acousticPerformance.seatStats.p19.best)}
                    </span>
                  )}
                  {stage.acousticPerformance.seatStats.p20 && (
                    <span>
                      <span className="text-gray-500">P20 seats:</span>{" "}
                      worst {fmt(stage.acousticPerformance.seatStats.p20.worst)} ·
                      avg {fmt(stage.acousticPerformance.seatStats.p20.average)} ·
                      best {fmt(stage.acousticPerformance.seatStats.p20.best)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
          {stage.winningSubSettings && (
            <div className="text-[10px] text-gray-600">
              <span className="font-medium text-gray-700">Winning sub settings:</span>{" "}
              delay [{(stage.winningSubSettings.delay || []).map(fmt).join(", ")}] ·
              gain [{(stage.winningSubSettings.gain || []).map(fmt).join(", ")}] ·
              polarity [{(stage.winningSubSettings.polarity || []).map(fmt).join(", ")}] ·
              phase [{(stage.winningSubSettings.phase || []).map(fmt).join(", ")}]
            </div>
          )}
          {stage.winningCandidate && (
            <div className="pt-1">
              <div className="text-[10px] font-medium text-gray-700 mb-0.5">Winning candidate tuning</div>
              <TuningTable detail={stage.winningCandidate} />
              <div className="text-[10px] text-gray-600 mt-1">
                P14: {fmt(stage.winningCandidate.resultingP14?.db)}dB L{fmt(stage.winningCandidate.resultingP14?.level)}
                {" · "}P18: {fmt(stage.winningCandidate.resultingP18?.hz)}Hz L{fmt(stage.winningCandidate.resultingP18?.level)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OptimisationDiagnosticsReport({ report }) {
  const [open, setOpen] = useState(false);
  if (!SHOW_DEBUG_PANEL) return null;
  if (!report) return null;

  return (
    <div className="mt-2 border border-dashed border-gray-300 rounded">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-50"
      >
        <Bug className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-[11px] font-semibold text-gray-700">Optimisation Diagnostics (debug)</span>
        {open ? <ChevronDown className="w-3 h-3 text-gray-400 ml-auto" /> : <ChevronRight className="w-3 h-3 text-gray-400 ml-auto" />}
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1.5">
          <div className="text-[10px] text-gray-500">
            Fingerprint: <code className="text-[9px]">{report.runFingerprint || "—"}</code>
            {" · "}Duration: {fmt(report.totalDurationMs)}ms
          </div>
          {report.stages.map((stage) => (
            <StageRow key={stage.name} stage={stage} />
          ))}
          {report.winningCandidate && (
            <div className="pt-1 border-t border-gray-200">
              <div className="text-[10px] font-semibold text-gray-700 mb-0.5">Overall winning candidate</div>
              <TuningTable detail={report.winningCandidate} />
              <div className="text-[10px] text-gray-600 mt-1">
                P14: {fmt(report.winningCandidate.resultingP14?.db)}dB L{fmt(report.winningCandidate.resultingP14?.level)}
                {" · "}P18: {fmt(report.winningCandidate.resultingP18?.hz)}Hz L{fmt(report.winningCandidate.resultingP18?.level)}
              </div>
            </div>
          )}
          {report.topCandidatesForWinningStage?.length > 0 && (
            <div className="pt-1 border-t border-gray-200">
              <div className="text-[10px] font-semibold text-gray-700 mb-0.5">
                Top 10 candidates (winning stage: {report.winningStage || "?"})
              </div>
              <table className="text-[9px] border-collapse w-full">
                <thead>
                  <tr className="text-gray-500">
                    <th className="px-1 py-0.5 text-left font-medium">#</th>
                    <th className="px-1 py-0.5 text-left font-medium">Id</th>
                    <th className="px-1 py-0.5 text-right font-medium">P19 dB</th>
                    <th className="px-1 py-0.5 text-right font-medium">P20 dB</th>
                    <th className="px-1 py-0.5 text-left font-medium">Delay</th>
                    <th className="px-1 py-0.5 text-left font-medium">Gain</th>
                    <th className="px-1 py-0.5 text-left font-medium">Pol</th>
                    <th className="px-1 py-0.5 text-left font-medium">Phase</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topCandidatesForWinningStage.map((c, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-1 py-0.5">{i + 1}</td>
                      <td className="px-1 py-0.5">{c.candidateId ?? "—"}</td>
                      <td className="px-1 py-0.5 text-right">{fmt(c.score?.p19VariationDb)}</td>
                      <td className="px-1 py-0.5 text-right">{fmt(c.score?.p20VariationDb)}</td>
                      <td className="px-1 py-0.5">{(c.delay || []).map(fmt).join(",")}</td>
                      <td className="px-1 py-0.5">{(c.gain || []).map(fmt).join(",")}</td>
                      <td className="px-1 py-0.5">{(c.polarity || []).map(fmt).join(",")}</td>
                      <td className="px-1 py-0.5">{(c.phase || []).map(fmt).join(",")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {report.stageContributions?.length > 0 && (
            <div className="pt-1 border-t border-gray-200">
              <div className="text-[10px] font-semibold text-gray-700 mb-0.5">Stage contributions to final result</div>
              <div className="space-y-0.5">
                {report.stageContributions.map((c) => (
                  <div key={c.name} className="flex items-center gap-2 text-[10px]">
                    <span className="text-gray-600 w-20">{c.name}</span>
                    <div className="flex-1 bg-gray-100 rounded h-2 overflow-hidden">
                      <div className="bg-[#213428] h-full" style={{ width: `${c.contributionPercent}%` }} />
                    </div>
                    <span className="text-gray-700 font-medium w-8 text-right">{c.contributionPercent}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}