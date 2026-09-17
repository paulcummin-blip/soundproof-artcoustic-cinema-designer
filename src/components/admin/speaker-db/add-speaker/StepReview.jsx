// StepReview.jsx — Step 5: Primary engineering review screen
// Displays all spec fields in a table with Field, Value, Source, Notes.
// Source is color-coded: 🟢 PDF, 🟢 Product Page, 🟡 Estimated, 🔴 Missing.
// Every edit is tracked and saved with a change reason.

import React, { useState, useEffect } from "react";
import { Save, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { SPEC_GROUPS } from "./specFieldDefinitions.js";
import { fieldDisplayStatus, validateDraftSpec } from "./addSpeakerValidation.js";
import { saveSpecEdits, runValidationAndPersist } from "./addSpeakerPersistence.js";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  bg: "#F8F8F7",
  danger: "#B23A3A",
  amber: "#9A6E00",
};

// Source options with color dots
const SOURCE_OPTIONS = [
  { value: "", label: "—", dot: null },
  { value: "Official Product Page", label: "Product Page", dot: "#213428" },
  { value: "Official PDF", label: "PDF", dot: "#213428" },
  { value: "Engineering Document", label: "Engineering Doc", dot: "#213428" },
  { value: "Support Article", label: "Support Article", dot: "#213428" },
];

const CHANGE_REASONS = [
  "Manual Correction",
  "Manufacturer Specification Update",
  "Document Revision",
  "Metadata Update",
  "Administrative",
];

// Resolve field_authority entry — supports both string and { source, note } formats
function resolveAuthority(fieldAuthority, fieldKey) {
  const entry = fieldAuthority?.[fieldKey];
  if (entry == null) return { source: "", note: "" };
  if (typeof entry === "string") return { source: entry, note: "" };
  return { source: entry.source || "", note: entry.note || "" };
}

function SourceDot({ status, source }) {
  // Green dot if source is set, amber if estimated (value exists, no source), red if missing
  if (source) return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: BRAND.green, flexShrink: 0 }} />;
  if (status === "missing") return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: BRAND.danger, flexShrink: 0 }} />;
  if (status === "estimated") return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: BRAND.amber, flexShrink: 0 }} />;
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: BRAND.border, flexShrink: 0 }} />;
}

