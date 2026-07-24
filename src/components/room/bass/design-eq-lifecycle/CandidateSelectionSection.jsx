import React from "react";
import DiagnosticSection from "@/components/room/bass/design-eq-lifecycle/DiagnosticSection";
import DiagnosticTable, { fmt, text } from "@/components/room/bass/design-eq-lifecycle/DiagnosticTable";

export default function CandidateSelectionSection({ selections, sortedRows }) {
  return <DiagnosticSection title="3. Candidate selection by iteration">
    <DiagnosticTable rows={selections} columns={[
      { key: "iteration", label: "Iteration" }, { key: "acceptableCandidatesCount", label: "Acceptable count" },
      { key: "chosenFrequency", label: "Chosen frequency", render: (row) => row.chosen ? `${fmt(row.chosen.frequencyHz)} Hz` : "No data" },
      { key: "chosenGain", label: "Chosen gain", render: (row) => row.chosen ? `${fmt(row.chosen.gainDb)} dB` : "No data" },
      { key: "chosenQ", label: "Chosen Q", render: (row) => row.chosen ? fmt(row.chosen.Q) : "No data" },
      { key: "chosenClassification", label: "Chosen classification", render: (row) => text(row.chosen?.classification) }, { key: "rejectionReason", label: "Rejection reason" },
    ]} />
    <div className="mt-2 font-semibold text-slate-800">Sorted candidate order</div>
    <DiagnosticTable rows={sortedRows} columns={[
      { key: "iteration", label: "Iteration" }, { key: "rank", label: "Rank" }, { key: "action", label: "Action" },
      { key: "frequencyHz", label: "Frequency", render: (row) => `${fmt(row.frequencyHz)} Hz` }, { key: "gainDb", label: "Gain", render: (row) => `${fmt(row.gainDb)} dB` },
      { key: "Q", label: "Q", render: (row) => fmt(row.Q) }, { key: "classification", label: "Classification" },
      { key: "capabilityAdjustedObjectiveDb", label: "Capability objective", render: (row) => fmt(row.capabilityAdjustedObjectiveDb) },
    ]} />
  </DiagnosticSection>;
}