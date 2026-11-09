// ReadWithAdiDialog.jsx
// ---------------------------------------------------------------------------
// "Read with ADI" / "Refresh with ADI" for one RP22 competitor row.
//
// ADI reads the linked manufacturer page or PDF (through the existing
// extractModelSpecification backend function, which is admin-only and reads
// the source verbatim — no general knowledge, no sibling models) and proposes
// only the values relevant to P12/P13.
//
// Nothing is silently overwritten. A compact proposal shows Current vs Found in
// source, with the exact sentence each value came from. Each changed value gets
// "Use source value" / "Keep current"; new blank fields can be accepted
// directly. Uncertain (ambiguous) evidence stays blank with a short note.
//
// On accept, the merged values go through the existing saveSpeakerComparison
// path — the same publish/readiness logic the Edit form uses — so the engine
// behaviour is unchanged.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Sparkles, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  formFromRow,
  saveSpeakerComparison,
  SENSITIVITY_REFERENCES,
  MEASUREMENT_SPACES,
  SPL_BASES,
} from "@/components/admin/speaker-library/saveSpeakerComparison";

const BRAND = {
  text: "#1B1A1A", subtext: "#3E4349", hint: "#625143",
  border: "#DCDBD6", soft: "#F1F0EE", panel: "#FFFFFF",
  green: "#213428", red: "#7A1E19", amber: "#9A6E00",
};

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== "";

const sourceUrlOf = (candidate) =>
  candidate?.record?.source_url
  || candidate?.sourceUrl
  || candidate?.record?.datasheet_url
  || candidate?.datasheetUrl
  || "";

// Same minimal row shape the Edit form expects, built from a comparison
// candidate. Kept local to avoid a circular import with CompetitorPriceManager.
function candidateToFormRow(candidate) {
  return {
    key: candidate?.id,
    rowId: candidate?.priceRecordId || null,
    productId: candidate?.productId || null,
    specificationId: candidate?.specificationId || null,
    manufacturer: candidate?.manufacturer || "",
    model: candidate?.model || "",
    price: candidate?.record?.retail_price_inc_vat ?? null,
    record: candidate?.record || null,
    specification: null,
    product: null,
  };
}

// --- extraction → form-value mapping ---------------------------------------

const SPEC_TO_FORM = {
  sensitivity_db: "sensitivity_db",
  sensitivity_basis: "sensitivity_reference",
  nominal_impedance_ohm: "impedance_ohm",
  max_continuous_spl_db: "max_spl_db",
  max_spl_basis: "max_spl_basis",
  measurement_space: "measurement_space",
};

function mapMaxSplBasis(v) {
  const s = String(v || "").toLowerCase();
  if (["aes", "iec", "continuous", "peak"].includes(s)) return "continuous";
  if (s === "calculated") return "calculated";
  return "manufacturer unspecified";
}

function mapMeasurementSpace(v) {
  const s = String(v || "").toLowerCase();
  if (s === "free-space" || s === "half-space") return s;
  return "unspecified";
}

function labelOf(optionList, value) {
  const found = optionList.find((o) => o.value === value);
  return found ? found.label : (hasValue(value) ? String(value) : "—");
}

const FIELD_LABEL = {
  sensitivity_db: "Sensitivity (dB)",
  sensitivity_reference: "Sensitivity reference",
  impedance_ohm: "Nominal impedance (Ω)",
  power_w: "Power (W)",
  max_spl_db: "Max continuous SPL (dB)",
  max_spl_basis: "Max SPL basis",
  measurement_space: "Measurement space",
};

const PROPOSAL_FIELDS = [
  "sensitivity_db",
  "sensitivity_reference",
  "impedance_ohm",
  "power_w",
  "max_spl_db",
  "max_spl_basis",
  "measurement_space",
];

/**
 * Turn the extraction result into a map of formKey → { value, status, quote }.
 * Power is resolved from power_handling_continuous_w (preferred) or
 * recommended_amp_max_w, with its basis remembered.
 */
