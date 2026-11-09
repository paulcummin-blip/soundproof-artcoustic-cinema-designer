// ReadWithAdiDialog.jsx
// ---------------------------------------------------------------------------
// "Read source" / "Refresh from source" for one RP22 competitor row.
//
// ADI reads the linked manufacturer page or PDF (through the existing
// extractModelSpecification backend function, which is admin-only and reads
// the source verbatim — no general knowledge, no sibling models) and proposes
// only the values relevant to P12/P13.
//
// Nothing is silently overwritten. A compact proposal shows Current vs Found in
// source, with the exact sentence each value came from. Each changed value gets
// "Use source value" / "Keep current"; new blank fields can be accepted
// directly. When every proposal is a new blank-field fill, an "Accept all found
// values" action accepts them at once. Uncertain (ambiguous) evidence stays
// blank with a short note.
//
// On accept, the merged values go through the existing saveSpeakerComparison
// path — the same publish/readiness logic the Edit form uses — so the engine
// behaviour is unchanged. The accepted evidence (source URL, date, per-field
// quotations) is written to the specification's adi_source_evidence audit field.
// The retail price is never touched by this flow.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Sparkles, ExternalLink } from "lucide-react";
import { saveSpeakerComparison, assessSpeakerForm } from "@/components/admin/speaker-library/saveSpeakerComparison";
import {
  FIELD_LABEL,
  PROPOSAL_FIELDS,
  buildSourceEvidence,
  candidateToFormRow,
  currentFormFor,
  decideDefaults,
  displayValue,
  extractionToFound,
  isConflict,
  readSourceExtraction,
  sourceUrlOf,
} from "@/components/spl/adiSourceExtraction";
import { DATA_ADEQUACY } from "@/components/spl/dataAdequacyClassification";

const BRAND = {
  text: "#1B1A1A", subtext: "#3E4349", hint: "#625143",
  border: "#DCDBD6", soft: "#F1F0EE", panel: "#FFFFFF",
  green: "#213428", red: "#7A1E19", amber: "#9A6E00",
};

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== "";

