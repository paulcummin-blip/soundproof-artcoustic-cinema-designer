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
  ACCEPTANCE_FIELDS,
  buildSourceEvidence,
  candidateToFormRow,
  currentFormFor,
  decideDefaults,
  displayValue,
  extractionToFound,
  fieldLabelFor,
  isConflict,
  readSourceExtraction,
  sourceUrlOf,
} from "@/components/spl/adiSourceExtraction";
import { DATA_ADEQUACY } from "@/components/spl/dataAdequacyClassification";
import { ASSUMED_SENSITIVITY_BASIS_NOTE } from "@/components/utils/spl/sensitivityBasisAssumption";
import { base44 } from "@/api/base44Client";
import ReadSourceChooser from "@/components/spl/ReadSourceChooser";

const BRAND = {
  text: "#1B1A1A", subtext: "#3E4349", hint: "#625143",
  border: "#DCDBD6", soft: "#F1F0EE", panel: "#FFFFFF",
  green: "#213428", red: "#7A1E19", amber: "#9A6E00",
};

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== "";

/**
 * Load the candidate's current stored specification so the proposed-status
 * assessment starts from the existing record (frequency response, power
 * rating, source date, evidence quality …) — the same base the real save
 * merges its patch into. Comparison candidates only carry a normalised
 * `record`, not the raw specification, so without this the proposed status
 * is assessed from the patch alone and reads INCOMPLETE even when the
 * stored record already supplies every field the form does not capture.
 */
async function fetchExistingSpecification(candidate) {
  try {
    const specId = candidate?.specificationId || candidate?.record?.source_specification_id || null;
    if (specId) {
      try {
        const spec = await base44.entities.SpeakerSpecification.get(specId);
        if (spec) return spec;
      } catch { /* fall through to the product filter */ }
    }
    const productId = candidate?.productId || candidate?.record?.source_product_id || null;
    if (productId) {
      const result = await base44.entities.SpeakerSpecification.filter({ product_id: productId });
      const items = Array.isArray(result) ? result : result?.items || [];
      return items.find((s) => s.id && s.is_current !== false) || items[0] || null;
    }
  } catch {
    // Best-effort: the proposed status simply falls back to the form-only
    // assessment if the existing specification cannot be loaded.
  }
  return null;
}