function extractionToFound(raw) {
  const byField = {};
  for (const item of [...(raw?.reported || []), ...(raw?.ambiguous || [])]) {
    if (!item || !item.field) continue;
    byField[item.field] = {
      value: item.value,
      status: item.status,
      quote: String(item.raw_text || "").trim(),
    };
  }
  const found = {};
  const info = {};
  for (const [specKey, formKey] of Object.entries(SPEC_TO_FORM)) {
    if (!byField[specKey]) continue;
    let val = byField[specKey].value;
    if (formKey === "max_spl_basis") val = mapMaxSplBasis(val);
    if (formKey === "measurement_space") val = mapMeasurementSpace(val);
    found[formKey] = val;
    info[formKey] = {
      value: val,
      rawValue: byField[specKey].value,
      status: byField[specKey].status,
      quote: byField[specKey].quote,
    };
  }
  if (byField.power_handling_continuous_w) {
    found.power_w = byField.power_handling_continuous_w.value;
    found.power_basis = "continuous";
    info.power_w = {
      value: byField.power_handling_continuous_w.value,
      rawValue: byField.power_handling_continuous_w.value,
      status: byField.power_handling_continuous_w.status,
      quote: byField.power_handling_continuous_w.quote,
      basis: "continuous",
    };
  } else if (byField.recommended_amp_max_w) {
    found.power_w = byField.recommended_amp_max_w.value;
    found.power_basis = "amplifier";
    info.power_w = {
      value: byField.recommended_amp_max_w.value,
      rawValue: byField.recommended_amp_max_w.value,
      status: byField.recommended_amp_max_w.status,
      quote: byField.recommended_amp_max_w.quote,
      basis: "amplifier",
    };
  }
  return { found, info };
}

function displayValue(formKey, value) {
  if (!hasValue(value)) return "—";
  if (formKey === "sensitivity_reference") return labelOf(SENSITIVITY_REFERENCES, value);
  if (formKey === "measurement_space") return labelOf(MEASUREMENT_SPACES, value);
  if (formKey === "max_spl_basis") return labelOf(SPL_BASES, value);
  if (formKey === "power_w") return `${value}`;
  return String(value);
}

