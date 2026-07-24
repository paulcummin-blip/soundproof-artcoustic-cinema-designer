import React from "react";
import DiagnosticSection from "@/components/room/bass/design-eq-lifecycle/DiagnosticSection";
import DiagnosticTable, { fmt, yesNo } from "@/components/room/bass/design-eq-lifecycle/DiagnosticTable";

export default function CandidateAcceptanceSection({ rows }) {
  return <DiagnosticSection title="2. Candidate acceptance diagnostics"><DiagnosticTable rows={rows} columns={[
    { key: "action", label: "Action" }, { key: "frequencyHz", label: "Frequency", render: (row) => `${fmt(row.frequencyHz)} Hz` },
    { key: "proposedGainDb", label: "Proposed gain", render: (row) => `${fmt(row.proposedGainDb)} dB` }, { key: "proposedQ", label: "Proposed Q", render: (row) => fmt(row.proposedQ) },
    { key: "classification", label: "Classification" }, { key: "localImprovementDb", label: "Local improvement", render: (row) => fmt(row.localImprovementDb) },
    { key: "maximumDeviationReductionDb", label: "Max reduction", render: (row) => fmt(row.maximumDeviationReductionDb) }, { key: "rmsReductionDb", label: "RMS reduction", render: (row) => fmt(row.rmsReductionDb) },
    { key: "modalAcceptanceResult", label: "Modal accepted", render: (row) => yesNo(row.modalAcceptanceResult ?? row.majorModalCorrectionAcceptable) },
    { key: "normalRefinementAcceptable", label: "Normal accepted", render: (row) => yesNo(row.normalRefinementAcceptable) }, { key: "accepted", label: "Accepted", render: (row) => yesNo(row.accepted) },
    { key: "reason", label: "Reason" },
  ]} /></DiagnosticSection>;
}