export default function ReadWithAdiDialog({ open, onClose, candidate, actorName, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [raw, setRaw] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // The candidate's current stored specification — the base the proposed
  // status is assessed against. Fetched once per open so the merged
  // assessment sees every stored field the form does not capture.
  const [existingSpec, setExistingSpec] = useState(null);

  const sourceUrl = sourceUrlOf(candidate);

  const currentForm = useMemo(() => currentFormFor(candidate), [candidate]);
  const { found, info } = useMemo(() => (raw ? extractionToFound(raw) : { found: {}, info: {} }), [raw]);

  const proposalFields = useMemo(
    () => ACCEPTANCE_FIELDS.filter((key) => info[key]),
    [info],
  );

  // True when every proposal is a new blank-field fill (nothing overwrites an
  // existing value). In that case a single "Accept all found values" action is
  // offered alongside the per-field checkboxes.
  const allBlankFills = useMemo(
    () => proposalFields.length > 0 && proposalFields.every((key) => !isConflict(currentForm, key, info)),
    [proposalFields, currentForm, info],
  );

  // On open, reset state and fetch the current stored specification — the base
  // the proposed status is assessed against. The source read is NOT started
  // automatically: the admin first chooses whether to read the manufacturer
  // website or upload a PDF datasheet (ReadSourceChooser), then this calls the
  // shared extractModelSpecification path with the chosen source.
  useEffect(() => {
    if (!open || !candidate) return;
    setError("");
    setRaw(null);
    setDecisions({});
    setSaveError("");
    setExistingSpec(null);
    (async () => {
      try {
        const spec = await fetchExistingSpecification(candidate);
        setExistingSpec(spec);
      } catch {
        setExistingSpec(null);
      }
    })();
  }, [open, candidate]);

  // Read the chosen source (website or uploaded PDF) through the same
  // extractModelSpecification backend function. The website path passes no
  // fileUri; the PDF path passes the uploaded file's private file_uri so the
  // backend mints a signed URL and reads the PDF verbatim.
  const readFromSource = async (options = {}) => {
    if (!candidate) return;
    setLoading(true);
    setError("");
    setRaw(null);
    setDecisions({});
    try {
      const data = await readSourceExtraction(candidate, options);
      setRaw(data);
      setDecisions(decideDefaults(currentFormFor(candidate), extractionToFound(data).info));
    } catch (e) {
      setError(e?.message || "ADI could not read this source.");
    } finally {
      setLoading(false);
    }
  };

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

  // Proposed comparison status, assessed from the stored specification +
  // every currently checked proposed source value + the form's controlled
  // defaults. Recomputes live as the admin checks or unchecks fields, so the
  // modal shows what the status WILL become if the checked values are
  // accepted — never only what the saved record already is.
  const proposedStatus = useMemo(() => {
    if (!raw || proposalFields.length === 0) return null;
    try {
      const { readiness } = assessSpeakerForm(mergedForm, existingSpec);
      return {
        adequacy: readiness?.adequacy || null,
        sensitivityBasisAssumed: readiness?.sensitivityBasisAssumed === true,
      };
    } catch {
      return null;
    }
  }, [raw, proposalFields, mergedForm, existingSpec]);

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

  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
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
  const sourceReadFailed = raw?.source_read_failed === true;
  const sourceReadOk = !sourceReadFailed && (raw?.source_read === true || (raw && !raw.source_read_note));

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next && !loading && !saving) return; if (!next && !loading && !saving) close(); }}>
      <DialogContent style={{ maxWidth: 760, background: BRAND.panel, maxHeight: "90vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle style={{ color: BRAND.text, display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={16} /> Read source — {candidate?.manufacturer || ""} {candidate?.model || ""}
          </DialogTitle>
          <DialogDescription style={{ color: BRAND.subtext }}>
            ADI reads the manufacturer's published specifications and identifies the values needed to calculate RP22 speaker capability. Review and select which values to accept.
          </DialogDescription>
        </DialogHeader>

        {sourceUrl && (
          <div style={{ fontSize: 12, color: BRAND.hint, marginBottom: 8, wordBreak: "break-all" }}>
            <ExternalLink size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: BRAND.subtext }}>{sourceUrl}</a>
          </div>
        )}

        {!loading && !error && !raw && (
          <ReadSourceChooser
            candidate={candidate}
            websiteUrl={sourceUrl}
            disabled={loading || saving}
            onChooseWebsite={() => readFromSource()}
            onChoosePdf={(fileUri, fileName) => readFromSource({ fileUri, fileName })}
          />
        )}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: BRAND.subtext, padding: "12px 0" }}>
            <Loader2 size={16} className="animate-spin" /> Reading source with ADI…
          </div>
        )}

        {error && <div style={{ fontSize: 13, color: BRAND.red }}>{error}</div>}

        {!loading && !error && raw && (
          <>
            {sourceReadFailed && (
              <div style={{ padding: "12px 14px", border: `1px solid ${BRAND.red}55`, borderRadius: 10, background: `${BRAND.red}0a`, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND.red }}>
                  Source could not be read
                </div>
                <div style={{ fontSize: 12, color: BRAND.text, marginTop: 4 }}>
                  {raw.source_read_note || "The linked manufacturer document could not be accessed or parsed. No alternative source was used."}
                </div>
                <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 6 }}>
                  Update the source URL on the product record and try again. Values from different source versions are never combined without review.
                </div>
              </div>
            )}
            {!sourceReadFailed && raw.source_read_note && !sourceReadOk && (
              <div style={{ fontSize: 12, color: BRAND.amber, marginBottom: 8 }}>
                {raw.source_read_note}
              </div>
            )}
            {!sourceReadFailed && !modelConfirmed && (
              <div style={{ fontSize: 12, color: BRAND.amber, marginBottom: 8 }}>
                The source did not explicitly name this exact model. Review each value carefully before accepting.
              </div>
            )}

            {sourceReadFailed ? (
              <div style={{ fontSize: 13, color: BRAND.subtext, padding: "8px 0" }}>
                No values are proposed because the linked source could not be read.
              </div>
            ) : proposalFields.length === 0 ? (
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
                            {fieldLabelFor(key, info)}
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
                                Conflicts with the saved value — accepting overwrites it.
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
                              aria-label={`Use source value for ${fieldLabelFor(key, info)}`}
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

            {info.max_spl_unqualified_note && (
              <div style={{ marginTop: 8, padding: "10px 12px", border: `1px solid ${BRAND.border}`, borderRadius: 10, background: BRAND.soft }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND.hint }}>
                  Max SPL — basis not stated
                </div>
                <div style={{ fontSize: 12, color: BRAND.text, marginTop: 4 }}>
                  {info.max_spl_unqualified_note.value} dB — {info.max_spl_unqualified_note.category}
                </div>
                {info.max_spl_unqualified_note.quote && (
                  <div style={{ fontSize: 10, color: BRAND.hint, marginTop: 4, fontStyle: "italic" }}>
                    “{info.max_spl_unqualified_note.quote.slice(0, 160)}{info.max_spl_unqualified_note.quote.length > 160 ? "…" : ""}”
                  </div>
                )}
                <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 4 }}>
                  The source did not state whether this is a continuous or peak figure, or the measurement basis. The number and wording are retained here but never written as continuous SPL, so no RP22 result is manufactured from an unqualified claim.
                </div>
              </div>
            )}

            {info.power_handling_note && (
              <div style={{ marginTop: 8, padding: "10px 12px", border: `1px solid ${BRAND.border}`, borderRadius: 10, background: BRAND.soft }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND.hint }}>
                  Power handling — basis not stated
                </div>
                <div style={{ fontSize: 12, color: BRAND.text, marginTop: 4 }}>
                  {info.power_handling_note.value} W — {info.power_handling_note.category}
                </div>
                {info.power_handling_note.quote && (
                  <div style={{ fontSize: 10, color: BRAND.hint, marginTop: 4, fontStyle: "italic" }}>
                    “{info.power_handling_note.quote.slice(0, 160)}{info.power_handling_note.quote.length > 160 ? "…" : ""}”
                  </div>
                )}
                <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 4 }}>
                  The source did not state the standard (continuous / RMS / IEC / AES / peak / recommended amplifier). The manufacturer wording is preserved and no basis is invented — classify it in Edit speaker if needed. A published continuous SPL remains the comparison authority.
                </div>
              </div>
            )}

            {(() => {
              // Only surface power categories the acceptance table does not
              // already show. The table displays the selected continuous
              // authority (power_w), the recommended amplifier max (power_w_amp)
              // and the recommended amplifier min (power_w_min); any advisory
              // matching one of those categories duplicates a table row and is
              // hidden here. Additional categories (programme, peak, a second
              // continuous source, etc.) remain so the admin can see every
              // distinct power figure the manufacturer published.
              const displayed = new Set();
              if (info.power_w && info.power_w.basis === "continuous" && info.power_w.category) {
                displayed.add(info.power_w.category);
              }
              if (info.power_w_amp) displayed.add("Recommended amplifier max");
              if (info.power_w_min) displayed.add("Recommended amplifier min");
              if (info.peak_power_w) {
                displayed.add("Power handling peak");
                displayed.add("Peak power");
              }
              const extra = (info.power_advisories || []).filter((p) => !displayed.has(p.category));
              if (extra.length === 0) return null;
              return (
                <div style={{ marginTop: 8, padding: "10px 12px", border: `1px solid ${BRAND.border}`, borderRadius: 10, background: BRAND.soft }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND.hint }}>
                    Additional published power specifications
                  </div>
                  <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 2, marginBottom: 6 }}>
                    Further power categories the manufacturer published beyond the rating shown above. The calculation authority hierarchy selects the value for P12/P13; these remain visible for review.
                  </div>
                  {extra.map((p, i) => (
                    <div key={i} style={{ fontSize: 12, color: BRAND.text, marginTop: 4, display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontWeight: 600, minWidth: 180 }}>{p.category}</span>
                      <span>{p.value} W</span>
                      <span style={{ fontSize: 10, color: p.status === "ambiguous" ? BRAND.amber : BRAND.hint }}>{p.status}</span>
                    </div>
                  ))}
                  {extra.some((p) => p.quote) && (
                    <div style={{ marginTop: 6, borderTop: `1px solid ${BRAND.border}`, paddingTop: 6 }}>
                      {extra.filter((p) => p.quote).map((p, i) => (
                        <div key={i} style={{ fontSize: 10, color: BRAND.hint, marginTop: 2, fontStyle: "italic" }}>
                          <strong>{p.category}:</strong> “{p.quote.slice(0, 120)}{p.quote.length > 120 ? "…" : ""}”
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {info.locked_system && info.locked_system.value === true && (
              <div style={{ marginTop: 8, padding: "10px 12px", border: `1px solid ${BRAND.green}55`, borderRadius: 10, background: `${BRAND.green}0a` }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND.green }}>
                  Fixed manufacturer-locked amplification recognised
                </div>
                <div style={{ fontSize: 12, color: BRAND.text, marginTop: 4 }}>
                  Fixed {info.locked_system.category || "manufacturer-locked"} amplification:{" "}
                  {hasValue(info.locked_amp_w?.value) ? `${info.locked_amp_w.value} W` : "per-channel power not stated"}
                </div>
                {(info.locked_system.quote || info.locked_amp_w?.quote) && (
                  <div style={{ fontSize: 10, color: BRAND.hint, marginTop: 4, fontStyle: "italic" }}>
                    “{(info.locked_amp_w?.quote || info.locked_system.quote || "").slice(0, 180)}{(info.locked_amp_w?.quote || info.locked_system.quote || "").length > 180 ? "…" : ""}”
                  </div>
                )}
                <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 4 }}>
                  The comparison uses the per-channel amplifier power and the published maximum SPL directly, without requiring sensitivity or impedance. The published maximum SPL follows the existing peak/continuous rule.
                </div>
              </div>
            )}

            {info.potential_unmapped && info.potential_unmapped.length > 0 && (
              <div style={{ marginTop: 8, padding: "10px 12px", border: `1px solid ${BRAND.amber}55`, borderRadius: 10, background: `${BRAND.amber}0a` }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND.amber }}>
                  Potential field not mapped
                </div>
                {info.potential_unmapped.map((u, i) => (
                  <div key={i} style={{ fontSize: 12, color: BRAND.text, marginTop: 4 }}>
                    <strong>{u.concept || "Unnamed concept"}</strong>
                    {u.quote && (
                      <div style={{ fontSize: 10, color: BRAND.hint, marginTop: 2, fontStyle: "italic" }}>
                        “{u.quote.slice(0, 180)}{u.quote.length > 180 ? "…" : ""}”
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 4 }}>
                  ADI noticed this P12/P13-relevant specification in the source but could not map it to a field. Review the source and enter the value manually if needed.
                </div>
              </div>
            )}

            {proposedStatus && proposedStatus.adequacy && (
              <div style={{ marginTop: 10, padding: "10px 12px", border: `1px solid ${proposedStatus.adequacy.tone}33`, borderRadius: 10, background: `${proposedStatus.adequacy.tone}08` }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: proposedStatus.adequacy.tone }}>
                  Proposed comparison status · {proposedStatus.adequacy.label}
                </div>
                <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 4 }}>
                  {proposedStatus.adequacy.key === DATA_ADEQUACY.INCOMPLETE.key
                    ? "Incomplete data — fair P12/P13 comparison not available with the accepted values."
                    : proposedStatus.adequacy.meaning}
                </div>
                {proposedStatus.sensitivityBasisAssumed && (
                  <div style={{ fontSize: 11, color: BRAND.hint, marginTop: 4 }}>
                    {ASSUMED_SENSITIVITY_BASIS_NOTE}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {saveError && <div style={{ fontSize: 13, color: BRAND.red, marginTop: 8 }}>{saveError}</div>}

        <DialogFooter style={{ gap: 8 }}>
          <button type="button" onClick={close} disabled={loading || saving} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "9px 16px", background: "#FFF", color: BRAND.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
            Cancel
          </button>
          {!loading && !error && !sourceReadFailed && allBlankFills && proposalFields.length > 0 && (
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
            disabled={loading || saving || sourceReadFailed || proposalFields.length === 0}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, border: 0, borderRadius: 9, padding: "9px 18px", background: (sourceReadFailed || proposalFields.length === 0) ? "#9CA3A0" : BRAND.green, color: "#FFF", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: (sourceReadFailed || proposalFields.length === 0) ? "not-allowed" : "pointer" }}
          >
            {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <>Save accepted values</>}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}