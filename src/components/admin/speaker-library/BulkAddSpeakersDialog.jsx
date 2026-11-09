// BulkAddSpeakersDialog.jsx
// ---------------------------------------------------------------------------
// "+ Add Multiple" — paste CSV or JSON prepared by ChatGPT, see a simple
// preview, then Add all. No identity reconciliation: duplicates are shown as a
// warning but never block the import, and existing records are never
// overwritten. Blank fields are fine.
// ---------------------------------------------------------------------------

import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Upload } from "lucide-react";
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
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const rows = useMemo(() => (open ? parsePasted(text) : []), [text, open]);

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
                  <table style={{ width: "100%", minWidth: 480, borderCollapse: "collapse" }}>
                    <thead style={{ background: BRAND.soft }}>
                      <tr>
                        {["Brand", "Product", "Data", "Price"].map((label) => (
                          <th key={label} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND.hint, fontWeight: 600 }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        const hasBrand = hasValue(row.manufacturer);
                        const hasProduct = hasValue(row.model);
                        const isDuplicate = false; // duplicates are detected at apply time
                        return (
                          <tr key={i} style={{ borderTop: `1px solid ${BRAND.soft}` }}>
                            <td style={{ padding: "7px 10px", fontSize: 13, color: hasBrand ? BRAND.text : BRAND.red }}>{row.manufacturer || "—"}</td>
                            <td style={{ padding: "7px 10px", fontSize: 13, color: hasProduct ? BRAND.text : BRAND.red }}>{row.model || "—"}</td>
                            <td style={{ padding: "7px 10px", fontSize: 12, color: BRAND.hint }}>{dataSummary(row)}</td>
                            <td style={{ padding: "7px 10px", fontSize: 13, color: BRAND.text }}>{pricePreview(row)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {(rows.some((r) => !hasValue(r.manufacturer) || !hasValue(r.model))) && (
                  <div style={{ fontSize: 12, color: BRAND.amber, marginTop: 6 }}>
                    Rows missing a brand or product will be skipped.
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