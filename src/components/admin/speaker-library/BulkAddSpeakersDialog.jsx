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
import { parseWorkbookFile } from "./workbookParser";
import { buildPreview, OUTCOME_META } from "./bulkAddPreview";

const BRAND = {
  text: "#1B1A1A", subtext: "#3E4349", hint: "#625143",
  border: "#DCDBD6", soft: "#F1F0EE", panel: "#FFFFFF", green: "#213428", red: "#7A1E19", amber: "#9A6E00",
};

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

function pricePreview(row) {
  return hasValue(row.price) ? `£${String(row.price).replace(/[^0-9.]/g, "")}` : "—";
}



export default function BulkAddSpeakersDialog({ open, onClose, actorName, onDone }) {
  const [text, setText] = useState("");
  const [workbookRows, setWorkbookRows] = useState([]);
  const [working, setWorking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [existingKeys, setExistingKeys] = useState(() => new Set());

  const pasteRows = useMemo(() => (open ? parsePasted(text) : []), [text, open]);
  const rows = useMemo(() => [...pasteRows, ...workbookRows], [pasteRows, workbookRows]);

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

  const preview = useMemo(() => buildPreview(rows, existingKeys, keyFor), [rows, existingKeys]);

  // Read the workbook directly in the browser (SheetJS): inspect every
  // populated cell in Sheet1, fill down blank manufacturer cells, skip headers,
  // notes and brand-only rows. No upload, no LLM extraction — the previous path
  // lost every row and turned the header into a "Brand / Product" speaker.
  const onWorkbook = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const { rows: parsed } = await parseWorkbookFile(file);
      if (parsed.length === 0) {
        setError("No product rows were found in the workbook.");
        return;
      }
      setWorkbookRows((prev) => [...prev, ...parsed]);
    } catch (e) {
      setError(e?.message || "The workbook could not be read.");
    } finally {
      setUploading(false);
    }
  };

  const addAll = async () => {
    if (preview.actionableCount === 0) return;
    setWorking(true);
    setError("");
    try {
      const outcome = await bulkAddSpeakers({ rows: preview.toAdd, actorName });
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
    setWorkbookRows([]);
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
            Paste CSV/JSON or upload an XLSX workbook. Brand and product are the minimum; everything else can be blank.
            Existing speakers are never overwritten — exact matches are skipped, within-workbook duplicates are merged.
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
              <span style={{ fontSize: 11, color: BRAND.hint }}>reads Sheet1 in your browser</span>
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
                  Preview — {rows.length} row{rows.length === 1 ? "" : "s"} · {preview.actionableCount} to add
                </div>
                <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, overflowX: "auto", maxHeight: 300, overflowY: "auto" }}>
                  <table style={{ width: "100%", minWidth: 780, borderCollapse: "collapse" }}>
                    <thead style={{ background: BRAND.soft }}>
                      <tr>
                        {["Manufacturer", "Product", "Sensitivity", "Power", "Max SPL", "Price", "Source", "Outcome"].map((label) => (
                          <th key={label} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND.hint, fontWeight: 600 }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.items.map((it, i) => {
                        const meta = OUTCOME_META[it.outcome] || OUTCOME_META.invalid;
                        const row = it.row;
                        const isBrandOnly = it.outcome === "brand-only";
                        const url = String(row.source_url || "");
                        const shortUrl = url ? url.replace(/^https?:\/\//, "").slice(0, 28) : "";
                        return (
                          <tr key={i} style={{ borderTop: `1px solid ${BRAND.soft}` }}>
                            <td style={{ padding: "7px 10px", fontSize: 13, color: hasValue(row.manufacturer) ? BRAND.text : BRAND.red }}>{row.manufacturer || "—"}</td>
                            <td style={{ padding: "7px 10px", fontSize: 13, color: hasValue(row.model) ? BRAND.text : (isBrandOnly ? BRAND.hint : BRAND.red) }}>{row.model || (isBrandOnly ? "(brand only)" : "—")}</td>
                            <td style={{ padding: "7px 10px", fontSize: 12, color: BRAND.subtext }}>{isBrandOnly ? "—" : (hasValue(row.sensitivity_db) ? `${row.sensitivity_db}` : "—")}</td>
                            <td style={{ padding: "7px 10px", fontSize: 12, color: BRAND.subtext }}>{isBrandOnly ? "—" : (hasValue(row.power_w) ? `${row.power_w}` : "—")}</td>
                            <td style={{ padding: "7px 10px", fontSize: 12, color: BRAND.subtext }}>{isBrandOnly ? "—" : (hasValue(row.max_spl_db) ? `${row.max_spl_db}` : "—")}</td>
                            <td style={{ padding: "7px 10px", fontSize: 12, color: BRAND.text }}>{isBrandOnly ? "—" : pricePreview(row)}</td>
                            <td style={{ padding: "7px 10px", fontSize: 11, color: BRAND.hint, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={url}>
                              {url ? shortUrl : "—"}
                            </td>
                            <td style={{ padding: "7px 10px", fontSize: 11, color: meta.color, fontWeight: 600, whiteSpace: "nowrap" }}>{meta.label}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {preview.items.some((it) => it.outcome === "invalid") && (
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
                disabled={working || preview.actionableCount === 0}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, border: 0, borderRadius: 9, padding: "9px 18px", background: preview.actionableCount === 0 ? "#9CA3A0" : BRAND.green, color: "#FFF", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: preview.actionableCount === 0 ? "not-allowed" : "pointer" }}
              >
                {working ? <><Loader2 size={15} className="animate-spin" /> Adding…</> : <><Upload size={15} /> Add all ({preview.actionableCount})</>}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}