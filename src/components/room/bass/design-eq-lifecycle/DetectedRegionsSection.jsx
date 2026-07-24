import React from "react";
import DiagnosticSection from "@/components/room/bass/design-eq-lifecycle/DiagnosticSection";
import DiagnosticTable, { fmt, yesNo } from "@/components/room/bass/design-eq-lifecycle/DiagnosticTable";

export default function DetectedRegionsSection({ rows }) {
  return <DiagnosticSection title="1. Detected regions"><DiagnosticTable rows={rows} columns={[
    { key: "iteration", label: "Iteration" },
    { key: "frequencyHz", label: "Frequency", render: (row) => `${fmt(row.frequencyHz)} Hz` },
    { key: "kind", label: "Kind" },
    { key: "severityDb", label: "Severity", render: (row) => `${fmt(row.severityDb)} dB` },
    { key: "insideProtectedNull", label: "Protected null", render: (row) => yesNo(row.insideProtectedNull) },
  ]} /></DiagnosticSection>;
}