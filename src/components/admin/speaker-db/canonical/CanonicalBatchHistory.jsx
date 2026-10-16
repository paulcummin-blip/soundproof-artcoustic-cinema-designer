// CanonicalBatchHistory.jsx
// ---------------------------------------------------------------------------
// The import batch history: every applied canonical import, what it changed, and
// the rollback for it. A rolled-back batch stays in the list with its notes, so
// the record of what happened is never lost.

import React, { useState } from "react";
import { History, Loader2, RotateCcw } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  soft: "#F8F8F7",
  green: "#213428",
  amber: "#9A6E00",
};

const BTN = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "7px 11px",
  borderRadius: 8,
  border: `1px solid ${BRAND.border}`,
  background: BRAND.card,
  color: BRAND.text,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-GB");
}

function summaryLine(summary) {
  if (!summary) return "";
  return [
    `${summary.new_products ?? 0} new`,
    `${summary.updated_products ?? 0} updated`,
    `${summary.new_specifications ?? 0} new specifications`,
    `${summary.unchanged ?? 0} unchanged`,
  ].join(" · ");
}

function BatchRow({ batch, rollingBack, onRollback, result }) {
  const [confirming, setConfirming] = useState(false);
  const isRolledBack = batch.status === "rolled_back";

  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: "12px 14px", background: BRAND.card }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.text }}>
            {formatWhen(batch.applied_at)} · {batch.applied_by || "Admin"}
          </div>
          <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 3 }}>
            {batch.file_name || "workbook"} · {summaryLine(batch.summary)}
          </div>
          <div style={{ fontSize: 11, color: BRAND.hint, marginTop: 3 }}>
            {batch.schema_version || ""} · {batch.entries?.length || 0} record(s) touched
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
            color: isRolledBack ? BRAND.amber : BRAND.green,
            border: `1px solid ${isRolledBack ? `${BRAND.amber}55` : `${BRAND.green}44`}`,
            borderRadius: 999, padding: "3px 9px",
          }}>
            {isRolledBack ? "Rolled back" : "Applied"}
          </span>

          {!isRolledBack && !confirming && (
            <button type="button" style={BTN} onClick={() => setConfirming(true)} disabled={rollingBack}>
              <RotateCcw size={12} /> Roll back
            </button>
          )}

          {!isRolledBack && confirming && (
            <>
              <button type="button" style={BTN} onClick={() => setConfirming(false)} disabled={rollingBack}>Cancel</button>
              <button
                type="button"
                onClick={() => onRollback(batch)}
                disabled={rollingBack}
                style={{ ...BTN, background: BRAND.green, color: "#FFF", border: "none" }}
              >
                {rollingBack ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                Confirm rollback
              </button>
            </>
          )}
        </div>
      </div>

      {isRolledBack && batch.rollback_notes && (
        <div style={{ marginTop: 8, fontSize: 12, color: BRAND.hint, lineHeight: 1.5 }}>
          {formatWhen(batch.rolled_back_at)} · {batch.rollback_notes}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 8, fontSize: 12, color: BRAND.text, lineHeight: 1.5 }}>
          Rolled back: {result.restored} record(s) restored, {result.deleted} record(s) removed.
          {result.refused?.length ? ` ${result.refused.length} left alone.` : ""}
          {result.notes ? ` ${result.notes}` : ""}
        </div>
      )}
    </div>
  );
}

export default function CanonicalBatchHistory({ batches, loading, rollingBackId, onRollback, resultByBatchId }) {
  return (
    <div style={{ marginTop: 16, border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.soft, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <History size={16} color={BRAND.green} />
        <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text }}>Import history</div>
      </div>
      <div style={{ fontSize: 12, color: BRAND.hint, marginBottom: 12, lineHeight: 1.5 }}>
        Every applied import is kept here and can be rolled back. Rollback restores the canonical records the batch changed and
        removes only the records it created; anything published to RP22 or edited since the import is left untouched and reported.
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: BRAND.subtext }}>Loading…</div>
      ) : batches.length === 0 ? (
        <div style={{ fontSize: 12, color: BRAND.subtext }}>No imports have been applied yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {batches.map((batch) => (
            <BatchRow
              key={batch.id || batch.batch_id}
              batch={batch}
              rollingBack={rollingBackId === batch.id}
              onRollback={onRollback}
              result={resultByBatchId?.[batch.batch_id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}