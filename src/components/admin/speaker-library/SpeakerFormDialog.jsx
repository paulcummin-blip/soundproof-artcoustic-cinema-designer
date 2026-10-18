// SpeakerFormDialog.jsx
//
// The short Add / Edit speaker form. Only the fields needed to predict SPL
// capability and show a price — a manufacturer specification URL is the only
// provenance it asks for, and the access date and source authority are recorded
// automatically. Technical fields that do not apply stay hidden rather than
// sitting there inviting invented values.

import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { findRp22Gaps } from "@/components/admin/speaker-db/model-first/rp22ComparisonPublish";
import {
  MEASUREMENT_SPACES,
  POWER_BASES,
  SENSITIVITY_REFERENCES,
  SPL_BASES,
  assessSpeakerForm,
  buildSpecPatch,
  emptySpeakerForm,
  formFromRow,
  saveSpeakerComparison,
} from "./saveSpeakerComparison";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
  border: "#DCDBD6",
  soft: "#F1F0EE",
  panel: "#FFFFFF",
  green: "#213428",
};

const inputStyle = {
  width: "100%",
  border: `1px solid ${BRAND.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  color: BRAND.text,
  background: "#FFF",
  fontFamily: "inherit",
};

function Field({ label, hint, children, wide = false }) {
  return (
    <label style={{ display: "block", gridColumn: wide ? "1 / -1" : "auto", minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.text, marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: BRAND.hint, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

export default function SpeakerFormDialog({ open, onClose, row, actorName, onSaved }) {
  const isEdit = Boolean(row);
  const [values, setValues] = useState(emptySpeakerForm());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues(formFromRow(row));
    setResult(null);
    setError("");
  }, [open, row]);

  const set = (key) => (event) => setValues((prev) => ({ ...prev, [key]: event.target.value }));

  // What the record still needs, stated plainly while the form is open. The
  // authoritative comparison class is decided when the values are saved.
  const missing = useMemo(() => {
    if (!open) return [];
    const { patch } = buildSpecPatch(values, new Date().toISOString().split("T")[0]);
    return findRp22Gaps({ ...(row?.specification || {}), ...patch }).critical.map((gap) => gap.label);
  }, [open, values, row]);

  const requiresImpedance = values.sensitivity_reference === "2.83V/1m";
  const showsSplBasis = hasValue(values.max_spl_db);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const saved = await saveSpeakerComparison({ values, row, actorName });
      setResult(saved);
      onSaved?.(saved);
    } catch (e) {
      setError(e?.message || "This speaker could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const preview = useMemo(() => {
    if (!open || result) return null;
    const assessment = assessSpeakerForm(values, row?.specification);
    return { ready: assessment.ready, basis: assessment.readiness.powerAuthorityW, label: assessment.readiness.powerAuthority };
  }, [open, values, row, result]);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose(); }}>
      <DialogContent style={{ maxWidth: 720, background: BRAND.panel, maxHeight: "88vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle style={{ color: BRAND.text }}>
            {isEdit ? `Edit ${row?.manufacturer || ""} ${row?.model || ""}`.trim() : "Add speaker"}
          </DialogTitle>
          <DialogDescription style={{ color: BRAND.subtext }}>
            Enter what the manufacturer publishes. Leave anything they do not publish blank — a blank field is never estimated.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div style={{ padding: "14px 16px", border: `1px solid ${BRAND.border}`, borderRadius: 10, background: result.published ? "#F4F8F3" : "#FBF7EE" }}>
            {result.published ? (
              <>
                <div style={{ fontWeight: 700, color: BRAND.green, marginBottom: 6 }}>
                  Saved and live in RP22 Comparison — {result.readiness.level.label}
                </div>
                <div style={{ fontSize: 13, color: BRAND.subtext }}>
                  {result.readiness.splEvidenceStatement || result.readiness.meaning}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, color: BRAND.text, marginBottom: 6 }}>
                  Saved, but not comparable yet
                </div>
                <div style={{ fontSize: 13, color: BRAND.subtext }}>
                  {result.missing.length > 0
                    ? `Still needed from the manufacturer: ${result.missing.join(", ")}.`
                    : "The saved values are not yet enough for a defensible P12/P13 comparison."}
                </div>
              </>
            )}
            {result.gaps.advisory.length > 0 && (
              <div style={{ fontSize: 12, color: BRAND.hint, marginTop: 8 }}>
                Not required, but they would strengthen the evidence: {result.gaps.advisory.join(", ")}.
              </div>
            )}
            {!result.price.valid && (
              <div style={{ fontSize: 12, color: "#7A1E19", marginTop: 8 }}>The price was not saved — enter it as a number, or leave it blank.</div>
            )}
            <div style={{ fontSize: 12, color: BRAND.hint, marginTop: 8 }}>
              {result.price.valid && hasValue(values.price) ? "Retail price saved. " : ""}
              Your save is recorded as the approval of these published values, with your name and today's date.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
            <Field label="Manufacturer">
              <input style={inputStyle} value={values.manufacturer} onChange={set("manufacturer")} list="speaker-library-manufacturers" placeholder="e.g. M&K Sound" />
            </Field>
            <Field label="Speaker model">
              <input style={inputStyle} value={values.model} onChange={set("model")} placeholder="e.g. MP150" />
            </Field>
            <Field label="Manufacturer specification URL" wide hint="Used as the source of the values and shown in the comparison.">
              <input style={inputStyle} value={values.source_url} onChange={set("source_url")} placeholder="https://" />
            </Field>

            <Field label="Sensitivity (dB)">
              <input style={inputStyle} value={values.sensitivity_db} onChange={set("sensitivity_db")} inputMode="decimal" placeholder="e.g. 90" />
            </Field>
            <Field label="Sensitivity reference" hint="2.83 V is converted to 1 W using the impedance; it is never assumed to be 1 W.">
              <select style={inputStyle} value={values.sensitivity_reference} onChange={set("sensitivity_reference")}>
                {SENSITIVITY_REFERENCES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>

            {requiresImpedance && (
              <Field label="Nominal impedance (Ω)" hint="Needed to convert the 2.83 V figure to 1 W.">
                <input style={inputStyle} value={values.impedance_ohm} onChange={set("impedance_ohm")} inputMode="decimal" placeholder="e.g. 4" />
              </Field>
            )}

            <Field label="Power rating (W)">
              <input style={inputStyle} value={values.power_w} onChange={set("power_w")} inputMode="decimal" placeholder="e.g. 400" />
            </Field>
            <Field label="Power figure is" hint="A recommended amplifier maximum is never treated as a continuous speaker rating.">
              <select style={inputStyle} value={values.power_basis} onChange={set("power_basis")}>
                {POWER_BASES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>

            <Field label="Published maximum continuous SPL (dB)" hint="Only if the manufacturer publishes one. Leave blank if they do not — an estimate is labelled as an estimate.">
              <input style={inputStyle} value={values.max_spl_db} onChange={set("max_spl_db")} inputMode="decimal" placeholder="Not published" />
            </Field>
            {showsSplBasis && (
              <Field label="The manufacturer states it as">
                <select style={inputStyle} value={values.max_spl_basis} onChange={set("max_spl_basis")}>
                  {SPL_BASES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            )}

            <Field label="Measurement basis">
              <select style={inputStyle} value={values.measurement_space} onChange={set("measurement_space")}>
                {MEASUREMENT_SPACES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Retail price including VAT (£)" hint="Per speaker. Leave blank for no price — it is never stored as zero.">
              <input style={inputStyle} value={values.price} onChange={set("price")} inputMode="decimal" placeholder="Not set" />
            </Field>

            <div style={{ gridColumn: "1 / -1", fontSize: 12, color: BRAND.hint }}>
              {preview?.basis
                ? `The comparison will use ${preview.basis} W · ${preview.label}.`
                : "The comparison needs a power authority or a published maximum SPL."}
              {missing.length > 0 && <> Still needed: {missing.join(", ")}.</>}
            </div>
          </div>
        )}

        {error && <div style={{ fontSize: 13, color: "#7A1E19" }}>{error}</div>}

        <DialogFooter style={{ gap: 8 }}>
          {result ? (
            <button type="button" onClick={onClose} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "9px 16px", background: BRAND.text, color: "#FFF", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
              Done
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={saving} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "9px 16px", background: "#FFF", color: BRAND.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
                Cancel
              </button>
              <button type="button" onClick={submit} disabled={saving} style={{ border: 0, borderRadius: 9, padding: "9px 18px", background: BRAND.green, color: "#FFF", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: saving ? "default" : "pointer" }}>
                {saving ? "Saving…" : "Save & Compare"}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}