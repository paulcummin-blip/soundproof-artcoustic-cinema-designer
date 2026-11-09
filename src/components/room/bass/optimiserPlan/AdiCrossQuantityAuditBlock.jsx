// AdiCrossQuantityAuditBlock.jsx
// ---------------------------------------------------------------------------
// THE CROSS-QUANTITY AUDIT TRAIL — DEVELOPER DIAGNOSTICS ONLY.
//
// The V2 engine attaches a compact cross-quantity audit to its selection when a
// run evaluates candidate-owned finalists whose subwoofer quantity differs from
// the installed design. The trail records, per finalist: the candidate-owned
// source IDs, the admission, transfer, proxy and confirmation outcomes, and the
// final disposition. It is an audit ledger, not a second result authority: no
// response arrays, curves or tuning payloads are retained.
//
// This block is the one place the retained audit is inspectable without running
// another optimisation. It is drawn only behind the internal debug gate
// (useOptimiserDeveloperDiagnostics), so a dealer never sees it. Each receipt's
// `receiptRef` is resolved against the run's retained confirmed results (live
// after a run; absent on cold reopen) so a confirmed candidate's genuine
// canonical post-EQ P19 and individual-seat P20 evidence can be read directly.
//
// PRESENTATION ONLY: no calculation, no store, no apply logic. The resolver is
// pure and reads only the evidence handed to it.
// ---------------------------------------------------------------------------

import React from "react";
import { resolveCrossQuantityReceipt } from "../improveBassV2/crossQuantityReceiptResolver.js";

const GROUP_TITLE_CLASS = "text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]";
const LINE_CLASS = "text-[11px] text-[#3E4349] leading-relaxed";
const MUTED_CLASS = "text-[10px] text-[#8A7B6A] leading-relaxed";

function fmt(value, unit = "") {
  if (value === null || value === undefined || value === "") return "—";
  return `${value}${unit}`;
}

function ReceiptResolution({ receipt, confirmedResults }) {
  const resolved = receipt?.receiptRef
    ? resolveCrossQuantityReceipt(receipt.receiptRef, { confirmedResults })
    : null;

  if (!resolved) {
    return (
      <div className={MUTED_CLASS} data-cross-qty-receipt="no-ref">
        No canonical receipt reference recorded for this finalist.
      </div>
    );
  }

  if (resolved.status !== "available") {
    return (
      <div className={MUTED_CLASS} data-cross-qty-receipt="unavailable">
        Canonical evidence unavailable ({resolved.reason}). The run's confirmed results are no longer
        retained — rerun V2 to inspect this candidate's canonical P19/P20 evidence.
      </div>
    );
  }

  const p19 = resolved.p19AtRsp;
  const p14 = resolved.p14Headroom;
  const basis = resolved.responseBasis;
  const primary = resolved.primarySummary;
  const secondary = resolved.secondarySummary;

  return (
    <div className="space-y-1" data-cross-qty-receipt="available">
      <div className={LINE_CLASS}>
        <span className="font-medium">Canonical receipt:</span>{" "}
        {resolved.canonicalReceipt.selectedCandidateId || "—"}
        {resolved.canonicalReceipt.postEqCurveSignature
          ? ` · post-EQ ${resolved.canonicalReceipt.postEqCurveSignature}`
          : ""}
      </div>
      <div className={LINE_CLASS}>
        <span className="font-medium">Response basis:</span>{" "}
        output {fmt(basis.operatingOutputDb, " dB")} · band{" "}
        {fmt(basis.assessmentStartHz, " Hz")}–{fmt(basis.assessmentEndHz, " Hz")} · P14{" "}
        {basis.p14TargetBasis || "—"} L{basis.p14TargetLevel ?? "—"}
      </div>
      <div className={LINE_CLASS}>
        <span className="font-medium">P14 / headroom:</span>{" "}
        {p14.requestedP14Pass ? "P14 achieved" : "P14 not achieved"}
        {p14.p14NotAchievedReason ? ` (${p14.p14NotAchievedReason})` : ""} · target{" "}
        {fmt(p14.p14TargetDb, " dB")} · achieved {fmt(p14.p14AchievedDb, " dB")} · headroom{" "}
        {fmt(p14.p14HeadroomDb, " dB")}
      </div>
      <div className={LINE_CLASS}>
        <span className="font-medium">P19 at RSP:</span>{" "}
        {fmt(p19.achievedP19VariationDb, " dB")} · level {fmt(p19.achievedP19Level)}
      </div>
      {primary && (
        <div className={LINE_CLASS}>
          <span className="font-medium">Primary P20 (derived):</span>{" "}
          worst {fmt(primary.worstVariationDb, " dB")} · {primary.level || "—"} ·{" "}
          {primary.worstSeatId || "—"}{primary.worstFrequencyHz != null ? ` @ ${primary.worstFrequencyHz} Hz` : ""}
        </div>
      )}
      {secondary && (
        <div className={LINE_CLASS}>
          <span className="font-medium">Secondary P20 (derived):</span>{" "}
          worst {fmt(secondary.worstVariationDb, " dB")} · {secondary.level || "—"} ·{" "}
          {secondary.worstSeatId || "—"}
        </div>
      )}
      <div className={MUTED_CLASS}>
        {resolved.perSeatP20.length} individual-seat P20 rows retained. No Overall P20 is derived.
      </div>
    </div>
  );
}