function SpecInput({ field, value, onChange }) {
  const inputStyle = { border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.bg };

  if (field.type === "boolean") {
    return (
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
    );
  }
  if (field.type === "select") {
    return (
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inputStyle}>
        {field.options.map((opt) => <option key={opt} value={opt}>{opt || "—"}</option>)}
      </select>
    );
  }
  if (field.type === "date") {
    return (
      <input type="date" value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full px-2 py-1.5 rounded text-sm outline-none" style={inputStyle} />
    );
  }
  return (
    <input
      type={field.type === "number" ? "number" : "text"}
      value={value ?? ""}
      onChange={(e) => onChange(field.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
      className="w-full px-2 py-1.5 rounded text-sm outline-none"
      style={inputStyle}
    />
  );
}

export default function StepReview({ productId, specId, specData, onSpecDataChange, onValidationUpdate }) {
  const [localSpec, setLocalSpec] = useState(specData || {});
  const [originalSpec, setOriginalSpec] = useState(specData || {});
  const [changeReason, setChangeReason] = useState("Manual Correction");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLocalSpec(specData || {});
    setOriginalSpec(specData || {});
    setDirty(false);
  }, [specId, specData]);

  const handleFieldChange = (key, value) => {
    setLocalSpec((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaveMsg("");
  };

  const handleSourceChange = (fieldKey, sourceValue) => {
    setLocalSpec((prev) => {
      const currentAuthority = prev.field_authority || {};
      const currentEntry = resolveAuthority(currentAuthority, fieldKey);
      const nextAuthority = { ...currentAuthority };
      if (sourceValue || currentEntry.note) {
        nextAuthority[fieldKey] = { source: sourceValue, note: currentEntry.note };
      } else {
        delete nextAuthority[fieldKey];
      }
      return { ...prev, field_authority: nextAuthority };
    });
    setDirty(true);
    setSaveMsg("");
  };

  const handleNoteChange = (fieldKey, noteValue) => {
    setLocalSpec((prev) => {
      const currentAuthority = prev.field_authority || {};
      const currentEntry = resolveAuthority(currentAuthority, fieldKey);
      const nextAuthority = { ...currentAuthority };
      if (currentEntry.source || noteValue) {
        nextAuthority[fieldKey] = { source: currentEntry.source, note: noteValue };
      } else {
        delete nextAuthority[fieldKey];
      }
      return { ...prev, field_authority: nextAuthority };
    });
    setDirty(true);
    setSaveMsg("");
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      await saveSpecEdits({ productId, specId, oldSpec: originalSpec, newSpec: localSpec, changeReason });
      const validationResult = await runValidationAndPersist(productId, localSpec);
      setOriginalSpec(localSpec);
      setDirty(false);
      setSaveMsg(`Saved — ${validationResult.issues.length} validation issue(s) detected`);
      onSpecDataChange(localSpec);
      onValidationUpdate?.(validationResult);
    } catch (err) {
      setSaveMsg(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const liveValidation = validateDraftSpec(localSpec);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, margin: 0 }}>Review Specification</h2>
          <p style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            Populate every field from the official source. Every edit is logged to Change History.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={changeReason}
            onChange={(e) => setChangeReason(e.target.value)}
            className="px-2 py-1.5 rounded text-sm outline-none"
            style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.card }}
          >
            {CHANGE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
            style={{ background: BRAND.green, color: "#fff", opacity: !dirty || saving ? 0.5 : 1 }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {saveMsg && (
        <div className="mb-3 text-sm" style={{ color: saveMsg.includes("failed") ? BRAND.danger : BRAND.green }}>
          {saveMsg}
        </div>
      )}

      {/* Completeness summary */}
      <div className="flex items-center gap-4 mb-4 p-3 rounded-lg" style={{ background: BRAND.bg, border: `1px solid ${BRAND.border}` }}>
        <div className="text-sm font-medium" style={{ color: BRAND.text }}>Completeness: {liveValidation.completeness}%</div>
        <div className="text-xs" style={{ color: liveValidation.summary.missing ? BRAND.danger : BRAND.subtext }}>
          Missing: {liveValidation.summary.missing}
        </div>
        <div className="text-xs" style={{ color: liveValidation.summary.outOfRange ? BRAND.amber : BRAND.subtext }}>
          Out of Range: {liveValidation.summary.outOfRange}
        </div>
        <div className="text-xs" style={{ color: liveValidation.summary.warnings ? BRAND.amber : BRAND.subtext }}>
          Warnings: {liveValidation.summary.warnings}
        </div>
      </div>

      {/* Field groups — Field | Value | Source | Notes */}
      <div className="space-y-4">
        {SPEC_GROUPS.map((group) => (
          <div key={group.label} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
            <div className="px-4 py-2.5" style={{ background: BRAND.bg, borderBottom: `1px solid ${BRAND.border}` }}>
              <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: BRAND.green, margin: 0 }}>{group.label}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.04em", width: "180px" }}>Field</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.04em", width: "160px" }}>Value</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.04em", width: "150px" }}>Source</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.04em" }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {group.fields.map((field) => {
                    const value = localSpec[field.key];
                    const { source, note } = resolveAuthority(localSpec.field_authority, field.key);
                    const status = fieldDisplayStatus(localSpec, field.key);
                    return (
                      <tr key={field.key} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                        <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 500, color: BRAND.text, verticalAlign: "middle" }}>
                          {field.label}
                        </td>
                        <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                          <SpecInput field={field} value={value} onChange={(v) => handleFieldChange(field.key, v)} />
                        </td>
                        <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                          <div className="flex items-center gap-1.5">
                            <SourceDot status={status} source={source} />
                            <select
                              value={source}
                              onChange={(e) => handleSourceChange(field.key, e.target.value)}
                              className="w-full px-1.5 py-1.5 rounded text-xs outline-none"
                              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.bg }}
                            >
                              {SOURCE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                          </div>
                        </td>
                        <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                          <input
                            type="text"
                            value={note}
                            onChange={(e) => handleNoteChange(field.key, e.target.value)}
                            placeholder="Reviewer notes…"
                            className="w-full px-2 py-1.5 rounded text-xs outline-none"
                            style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.bg }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {dirty && (
        <div className="mt-4 flex items-center gap-2 p-3 rounded-md" style={{ background: BRAND.amber + "10" }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: BRAND.amber }} />
          <div className="text-sm" style={{ color: BRAND.amber }}>
            You have unsaved changes. Click "Save Changes" to persist and log them to Change History.
          </div>
        </div>
      )}
      {!dirty && saveMsg && (
        <div className="mt-4 flex items-center gap-2 p-3 rounded-md" style={{ background: BRAND.green + "08" }}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: BRAND.green }} />
          <div className="text-sm" style={{ color: BRAND.green }}>{saveMsg}</div>
        </div>
      )}
    </div>
  );
}