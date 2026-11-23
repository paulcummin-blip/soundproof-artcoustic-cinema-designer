// ReadSourceChooser.jsx
// ---------------------------------------------------------------------------
// The first step of the Read Source dialog: choose between reading the
// manufacturer website (existing behaviour) or uploading a manufacturer PDF
// datasheet. For the PDF path, the admin selects a PDF, it is uploaded to
// private storage and persisted against the product, then the dialog reads
// it through the same extractModelSpecification path as a website.
//
// The manufacturer website URL is shown separately and is never overwritten by
// the uploaded PDF. The chooser only decides the source for THIS read pass;
// it never changes specification values.
// ---------------------------------------------------------------------------

import React, { useRef, useState } from "react";
import { Loader2, FileText, Globe, Upload, Eye, RefreshCw, Trash2 } from "lucide-react";
import {
  fetchProductDatasheet,
  uploadDatasheet,
  clearDatasheet,
  mintDatasheetSignedUrl,
} from "@/components/spl/datasheetUpload";

const BRAND = {
  text: "#1B1A1A", subtext: "#3E4349", hint: "#625143",
  border: "#DCDBD6", soft: "#F1F0EE", panel: "#FFFFFF",
  green: "#213428", red: "#7A1E19", amber: "#9A6E00",
};

export default function ReadSourceChooser({ candidate, websiteUrl, onChooseWebsite, onChoosePdf, disabled }) {
  const productId = candidate?.productId || null;
  const [datasheet, setDatasheet] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  // Fetch the currently attached datasheet once per open. The chooser is
  // remounted by the dialog when it opens, so this runs once.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const ds = await fetchProductDatasheet(productId);
      if (!cancelled) {
        setDatasheet(ds);
        setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  const hasDatasheet = Boolean(datasheet?.fileUri);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const result = await uploadDatasheet(productId, file);
      setDatasheet(result);
      onChoosePdf?.(result.fileUri, result.fileName);
    } catch (e) {
      setError(e?.message || "The datasheet could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const handleView = async () => {
    if (!datasheet?.fileUri) return;
    setViewing(true);
    try {
      const url = await mintDatasheetSignedUrl(datasheet.fileUri);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("The datasheet could not be opened.");
    } finally {
      setViewing(false);
    }
  };

  const handleReplace = () => fileInputRef.current?.click();

  const handleRemove = async () => {
    setRemoving(true);
    setError("");
    try {
      await clearDatasheet(productId);
      setDatasheet({ fileUri: null, fileName: null });
    } catch (e) {
      setError(e?.message || "The datasheet could not be removed.");
    } finally {
      setRemoving(false);
    }
  };

  const optionBtn = {
    flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start",
    gap: 6, padding: "14px 16px", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer",
    border: `1px solid ${BRAND.border}`, background: BRAND.panel, fontFamily: "inherit",
    textAlign: "left", opacity: disabled ? 0.6 : 1,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Current source summary — website + datasheet shown separately */}
      <div style={{ padding: "10px 12px", border: `1px solid ${BRAND.border}`, borderRadius: 10, background: BRAND.soft, fontSize: 12, color: BRAND.subtext }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Globe size={12} style={{ color: BRAND.hint }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND.hint }}>Website</span>
        </div>
        {websiteUrl ? (
          <a href={websiteUrl} target="_blank" rel="noopener noreferrer" style={{ color: BRAND.subtext, textDecoration: "none", wordBreak: "break-all" }}>
            {websiteUrl.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <span style={{ color: BRAND.hint }}>No website URL recorded for this product.</span>
        )}
      </div>

      {hasDatasheet && (
        <div style={{ padding: "10px 12px", border: `1px solid ${BRAND.border}`, borderRadius: 10, background: BRAND.soft, fontSize: 12, color: BRAND.subtext }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <FileText size={12} style={{ color: BRAND.hint }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND.hint }}>Attached datasheet</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: BRAND.text, fontWeight: 600 }}>{datasheet.fileName || "datasheet.pdf"}</span>
            <button type="button" onClick={handleView} disabled={viewing || disabled} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 7, padding: "3px 8px", background: "#FFF", color: BRAND.subtext, fontSize: 11, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}>
              {viewing ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />} View
            </button>
            <button type="button" onClick={handleReplace} disabled={uploading || disabled} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 7, padding: "3px 8px", background: "#FFF", color: BRAND.subtext, fontSize: 11, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}>
              <RefreshCw size={11} /> Replace
            </button>
            <button type="button" onClick={handleRemove} disabled={removing || disabled} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 7, padding: "3px 8px", background: "#FFF", color: BRAND.hint, fontSize: 11, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}>
              {removing ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} Remove
            </button>
          </div>
          <button
            type="button"
            onClick={() => onChoosePdf?.(datasheet.fileUri, datasheet.fileName)}
            disabled={disabled}
            style={{ marginTop: 8, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1px solid ${BRAND.green}`, borderRadius: 8, padding: "8px 12px", background: "#FFF", color: BRAND.green, fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer" }}
          >
            <FileText size={14} /> Read attached datasheet
          </button>
        </div>
      )}

      {!loaded ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: BRAND.subtext, padding: "8px 0" }}>
          <Loader2 size={15} className="animate-spin" /> Loading source info…
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onChooseWebsite} disabled={disabled || !websiteUrl} style={optionBtn} title={websiteUrl ? "Read the manufacturer website" : "No website URL recorded"}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: BRAND.text, fontWeight: 600, fontSize: 13 }}>
              <Globe size={15} style={{ color: BRAND.green }} /> Read manufacturer website
            </span>
            <span style={{ fontSize: 11, color: BRAND.hint }}>ADI reads the linked product page and proposes P12/P13 values.</span>
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled || uploading || !productId} style={optionBtn} title={productId ? "Upload a manufacturer PDF datasheet" : "Save the speaker before uploading a datasheet"}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: BRAND.text, fontWeight: 600, fontSize: 13 }}>
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} style={{ color: BRAND.green }} />} Upload manufacturer datasheet (PDF)
            </span>
            <span style={{ fontSize: 11, color: BRAND.hint }}>
              {hasDatasheet ? `Read the attached ${datasheet.fileName || "datasheet"} after uploading a new one.` : "Select an official manufacturer PDF. ADI reads it and proposes P12/P13 values."}
            </span>
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {error && <div style={{ fontSize: 13, color: BRAND.red }}>{error}</div>}
    </div>
  );
}