export default function ReadWithAdiDialog({ open, onClose, candidate, actorName, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [raw, setRaw] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const sourceUrl = sourceUrlOf(candidate);

  const currentForm = useMemo(() => currentFormFor(candidate), [candidate]);
  const { found, info } = useMemo(() => (raw ? extractionToFound(raw) : { found: {}, info: {} }), [raw]);

  const proposalFields = useMemo(
    () => PROPOSAL_FIELDS.filter((key) => info[key]),
    [info],
  );

  // True when every proposal is a new blank-field fill (nothing overwrites an
  // existing value). In that case a single "Accept all found values" action is
  // offered alongside the per-field checkboxes.
  const allBlankFills = useMemo(
    () => proposalFields.length > 0 && proposalFields.every((key) => !isConflict(currentForm, key, info)),
    [proposalFields, currentForm, info],
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
        const data = await readSourceExtraction(candidate);
        setRaw(data);
        setDecisions(decideDefaults(currentFormFor(candidate), extractionToFound(data).info));
      } catch (e) {
        setError(e?.message || "ADI could not read this source.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, candidate]);

  // The form values that would be saved if the admin applied the current
  // decisions — current values with accepted source values merged in. Used only
  // to preview the resulting FULL/GOOD/INCOMPLETE status; nothing is written.
  const mergedForm = useMemo(() => {
    const overrides = {};
    for (const key of Object.keys(decisions)) {
      if (!decisions[key]) continue;
      overrides[key] = info[key]?.value;
      if (key === "power_w" && info[key]?.basis) overrides.power_basis = info[key].basis;
    }
    return { ...currentForm, ...overrides };
  }, [currentForm, decisions, info]);

  const proposedAdequacy = useMemo(() => {
    if (!raw || proposalFields.length === 0) return null;
    try {
      const { readiness } = assessSpeakerForm(mergedForm, candidate?.specification || null);
      return readiness?.adequacy || null;
    } catch {
      return null;
    }
  }, [raw, proposalFields, mergedForm, candidate]);

  const toggle = (key) => setDecisions((prev) => ({ ...prev, [key]: !prev[key] }));

  const acceptAllFound = () => {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const key of proposalFields) {
        if (info[key]?.status === "reported") next[key] = true;
      }
      return next;
    });
  };

  const apply = async () => {
    if (!candidate) return;
    setSaving(true);
    setSaveError("");
    try {
      const overrides = {};
      const acceptedKeys = [];
      for (const key of Object.keys(decisions)) {
        if (!decisions[key]) continue;
        overrides[key] = info[key].value;
        if (key === "power_w" && info[key].basis) overrides.power_basis = info[key].basis;
        acceptedKeys.push(key);
      }
      const merged = { ...currentForm, ...overrides };
      const evidence = buildSourceEvidence(raw, acceptedKeys, info);
      await saveSpeakerComparison({ values: merged, row: candidateToFormRow(candidate), actorName, adiEvidence: evidence });
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
    <Dialog open={open} onOpenChange={(next) => { if (next && !loading && !saving) return; if (!next && !loading && !saving) close(); }}>
      <DialogContent style={{ maxWidth: 760, background: BRAND.panel, maxHeight: "90vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle style={{ color: BRAND.text, display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={16} /> Read source — {candidate?.manufacturer || ""} {candidate?.model || ""}
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
                      {["P12/P13 input", "Current", "Manufacturer source", "Use"].map((h) => (
                        <th key={h} style={{ textAlign: h === "Use" ? "center" : "left", padding: "8px 10px", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND.hint, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {proposalFields.map((key) => {
                      const f = info[key];
                      const current = currentForm[key];
                      const isAmbiguous = f.status === "ambiguous";
                      const conflict = isConflict(currentForm, key, info);
                      const checked = !!decisions[key];
                      return (
                        <tr key={key} style={{ borderTop: `1px solid ${BRAND.soft}` }}>
                          <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: BRAND.text, verticalAlign: "top" }}>
                            {FIELD_LABEL[key]}
                            {(key === "power_w" || key === "power_w_min") && f.basis && (
                              <div style={{ fontSize: 10, color: BRAND.hint, fontWeight: 400, marginTop: 2 }}>
                                {f.category || (f.basis === "continuous" ? "Continuous rating" : "Recommended amplifier")}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 12, color: conflict ? BRAND.amber : BRAND.subtext, verticalAlign: "top", fontWeight: conflict ? 600 : 400 }}>
                            {displayValue(key, current)}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: 12, color: BRAND.text, verticalAlign: "top" }}>
                            <div>{displayValue(key, f.value)}</div>
                            {isAmbiguous && (
                              <div style={{ fontSize: 10, color: BRAND.amber, marginTop: 3 }}>
                                Uncertain — left blank unless you accept it.
                              </div>
                            )}
                            {conflict && (
                              <div style={{ fontSize: 10, color: BRAND.amber, marginTop: 3 }}>
                                Differs from current — review before accepting.
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

            {proposedAdequacy && (
              <div style={{ marginTop: 10, padding: "10px 12px", border: `1px solid ${proposedAdequacy.tone}33`, borderRadius: 10, background: `${proposedAdequacy.tone}08` }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: proposedAdequacy.tone }}>
                  Proposed comparison status · {proposedAdequacy.label}
                </div>
                <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 4 }}>
                  {proposedAdequacy.key === DATA_ADEQUACY.INCOMPLETE.key
                    ? "Incomplete data — fair P12/P13 comparison not available with the accepted values."
                    : proposedAdequacy.meaning}
                </div>
              </div>
            )}
          </>
        )}

        {saveError && <div style={{ fontSize: 13, color: BRAND.red, marginTop: 8 }}>{saveError}</div>}

        <DialogFooter style={{ gap: 8 }}>
          <button type="button" onClick={close} disabled={loading || saving} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "9px 16px", background: "#FFF", color: BRAND.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
            Cancel
          </button>
          {!loading && !error && allBlankFills && proposalFields.length > 0 && (
            <button
              type="button"
              onClick={acceptAllFound}
              disabled={saving}
              style={{ border: `1px solid ${BRAND.green}`, borderRadius: 9, padding: "9px 16px", background: "#FFF", color: BRAND.green, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
            >
              Accept all found values
            </button>
          )}
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