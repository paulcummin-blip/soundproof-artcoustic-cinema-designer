// SecondaryEvidenceDialog.jsx
// ---------------------------------------------------------------------------
// "Add secondary evidence URL" — read one admin-supplied document, show exactly
// what it states and where it is hosted, and require an explicit acceptance
// before any of it is used.
//
// The dialog shows the URL, the detected host, the detected document type, every
// extracted field with the sentence it came from, and the warning that the
// source is not on the official manufacturer domain. Nothing is written until
// the admin presses "Accept as secondary evidence".
// ---------------------------------------------------------------------------

import React, { useMemo, useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, Link2 } from "lucide-react";
import { ALL_SPEC_FIELDS } from "../add-speaker/specFieldDefinitions.js";
import {
  SECONDARY_HOST_WARNING,
  SECONDARY_STATEMENT,
  documentTypeLabel,
  evidenceStatement,
} from "./secondaryEvidencePolicy.js";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  soft: "#F8F8F7",
  green: "#213428",
  danger: "#B23A3A",
  warn: "#9A6E00",
};

const LABELS = new Map((ALL_SPEC_FIELDS || []).map((field) => [field.key, field.label]));

function Row({ label, value, href = null }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", gap: 10, padding: "5px 0", fontSize: 12 }}>
      <div style={{ color: BRAND.subtext }}>{label}</div>
      <div style={{ color: BRAND.text, fontWeight: 600, overflowWrap: "anywhere" }}>
        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: BRAND.green }}>{value}</a> : value}
      </div>
    </div>
  );
}

