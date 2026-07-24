import React from "react";
import DiagnosticSection from "@/components/room/bass/design-eq-lifecycle/DiagnosticSection";
import DiagnosticTable, { fmt, text } from "@/components/room/bass/design-eq-lifecycle/DiagnosticTable";

export const FILTER_COLUMNS = [
  { key: "band", label: "Band" },
  { key: "frequencyHz", label: "Frequency", render: (row) => `${fmt(row.frequencyHz)} Hz` },
  { key: "gainDb", label: "Gain", render: (row) => `${fmt(row.gainDb)} dB` },
  { key: "Q", label: "Q", render: (row) => fmt(row.Q) },
];

export default function FinalBankSection({ bank, enabledBank, stopReason }) {
  return <DiagnosticSection title="4. Final EQ bank">
    <div className="mb-2 grid gap-1 font-mono text-[10px] sm:grid-cols-3"><span>Total slots: <strong>{bank.length || "No data"}</strong></span><span>Enabled: <strong>{enabledBank.length}</strong></span><span>Stop reason: <strong>{text(stopReason)}</strong></span></div>
    <DiagnosticTable rows={enabledBank} columns={FILTER_COLUMNS} />
  </DiagnosticSection>;
}