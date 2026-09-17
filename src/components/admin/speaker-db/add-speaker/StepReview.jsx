// StepReview.jsx — Step 5: Primary engineering review screen
// Displays all spec fields in a table with Field, Value, Source, Notes.
// Source is color-coded: 🟢 PDF, 🟢 Product Page, 🟡 Estimated, 🔴 Missing.
// Every edit is tracked and saved with a change reason.

import React, { useState, useEffect, useMemo } from "react";
import { Save, Loader2, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { SPEC_GROUPS, CONFIDENCE_LABELS, ALL_SPEC_FIELDS } from "./specFieldDefinitions.js";
import { fieldDisplayStatus, validateDraftSpec } from "./addSpeakerValidation.js";
import { saveSpecEdits, runValidationAndPersist } from "./addSpeakerPersistence.js";
import { coerceRawValue, mapRawSourceToAuthority } from "./rawExtraction.js";
import { shouldOverwriteByPriority } from "./sourcePriority.js";

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

// Source options with color dots.
// Ordered by priority (1 = highest). See sourcePriority.js for the ranking.
const SOURCE_OPTIONS = [
  { value: "", label: "—", dot: null },
  { value: "Official Product Page", label: "Product Page", dot: "#213428" },
  { value: "Official PDF", label: "Spec PDF", dot: "#213428" },
  { value: "Official Series Brochure", label: "Series Brochure", dot: "#213428" },
  { value: "Official Manual", label: "Manual", dot: "#213428" },
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

export default function StepReview({ productId, specId, specData, onSpecDataChange, onValidationUpdate, rawExtraction }) {
  const [localSpec, setLocalSpec] = useState(specData || {});
  const [originalSpec, setOriginalSpec] = useState(specData || {});
  const [changeReason, setChangeReason] = useState("Manual Correction");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [dirty, setDirty] = useState(false);

  // Build raw extraction lookup: field key → raw entry
  const rawLookup = useMemo(() => {
    const map = {};
    if (rawExtraction?.fields) {
      for (const f of rawExtraction.fields) {
        if (f.field && f.value) map[f.field] = f;
      }
    }
    return map;
  }, [rawExtraction]);

  useEffect(() => {
    setLocalSpec(specData || {});
    setOriginalSpec(specData || {});
    setDirty(false);
  }, [specId, specData]);

  // Promote a raw extraction value into the spec.
  // Source priority: never overwrite a value from a higher-priority source
  // with a value from a lower-priority source.
  const handlePromote = (fieldKey, rawEntry) => {
    if (!rawEntry?.value) return;
    const fieldDef = ALL_SPEC_FIELDS.find((f) => f.key === fieldKey);
    const coercedValue = coerceRawValue(rawEntry.value, fieldDef?.type || "text");
    const authoritySource = mapRawSourceToAuthority(rawEntry.source);

    // Source priority check — read from current state before mutation
    const existingSource = resolveAuthority(localSpec.field_authority, fieldKey).source;
    if (existingSource && authoritySource && !shouldOverwriteByPriority(existingSource, authoritySource)) {
      setSaveMsg(`Skipped "${fieldDef?.label || fieldKey}": existing source (${existingSource}) is higher priority than raw source (${authoritySource}).`);
      return;
    }

    setLocalSpec((prev) => {
      const currentAuthority = prev.field_authority || {};
      const nextAuthority = { ...currentAuthority };
      if (authoritySource) {
        nextAuthority[fieldKey] = { source: authoritySource, note: rawEntry.raw_text || "" };
      }
      return { ...prev, [fieldKey]: coercedValue, field_authority: nextAuthority };
    });
    setDirty(true);
    setSaveMsg("");
  };

  // Promote all raw values at once.
  // Source priority: fields that already have a higher-priority source are
  // skipped — the existing value is preserved.
  const handlePromoteAll = () => {
    if (!rawLookup || Object.keys(rawLookup).length === 0) return;

    // Count skips using current state (before mutation)
    let skippedCount = 0;
    const promoteKeys = [];
    for (const [fieldKey, rawEntry] of Object.entries(rawLookup)) {
      const authoritySource = mapRawSourceToAuthority(rawEntry.source);
      const existingSource = resolveAuthority(localSpec.field_authority, fieldKey).source;
      if (existingSource && authoritySource && !shouldOverwriteByPriority(existingSource, authoritySource)) {
        skippedCount++;
      } else {
        promoteKeys.push(fieldKey);
      }
    }

    setLocalSpec((prev) => {
      const next = { ...prev };
      const nextAuthority = { ...(next.field_authority || {}) };
      for (const fieldKey of promoteKeys) {
        const rawEntry = rawLookup[fieldKey];
        const fieldDef = ALL_SPEC_FIELDS.find((f) => f.key === fieldKey);
        next[fieldKey] = coerceRawValue(rawEntry.value, fieldDef?.type || "text");
        const authoritySource = mapRawSourceToAuthority(rawEntry.source);
        if (authoritySource) {
          nextAuthority[fieldKey] = { source: authoritySource, note: rawEntry.raw_text || "" };
        }
      }
      next.field_authority = nextAuthority;
      return next;
    });
    setDirty(true);
    if (skippedCount > 0) {
      setSaveMsg(`Promoted ${promoteKeys.length} value(s). ${skippedCount} skipped — higher-priority source already set.`);
    } else {
      setSaveMsg("");
    }
  };

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
            Promote raw extraction values or enter manually. Every edit is logged to Change History.
          </p>
        </div>
        {rawLookup && Object.keys(rawLookup).length > 0 && (
          <button
            onClick={handlePromoteAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
            style={{ border: `1px solid ${BRAND.green}`, color: BRAND.green, background: BRAND.card }}
          >
            <ArrowRight className="w-3 h-3" />
            Promote All Raw Values
          </button>
        )}
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
                    <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.04em", width: "160px" }}>Field</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.04em", width: "180px" }}>Raw Extraction</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.04em", width: "140px" }}>Value</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.04em", width: "140px" }}>Source</th>
                    <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase", letterSpacing: "0.04em" }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {group.fields.map((field) => {
                    const value = localSpec[field.key];
                    const { source, note } = resolveAuthority(localSpec.field_authority, field.key);
                    const status = fieldDisplayStatus(localSpec, field.key);
                    const rawEntry = rawLookup[field.key];
                    const hasRaw = !!rawEntry?.value;
                    const rawConf = rawEntry?.confidence || "D";
                    const confLabel = CONFIDENCE_LABELS[rawConf] || CONFIDENCE_LABELS.D;
                    return (
                      <tr key={field.key} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                        <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 500, color: BRAND.text, verticalAlign: "middle" }}>
                          {field.label}
                        </td>
                        {/* Raw Extraction column */}
                        <td style={{ padding: "8px 12px", verticalAlign: "middle" }}>
                          {hasRaw ? (
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium" style={{ color: BRAND.text }}>
                                  {rawEntry.value}{rawEntry.unit && <span style={{ color: BRAND.subtext }}> {rawEntry.unit}</span>}
                                </div>
                                <div className="text-[10px]" style={{ color: BRAND.subtext }}>
                                  {rawEntry.source} · <span style={{ color: confLabel.color, fontWeight: 600 }}>{rawConf}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => handlePromote(field.key, rawEntry)}
                                title="Promote raw value into specification"
                                className="flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-medium flex-shrink-0"
                                style={{ border: `1px solid ${BRAND.green}40`, color: BRAND.green, background: BRAND.card }}
                              >
                                <ArrowRight className="w-2.5 h-2.5" />
                                Promote
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px]" style={{ color: BRAND.border }}>—</span>
                          )}
                        </td>
                        {/* Value column */}
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