export default function ReadWithAdiDialog({ open, onClose, candidate, actorName, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [raw, setRaw] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const sourceUrl = sourceUrlOf(candidate);

  const currentForm = useMemo(() => (candidate ? formFromRow(candidateToFormRow(candidate)) : {}), [candidate]);
  const { found, info } = useMemo(() => (raw ? extractionToFound(raw) : { found: {}, info: {} }), [raw]);

  const proposalFields = useMemo(
    () => PROPOSAL_FIELDS.filter((key) => info[key]),
    [info],
  );

  // Fetch the extraction when a candidate is opened.
  useEffect(() => {
    if (!open || !candidate) return;
    setLoading(true);
    setError("");
    setRaw(null);
    setDecisions({});
    setSaveError("");
    (async () => {
      try {
        const res = await base44.functions.invoke("extractModelSpecification", {
          manufacturerName: candidate.manufacturer,
          model: candidate.model,
          sourceUrl,
          sourceType: "Official Product Page",
        });
        const data = res?.data ?? res;
        if (data?.error) throw new Error(data.error);
        setRaw(data);
        // Default decisions: accept a reported value only when the current
        // field is blank (a new field). Never default-accept ambiguous evidence
        // and never default-overwrite an existing value.
        const initial = {};
        for (const key of PROPOSAL_FIELDS) {
          const f = data && extractionToFound(data).info[key];
          if (!f) continue;
          initial[key] = !hasValue(currentForm[key]) && f.status === "reported";
        }
        setDecisions(initial);
      } catch (e) {
        setError(e?.message || "ADI could not read this source.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, candidate, sourceUrl, currentForm]);

  const toggle = (key) => setDecisions((prev) => ({ ...prev, [key]: !prev[key] }));

  const apply = async () => {
    if (!candidate) return;
    setSaving(true);
    setSaveError("");
    try {
      const overrides = {};
      for (const key of Object.keys(decisions)) {
        if (!decisions[key]) continue;
        overrides[key] = info[key].value;
        if (key === "power_w" && info[key].basis) overrides.power_basis = info[key].basis;
      }
      const merged = { ...currentForm, ...overrides };
      await saveSpeakerComparison({ values: merged, row: candidateToFormRow(candidate), actorName });
      onSaved?.();
      onClose?.();
    } catch (e) {
      setSaveError(e?.message || "The accepted values could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (loading || saving) return;
    onClose?.();
  };

  const modelConfirmed = raw?.model_confirmed === true;
  const sourceReadOk = raw?.source_read === true || (raw && !raw.source_read_note);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !loading && !saving) close(); }}>
      <DialogContent style={{ maxWidth: 760, background: BRAND.panel, maxHeight: "90vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle style={{ color: BRAND.text, display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={16} /> Read with ADI — {candidate?.manufacturer || ""} {candidate?.model || ""}
          </DialogTitle>
          <DialogDescription style={{ color: BRAND.subtext }}>
            ADI reads the linked manufacturer source and proposes only P12/P13 values it states explicitly.
            Nothing is overwritten — you choose which values to use.
          </DialogDescription>
        </DialogHeader>

        {sourceUrl && (
          <div style={{ fontSize: 12, color: BRAND.hint, marginBottom: 8, wordBreak: "break-all" }}>
            <ExternalLink size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: BRAND.subtext }}>{sourceUrl}</a>
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: BRAND.subtext, padding: "12px 0" }}>
            <Loader2 size={16} className="animate-spin" /> Reading source with ADI…
          </div>
        )}

        {error && <div style={{ fontSize: 13, color: BRAND.red }}>{error}</div>}

        {!loading && !error && raw && (
          <>
            {raw.source_read_note && !sourceReadOk && (
              <div style={{ fontSize: 12, color: BRAND.amber, marginBottom: 8 }}>
                The page could not be read directly — ADI fell back to a restricted read. Review each value carefully.
              </div>
            )}
            {!modelConfirmed && (
              <div style={{ fontSize: 12, color: BRAND.amber, marginBottom: 8 }}>
                The source did not explicitly name this exact model. Review each value carefully before accepting.
              </div>
            )}

            {proposalFields.length === 0 ? (
              <div style={{ fontSize: 13, color: BRAND.subtext, padding: "8px 0" }}>
                ADI found no P12/P13 values stated for this model in the source. No values are proposed.
              </div>
            ) : (
              <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ background: BRAND.soft }}>
                    <tr>
                      {["Field", "Current", "Found in source", "Use"].map((h) => (
                        <th key={h} style={{ textAlign: h === "Use" ? "center" : "left", padding: "8px 10px", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND.hint, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {proposalFields.map((key) => {
                      const f = info[key];
                      const current = currentForm[key];
                      const isAmbiguous = f.status === "ambiguous";
                      const checked = !!decisions[key];
                      return (
                        <tr key={key} style={{ borderTop: `1px solid ${BRAND.soft}` }}>
                          <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: BRAND.text, verticalAlign: "top" }}>
                            {FIELD_LABEL[key]}
                            {key === "power_w" && f.basis && (
                              <div style={{ fontSize: 10, color: BRAND.hint, fontWeight: 400, marginTop: 2 }}>
                                {f.basis === "continuous" ? "Continuous rating" : "Recommended amp max"}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 12, color: BRAND.subtext, verticalAlign: "top" }}>
                            {displayValue(key, current)}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 12, color: BRAND.text, verticalAlign: "top" }}>
                            <div>{displayValue(key, f.value)}</div>
                            {isAmbiguous && (
                              <div style={{ fontSize: 10, color: BRAND.amber, marginTop: 3 }}>
                                Uncertain — left blank unless you accept it.
                              </div>
                            )}
                            {f.quote && (
                              <div style={{ fontSize: 10, color: BRAND.hint, marginTop: 3, fontStyle: "italic" }}>
                                “{f.quote.slice(0, 140)}{f.quote.length > 140 ? "…" : ""}”
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "center", verticalAlign: "top" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(key)}
                              disabled={saving}
                              aria-label={`Use source value for ${FIELD_LABEL[key]}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {raw.not_found && raw.not_found.length > 0 && (
              <div style={{ fontSize: 11, color: BRAND.hint, marginTop: 8 }}>
                Not stated in source: {raw.not_found.slice(0, 12).join(", ")}{raw.not_found.length > 12 ? "…" : ""}. These stay blank.
              </div>
            )}
          </>
        )}

        {saveError && <div style={{ fontSize: 13, color: BRAND.red, marginTop: 8 }}>{saveError}</div>}

        <DialogFooter style={{ gap: 8 }}>
          <button type="button" onClick={close} disabled={loading || saving} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "9px 16px", background: "#FFF", color: BRAND.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={loading || saving || proposalFields.length === 0}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, border: 0, borderRadius: 9, padding: "9px 18px", background: proposalFields.length === 0 ? "#9CA3A0" : BRAND.green, color: "#FFF", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: proposalFields.length === 0 ? "not-allowed" : "pointer" }}
          >
            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <>Save accepted values</>}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}