export default function SecondaryEvidenceDialog({
  manufacturerName,
  model,
  manufacturerWebsite,
  initialUrl = "",
  onFetch,
  onConfirm,
  onClose,
}) {
  const [url, setUrl] = useState(initialUrl);
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [included, setIncluded] = useState({});
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState(null);

  const fields = useMemo(() => result?.fields || [], [result]);
  const acceptedFields = fields.filter((field) => included[field.field] !== false);

  const handleFetch = async () => {
    if (!url.trim()) return;
    setStatus("fetching");
    setError("");
    setResult(null);
    setOutcome(null);
    try {
      const data = await onFetch(url.trim());
      setResult(data);
      // A value the document stated ambiguously starts unaccepted: the admin must
      // read the sentence and decide.
      setIncluded(Object.fromEntries((data?.fields || []).map((field) => [field.field, field.status !== "ambiguous"])));
      setStatus("ready");
    } catch (err) {
      setError(err?.message || "The document could not be read.");
      setStatus("error");
    }
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError("");
    try {
      const summary = await onConfirm(result, acceptedFields.map((field) => ({
        field: field.field,
        value: field.value,
        source_quote: field.source_quote,
        accepted: true,
      })));
      setOutcome(summary);
      setStatus("accepted");
    } catch (err) {
      setError(err?.message || "The evidence could not be recorded.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-auto p-6" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="rounded-lg w-full max-w-[900px]" style={{ background: "#FFF", border: `1px solid ${BRAND.border}` }} onClick={(event) => event.stopPropagation()}>
        <div className="p-5" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
          <h3 className="text-lg font-bold" style={{ color: BRAND.text }}>Add secondary evidence URL</h3>
          <div className="text-sm mt-0.5" style={{ color: BRAND.subtext }}>
            {manufacturerName} {model} · the official source stated no engineering values, so an admin-supplied copy of the manufacturer's own document can be accepted instead.
          </div>
          <div className="text-xs mt-1" style={{ color: BRAND.subtext }}>{SECONDARY_STATEMENT}</div>
        </div>

        <div className="p-5" style={{ display: "grid", gap: 12 }}>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: BRAND.green }}>Document or page URL</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="text"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://… (a PDF or page supplied by you)"
                className="px-3 py-2 rounded-md text-sm outline-none"
                style={{ border: `1px solid ${BRAND.border}`, flex: "1 1 380px", minWidth: 260 }}
              />
              <button
                type="button"
                onClick={handleFetch}
                disabled={status === "fetching" || !url.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
                style={{ background: BRAND.green, color: "#FFF", opacity: status === "fetching" || !url.trim() ? 0.5 : 1 }}
              >
                {status === "fetching" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                {status === "fetching" ? "Reading the document…" : "Fetch and inspect"}
              </button>
            </div>
            <div className="text-xs mt-1" style={{ color: BRAND.subtext }}>
              Nothing is stored by this step. Reading a document never changes the database.
            </div>
          </div>

          {error && (
            <div className="text-sm p-3 rounded-md" style={{ background: "#FDF6F6", border: `1px solid ${BRAND.danger}33`, color: BRAND.danger }}>{error}</div>
          )}

          {status === "ready" && result && (
            <>
              <div className="p-3 rounded-md" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.soft }}>
                <Row label="URL" value={result.url} href={result.url} />
                <Row label="Detected host" value={result.host || "—"} />
                <Row
                  label="Source type"
                  value={result.source_type_label
                    || (result.trusted ? "Trusted secondary distributor" : "Admin-approved secondary")}
                />
                <Row label="Detected document type" value={result.document_type_label || documentTypeLabel(result.document_type)} />
                <Row label="Official manufacturer domain" value={result.is_official ? `Yes — ${result.official_domain || result.host}` : "No"} />
                <Row label="Evidence label" value={result.evidence_label || (result.is_official ? "Official" : "Secondary evidence")} />
                <Row label="Model named in the document" value={result.model_confirmed ? "Yes" : "Not confirmed — check the snippets"} />
                {result.source_read_note && <Row label="Reading note" value={result.source_read_note} />}
              </div>

              {!result.is_official && (
                <div className="flex items-start gap-2 p-3 rounded-md text-sm" style={{ background: "#FDF6E7", border: "1px solid #F0D9A8", color: "#7A5B12" }}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <strong>{result.warning || SECONDARY_HOST_WARNING}</strong>
                    <div className="text-xs mt-1">
                      Accepting it records the host, who accepted it and when, and holds this model at confidence C. It is never presented as published measured manufacturer evidence.
                    </div>
                    {result.trusted && (
                      <div className="text-xs mt-1">{evidenceStatement(result)}</div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ background: BRAND.soft, color: BRAND.green, borderBottom: `1px solid ${BRAND.border}` }}>
                  Values stated in this document {fields.length > 0 ? `(${fields.length})` : ""}
                </div>
                {fields.length === 0 ? (
                  <div className="p-4 text-sm" style={{ color: BRAND.subtext }}>
                    No P12/P13 value was clearly stated in this document, so nothing can be accepted from it.
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "40px 200px 130px 1fr", gap: 8, padding: "7px 12px", fontSize: 11, color: BRAND.subtext, borderBottom: `1px solid ${BRAND.soft}` }}>
                      <div>Use</div><div>Field</div><div>Value</div><div>Source sentence</div>
                    </div>
                    {fields.map((field) => (
                      <div key={field.field} style={{ display: "grid", gridTemplateColumns: "40px 200px 130px 1fr", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${BRAND.soft}`, alignItems: "start" }}>
                        <div>
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={included[field.field] !== false}
                            onChange={() => setIncluded((prev) => ({ ...prev, [field.field]: prev[field.field] === false }))}
                          />
                        </div>
                        <div className="text-sm" style={{ color: BRAND.text }}>
                          {LABELS.get(field.field) || field.field}
                          {field.status === "ambiguous" && (
                            <div className="text-xs" style={{ color: BRAND.warn }}>Stated ambiguously — read the sentence first</div>
                          )}
                        </div>
                        <div className="text-sm font-semibold" style={{ color: BRAND.text }}>{String(field.value)}</div>
                        <div className="text-xs" style={{ color: BRAND.subtext }}>{field.source_quote || "No sentence recorded — verify against the document"}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {result.discarded?.length > 0 && (
                <div className="text-xs" style={{ color: BRAND.warn }}>
                  Rejected by the plausibility checks: {result.discarded.join(", ")}
                </div>
              )}

              <div className="text-xs" style={{ color: BRAND.subtext }}>
                Values already held by the specification are never overwritten — only empty fields are filled, and every filled field records this source.
              </div>
            </>
          )}

          {status === "accepted" && outcome && (
            <div className="p-4 rounded-md" style={{ background: "#F1F8F3", border: "1px solid #BEDCC5" }}>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: BRAND.green }}>
                <CheckCircle2 className="w-4 h-4" /> Accepted as secondary evidence
              </div>
              <div className="text-xs mt-2" style={{ color: BRAND.subtext }}>
                {outcome.applied?.length > 0 ? `Values recorded: ${outcome.applied.join(", ")}.` : "No empty field needed filling — the values were already held."}
                {outcome.conflicts?.length > 0 && ` Left unchanged (already populated): ${outcome.conflicts.map((c) => c.key).join(", ")}.`}
              </div>
              <div className="text-xs mt-1" style={{ color: BRAND.subtext }}>
                Basis: <strong>{outcome.basis}</strong>
                {outcome.capApplies ? " · confidence held at C (secondary host)" : " · official host, no cap applied"}
                {outcome.competitorUpdated ? " · the RP22 comparison row was refreshed" : ""}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 p-5" style={{ borderTop: `1px solid ${BRAND.border}` }}>
          <div className="text-xs" style={{ color: BRAND.subtext }}>
            An accepted secondary source never approves a specification and never publishes it on its own.
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}>
              {status === "accepted" ? "Close" : "Cancel"}
            </button>
            {status === "ready" && (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={saving || acceptedFields.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
                style={{ background: BRAND.green, color: "#FFF", opacity: saving || acceptedFields.length === 0 ? 0.5 : 1 }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Accept as secondary evidence
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}