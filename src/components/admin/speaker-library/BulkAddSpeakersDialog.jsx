// BulkAddSpeakersDialog.jsx
// ---------------------------------------------------------------------------
// "+ Add Multiple" — paste CSV or JSON prepared by ChatGPT, see a simple
// preview, then Add all. No identity reconciliation: duplicates are shown as a
// warning but never block the import, and existing records are never
// overwritten. Blank fields are fine.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Upload, FileSpreadsheet } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { competitorIdentityKey } from "@/components/utils/spl/manufacturerIdentity";
import { parsePasted, bulkAddSpeakers } from "./bulkAddSpeakers";

const BRAND = {
  text: "#1B1A1A", subtext: "#3E4349", hint: "#625143",
  border: "#DCDBD6", soft: "#F1F0EE", panel: "#FFFFFF", green: "#213428", red: "#7A1E19", amber: "#9A6E00",
};

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

/** A short data summary for the preview: what the row carries, or "INCOMPLETE". */
function dataSummary(row) {
  const parts = [];
  if (hasValue(row.sensitivity_db)) parts.push("sensitivity");
  if (hasValue(row.impedance_ohm)) parts.push("impedance");
  if (hasValue(row.power_w)) parts.push("power");
  if (hasValue(row.max_spl_db)) parts.push("max SPL");
  return parts.length > 0 ? parts.join(", ") : "INCOMPLETE";
}

function pricePreview(row) {
  return hasValue(row.price) ? `£${String(row.price).replace(/[^0-9.]/g, "")}` : "—";
}