function ReceiptRow({ receipt, confirmedResults }) {
  return (
    <div
      className="rounded-md border border-[#E7E5E0] bg-[#FAF9F6] px-3 py-2 space-y-1"
      data-cross-qty-receipt-row={receipt.finalistId || undefined}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium text-[#3E4349]">
          {receipt.finalistId || "—"}
        </span>
        <span
          className="text-[10px] uppercase tracking-wide text-[#8A7B6A]"
          data-cross-qty-disposition={receipt.finalDisposition || "pending"}
        >
          {receipt.finalDisposition || "pending"}
        </span>
      </div>
      <div className={LINE_CLASS}>
        qty {receipt.quantity ?? "—"} · {receipt.sourceCount ?? "—"} sources
        {receipt.sourceIds?.length ? ` · ${receipt.sourceIds.join(", ")}` : ""}
      </div>
      <div className={LINE_CLASS}>
        <span className="font-medium">Admission:</span> {receipt.admission || "—"}
      </div>
      <div className={LINE_CLASS}>
        <span className="font-medium">Transfer:</span> {receipt.transfer || "—"}
      </div>
      <div className={LINE_CLASS}>
        <span className="font-medium">Proxy:</span> {receipt.proxy || "—"}
      </div>
      <div className={LINE_CLASS}>
        <span className="font-medium">Confirmation:</span>{" "}
        {receipt.confirmationSubmitted
          ? `${receipt.confirmationResult || "—"}${receipt.receiptRef ? ` · ref ${receipt.receiptRef}` : ""}`
          : "not submitted"}
      </div>
      <ReceiptResolution receipt={receipt} confirmedResults={confirmedResults} />
    </div>
  );
}

export default function AdiCrossQuantityAuditBlock({ audit = null, confirmedResults = null } = {}) {
  if (!audit || typeof audit !== "object") return null;
  const receipts = Array.isArray(audit.receipts) ? audit.receipts : [];
  if (!audit.runId && !audit.admittedScope?.length && !receipts.length) return null;

  return (
    <div className="space-y-2" data-adi-cross-qty-audit="true">
      <div className={GROUP_TITLE_CLASS}>Cross-quantity audit (developer)</div>
      <div className={LINE_CLASS}>
        <span className="font-medium">Run:</span> {audit.runId || "—"}
        {audit.admittedScope?.length ? ` · admitted scope ${audit.admittedScope.join(", ")}` : ""}
      </div>
      {receipts.length === 0 ? (
        <div className={MUTED_CLASS}>No cross-quantity finalists were admitted in this run.</div>
      ) : (
        <div className="space-y-2">
          {receipts.map((receipt) => (
            <ReceiptRow
              key={receipt.finalistId || receipt.receiptRef || Math.random()}
              receipt={receipt}
              confirmedResults={confirmedResults}
            />
          ))}
        </div>
      )}
      <div className={MUTED_CLASS}>
        Candidate-owned source IDs are kept separate from installed source identities. No response
        arrays, curves or tuning payloads are retained in the audit trail.
      </div>
    </div>
  );
}