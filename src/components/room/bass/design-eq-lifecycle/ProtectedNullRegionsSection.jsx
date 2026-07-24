import React from "react";
import DiagnosticSection from "@/components/room/bass/design-eq-lifecycle/DiagnosticSection";
import DiagnosticTable, { fmt, yesNo } from "@/components/room/bass/design-eq-lifecycle/DiagnosticTable";

export default function ProtectedNullRegionsSection({ rows }) {
  return <DiagnosticSection title="Protected-null classification"><DiagnosticTable rows={rows} columns={[
    { key: "selectedCandidateId", label: "Candidate" },
    { key: "curveSignature", label: "Curve signature" },
    { key: "centreFrequencyHz", label: "Centre", render: (row) => `${fmt(row.centreFrequencyHz)} Hz` },
    { key: "centreSplDb", label: "Centre SPL", render: (row) => `${fmt(row.centreSplDb)} dB` },
    { key: "leftShoulderFrequencyHz", label: "Left shoulder", render: (row) => `${fmt(row.leftShoulderFrequencyHz)} Hz / ${fmt(row.leftShoulderSplDb)} dB` },
    { key: "rightShoulderFrequencyHz", label: "Right shoulder", render: (row) => `${fmt(row.rightShoulderFrequencyHz)} Hz / ${fmt(row.rightShoulderSplDb)} dB` },
    { key: "shoulderReferenceSplDb", label: "Shoulder reference", render: (row) => `${fmt(row.shoulderReferenceSplDb)} dB` },
    { key: "nullDepthDb", label: "Signed depth", render: (row) => `${fmt(row.nullDepthDb)} dB` },
    { key: "nullDepthThresholdDb", label: "Threshold", render: (row) => `${fmt(row.nullDepthThresholdDb)} dB` },
    { key: "localMinimum", label: "Local minimum", render: (row) => yesNo(row.localMinimum) },
    { key: "protected", label: "Protected", render: (row) => yesNo(row.protected) },
  ]} /></DiagnosticSection>;
}