export default function BulkAddSpeakersDialog({ open, onClose, actorName, onDone }) {
  const [text, setText] = useState("");
  const [working, setWorking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [existingKeys, setExistingKeys] = useState(() => new Set());

  const rows = useMemo(() => (open ? parsePasted(text) : []), [text, open]);

  // Load existing product identities once per open so the preview can flag
  // Existing vs New without a per-row API call.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.entities.SpeakerProduct.list("model", 500);
        const items = Array.isArray(res) ? res : (res?.items || []);
        const keys = new Set(
          items
            .map((p) => competitorIdentityKey({ manufacturer: p.manufacturer_name, model: p.model }))
            .filter(Boolean),
        );
        if (!cancelled) setExistingKeys(keys);
      } catch {
        if (!cancelled) setExistingKeys(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const keyFor = (row) => competitorIdentityKey({ manufacturer: row.manufacturer, model: row.model });

  // Convert extracted workbook rows into the CSV dialect parsePasted already
  // understands, so the existing preview/apply path handles them unchanged.
  // Manufacturer names are filled down where blank cells belong to the preceding
  // brand; non-breaking spaces and trailing spaces are trimmed; fully blank
  // rows are dropped so notes and separators never become dummy products.
  const csvCell = (v) => {
    const s = String(v ?? "").replace(/\u00a0/g, " ").trim();
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const onWorkbook = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const up = await base44.integrations.Core.UploadPrivateFile({ file });
      const file_uri = up?.file_uri || up?.data?.file_uri || up?.uri;
      if (!file_uri) throw new Error("The workbook could not be uploaded.");
      // ExtractDataFromUploadedFile needs a fetchable URL; sign the private file
      // for long enough to run the one-time extraction.
      const signed = await base44.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in: 600 });
      const file_url = signed?.signed_url || signed?.data?.signed_url;
      if (!file_url) throw new Error("The workbook could not be read.");
      const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: "object",
          properties: {
            rows: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  manufacturer: { type: "string" },
                  model: { type: "string" },
                  source_url: { type: "string" },
                  sensitivity: { type: "string" },
                  impedance: { type: "string" },
                  power: { type: "string" },
                  max_spl: { type: "string" },
                  price: { type: "string" },
                },
              },
            },
          },
        },
      });
      const data = res?.data ?? res;
      const extracted = Array.isArray(data?.output?.rows) ? data.output.rows : (Array.isArray(data?.output) ? data.output : []);
      const header = "Brand,Product,Sensitivity,Impedance,Power,Max SPL,Price,URL";
      let lastMfr = "";
      const lines = [header];
      for (const r of extracted) {
        let mfr = String(r.manufacturer || "").replace(/\u00a0/g, " ").trim();
        const model = String(r.model || "").replace(/\u00a0/g, " ").trim();
        if (mfr) lastMfr = mfr;
        else mfr = lastMfr;
        if (!mfr && !model) continue;
        lines.push([
          mfr, model,
          r.sensitivity, r.impedance, r.power, r.max_spl, r.price, r.source_url,
        ].map(csvCell).join(","));
      }
      const csv = lines.join("\n");
      setText((prev) => {
        const prevTrim = String(prev || "").replace(/\s+$/, "");
        return prevTrim ? prevTrim + "\n" + csv : csv;
      });
    } catch (e) {
      setError(e?.message || "The workbook could not be read.");
    } finally {
      setUploading(false);
    }
  };

  const addAll = async () => {
    if (rows.length === 0) return;
    setWorking(true);
    setError("");
    try {
      const outcome = await bulkAddSpeakers({ rows, actorName });
      setResult(outcome);
      onDone?.(outcome);
    } catch (e) {
      setError(e?.message || "The paste could not be added.");
    } finally {
      setWorking(false);
    }
  };

  const close = () => {
    if (working) return;
    setText("");
    setError("");
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !working) close(); }}>
      <DialogContent style={{ maxWidth: 820, background: BRAND.panel, maxHeight: "90vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle style={{ color: BRAND.text }}>Add multiple speakers</DialogTitle>
          <DialogDescription style={{ color: BRAND.subtext }}>
            Paste CSV or JSON prepared by ChatGPT. Brand and product are the minimum; everything else can be blank.
            Existing speakers are never overwritten — duplicates are shown as a warning only.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div style={{ padding: "14px 16px", border: `1px solid ${BRAND.border}`, borderRadius: 10, background: "#F4F8F3" }}>
            <div style={{ fontWeight: 700, color: BRAND.green, marginBottom: 6 }}>
              Added {result.created} speaker{result.created === 1 ? "" : "s"}.
            </div>
            <div style={{ fontSize: 13, color: BRAND.subtext }}>
              {result.manufacturers > 0 && `${result.manufacturers} manufacturer${result.manufacturers === 1 ? "" : "s"} added. `}
              {result.skipped > 0 && `${result.skipped} already existed (not overwritten). `}
              {result.duplicates.length > 0 && `${result.duplicates.length} duplicate warning${result.duplicates.length === 1 ? "" : "s"}. `}
              {result.errors.length > 0 && `${result.errors.length} error${result.errors.length === 1 ? "" : "s"}.`}
            </div>
            {result.errors.length > 0 && (
              <ul style={{ fontSize: 12, color: BRAND.red, marginTop: 8, paddingLeft: 18 }}>
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e.manufacturer} {e.model}: {e.reason}</li>
                ))}
              </ul>
            )}
            {result.duplicates.length > 0 && (
              <div style={{ fontSize: 12, color: BRAND.hint, marginTop: 8 }}>
                Duplicates: {result.duplicates.slice(0, 10).map((d) => `${d.manufacturer} ${d.model}`).join(", ")}
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, border: `1px solid ${BRAND.border}`, background: "#FFF", color: BRAND.text, cursor: uploading ? "default" : "pointer", fontSize: 13, fontFamily: "inherit" }}>
                <FileSpreadsheet size={15} /> {uploading ? "Reading workbook…" : "Upload workbook"}
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; onWorkbook(f); }} />
              </label>
              <span style={{ fontSize: 11, color: BRAND.hint }}>(stored privately — read once for this import)</span>
            </div>

            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"Brand,Product,Sensitivity,Impedance,Power,Max SPL,Price,URL\nM&K Sound,S300,90,4,300,112,4500,https://...\nKEF,Ci5160REFM-THX,,,,,,https://..."}
              style={{
                width: "100%", minHeight: 160, border: `1px solid ${BRAND.border}`, borderRadius: 9,
                padding: 12, fontSize: 13, fontFamily: "monospace", color: BRAND.text, background: "#FFF",
                resize: "vertical",
              }}
            />

            {rows.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.text, marginBottom: 6 }}>
                  Preview — {rows.length} row{rows.length === 1 ? "" : "s"}
                </div>
                <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, overflowX: "auto", maxHeight: 280, overflowY: "auto" }}>
                  <table style={{ width: "100%", minWidth: 540, borderCollapse: "collapse" }}>
                    <thead style={{ background: BRAND.soft }}>
                      <tr>
                        {["Brand", "Product", "Status", "Data", "Price"].map((label) => (
                          <th key={label} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND.hint, fontWeight: 600 }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        const hasBrand = hasValue(row.manufacturer);
                        const hasProduct = hasValue(row.model);
                        const isBrandOnly = hasBrand && !hasProduct;
                        const isExisting = hasProduct && existingKeys.has(keyFor(row));
                        const isIncomplete = hasProduct && !isExisting && dataSummary(row) === "INCOMPLETE";
                        const priceFound = hasValue(row.price);
                        return (
                          <tr key={i} style={{ borderTop: `1px solid ${BRAND.soft}` }}>
                            <td style={{ padding: "7px 10px", fontSize: 13, color: hasBrand ? BRAND.text : BRAND.red }}>{row.manufacturer || "—"}</td>
                            <td style={{ padding: "7px 10px", fontSize: 13, color: hasProduct ? BRAND.text : (isBrandOnly ? BRAND.hint : BRAND.red) }}>{row.model || (isBrandOnly ? "(brand only)" : "—")}</td>
                            <td style={{ padding: "7px 10px", fontSize: 11, color: BRAND.hint }}>
                              {isBrandOnly ? <span style={{ color: BRAND.subtext }}>Manufacturer</span>
                                : isExisting ? <span style={{ color: BRAND.green, fontWeight: 600 }}>Existing</span>
                                : isIncomplete ? <span style={{ color: BRAND.amber }}>New · Incomplete</span>
                                : <span style={{ color: BRAND.text }}>New</span>}
                              {priceFound && <span style={{ color: BRAND.green }}> · £</span>}
                            </td>
                            <td style={{ padding: "7px 10px", fontSize: 12, color: BRAND.hint }}>{isBrandOnly ? "—" : dataSummary(row)}</td>
                            <td style={{ padding: "7px 10px", fontSize: 13, color: BRAND.text }}>{isBrandOnly ? "—" : pricePreview(row)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {(rows.some((r) => !hasValue(r.manufacturer) && hasValue(r.model))) && (
                  <div style={{ fontSize: 12, color: BRAND.amber, marginTop: 6 }}>
                    Rows with a product but no brand will be skipped.
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {error && <div style={{ fontSize: 13, color: BRAND.red, marginTop: 8 }}>{error}</div>}

        <DialogFooter style={{ gap: 8 }}>
          {result ? (
            <button type="button" onClick={close} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "9px 16px", background: BRAND.text, color: "#FFF", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
              Done
            </button>
          ) : (
            <>
              <button type="button" onClick={close} disabled={working} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "9px 16px", background: "#FFF", color: BRAND.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={addAll}
                disabled={working || rows.length === 0}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, border: 0, borderRadius: 9, padding: "9px 18px", background: rows.length === 0 ? "#9CA3A0" : BRAND.green, color: "#FFF", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: rows.length === 0 ? "not-allowed" : "pointer" }}
              >
                {working ? <><Loader2 size={15} className="animate-spin" /> Adding…</> : <><Upload size={15} /> Add all ({rows.length})</>}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}