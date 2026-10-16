// CanonicalImportPreview.jsx
// ---------------------------------------------------------------------------
// The full dry run of a canonical import: the headline counts, the errors that
// stop it, the warnings worth reading, and every field-level change per product.
// Nothing on this panel writes anything — Apply import is the only action that
// does, and it is only offered when the plan has no errors.

import React from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { ENTRY_KIND_LABELS } from "./planCanonicalImport.js";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  soft: "#F8F8F7",
  green: "#213428",
  danger: "#B23A3A",
  amber: "#9A6E00",
};

const COUNT_CARDS = [
  { key: "newManufacturers", label: "New manufacturers" },
  { key: "newProducts", label: "New products" },
  { key: "updatedProducts", label: "Updated products" },
  { key: "newSpecifications", label: "New specifications" },
  { key: "unchanged", label: "Unchanged" },
  { key: "warnings", label: "Warnings", tone: BRAND.amber },
  { key: "errors", label: "Errors", tone: BRAND.danger },
];

function CountGrid({ counts }) {
  return (
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
      {COUNT_CARDS.map((card) => {
        const value = Number(counts?.[card.key] || 0);
        const tone = value > 0 && card.tone ? card.tone : BRAND.text;
        return (
          <div key={card.key} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: "10px 12px", background: BRAND.soft }}>
            <div style={{ fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: BRAND.hint }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: tone, lineHeight: 1.2 }}>{value}</div>
          </div>
        );
      })}
    </div>
  );
}

function MessageList({ tone, title, items }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginTop: 12, border: `1px solid ${tone}44`, background: `${tone}0F`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: tone, marginBottom: 6 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: BRAND.subtext, lineHeight: 1.5 }}>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item.rowNumber ? `Row ${item.rowNumber}: ${item.message}` : item.message}</li>
        ))}
      </ul>
    </div>
  );
}

function ChangeRow({ change }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 240px) 1fr", gap: 10, padding: "5px 0", borderTop: `1px solid ${BRAND.soft}`, fontSize: 12 }}>
      <div style={{ color: BRAND.subtext }}>
        {change.label}
        {change.action === "clear" && <span style={{ color: BRAND.danger, fontWeight: 700 }}> · clear</span>}
      </div>
      <div style={{ color: BRAND.text }}>
        <span style={{ color: BRAND.hint }}>Current:</span> {change.current}
        <span style={{ margin: "0 8px", color: BRAND.hint }}>→</span>
        <span style={{ color: BRAND.hint }}>Proposed:</span> <strong>{change.proposed}</strong>
      </div>
    </div>
  );
}

function EntryBlock({ entry }) {
  const heading = `${entry.manufacturerName || "—"} · ${entry.model || "—"}`;
  const isError = entry.kind === "error";
  return (
    <div style={{ border: `1px solid ${isError ? `${BRAND.danger}55` : BRAND.border}`, borderRadius: 10, padding: "12px 14px", background: BRAND.card }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>{heading}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {entry.matchedByName && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: BRAND.amber, border: `1px solid ${BRAND.amber}55`, borderRadius: 999, padding: "2px 8px" }}>
              Matched by name
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: isError ? BRAND.danger : BRAND.green, border: `1px solid ${isError ? `${BRAND.danger}55` : `${BRAND.green}44`}`, borderRadius: 999, padding: "2px 8px" }}>
            {ENTRY_KIND_LABELS[entry.kind] || entry.kind}
          </span>
        </div>
      </div>

      {entry.manufacturerRename && (
        <div style={{ marginTop: 8, fontSize: 12, color: BRAND.subtext }}>
          Manufacturer {entry.manufacturerRename.from} renames to {entry.manufacturerRename.to}, and its products follow.
        </div>
      )}

      {entry.adminNote && (
        <div style={{ marginTop: 8, fontSize: 12, color: BRAND.hint }}>Change Log note: {entry.adminNote}</div>
      )}

      {entry.messages?.length > 0 && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: BRAND.danger, lineHeight: 1.5 }}>
          {entry.messages.map((message, index) => <li key={`${entry.rowNumber}-${index}`}>{message}</li>)}
        </ul>
      )}

      {entry.changes?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {entry.changes.map((change) => <ChangeRow key={`${entry.rowNumber}-${change.key}`} change={change} />)}
        </div>
      )}

      {entry.kind === "new_product" && (
        <div style={{ marginTop: 8, fontSize: 12, color: BRAND.subtext }}>
          Creates the product, its first specification, and (if this is a change of supplier) “{entry.manufacturerName}” itself. Everything arrives as Awaiting Review.
        </div>
      )}
      {entry.createsNewSpecificationVersion && entry.kind === "new_specification" && (
        <div style={{ marginTop: 8, fontSize: 12, color: BRAND.subtext }}>
          Creates a new specification version and marks the approved version Superseded — the approved data is kept, never overwritten.
        </div>
      )}
    </div>
  );
}

export default function CanonicalImportPreview({ plan, fileName, applying, onApply, onCancel }) {
  if (!plan) return null;
  const changed = plan.entries.filter((entry) => entry.kind !== "unchanged");
  const hasErrors = plan.counts.errors > 0;

  return (
    <div style={{ marginTop: 16, border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.soft, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        {hasErrors ? <XCircle size={18} color={BRAND.danger} /> : <CheckCircle2 size={18} color={BRAND.green} />}
        <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text }}>
          Preview — nothing has been written yet
        </div>
        <div style={{ fontSize: 12, color: BRAND.hint }}>{fileName}</div>
      </div>

      <CountGrid counts={plan.counts} />

      <div style={{ marginTop: 10, fontSize: 12, color: BRAND.hint, lineHeight: 1.5 }}>
        {plan.notInWorkbook} existing product{plan.notInWorkbook === 1 ? "" : "s"} are not in this workbook and will be left exactly as they are.
        {plan.changeLogNotes > 0 ? ` ${plan.changeLogNotes} Change Log note(s) read — notes are shown below and never write data.` : ""}
      </div>

      <MessageList tone={BRAND.danger} title={hasErrors ? "Errors — fix these in the workbook, nothing can be applied while they remain" : "Errors"} items={plan.errors} />
      <MessageList tone={BRAND.amber} title="Warnings" items={plan.warnings} />

      {plan.nothingToApply && !hasErrors && (
        <div style={{ marginTop: 12, border: `1px solid ${BRAND.green}44`, background: `${BRAND.green}0F`, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: BRAND.subtext, lineHeight: 1.5 }}>
          Zero changes: this workbook matches the Speaker Database exactly. That is the expected result of exporting, not editing, and re-importing.
        </div>
      )}

      {changed.length > 0 && (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {changed.map((entry, index) => <EntryBlock key={`${entry.rowNumber}-${index}`} entry={entry} />)}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onApply}
          disabled={applying || !plan.canApply}
          title={!plan.canApply ? "Nothing can be applied until the workbook has no errors and at least one change" : "Write the previewed changes"}
          style={{
            border: 0, borderRadius: 9, padding: "11px 18px", fontSize: 13, fontWeight: 600,
            background: plan.canApply ? BRAND.green : "#C9C7C2", color: "#FFF",
            cursor: applying || !plan.canApply ? "not-allowed" : "pointer",
          }}
        >
          {applying ? "Applying…" : "Apply import"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={applying}
          style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "11px 16px", fontSize: 13, background: BRAND.card, color: BRAND.text, cursor: "pointer" }}
        >
          Discard preview
        </button>
        {hasErrors && (
          <span style={{ fontSize: 12, color: BRAND.danger }}>Fix the errors in the workbook and upload it again.</span>
        )}
      </div>
    </div>
  );
}