// StepModelLookup.jsx
// ---------------------------------------------------------------------------
// Step 2 of the Add Speaker wizard: model-first lookup, not catalogue search.
//
//   Manufacturer (already chosen) + model number → Find Model Data
//
// Sound Proof searches ONLY the manufacturer's own website, and only for that
// exact model. No catalogue is crawled, no other product is read or created, and
// nothing is imported unless the admin selects a source here. A pasted product
// or PDF URL always works as the manual fallback.
// ---------------------------------------------------------------------------

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ExternalLink, Eye, FileText, Link2, Loader2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { checkExistingProduct } from "./addSpeakerExtraction.js";

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

const INPUT = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 9,
  border: `1px solid ${BRAND.border}`,
  background: "#FFF",
  color: BRAND.text,
  fontSize: 13,
};

export default function StepModelLookup({ manufacturer, onApplySource, onUseManualUrl }) {
  const navigate = useNavigate();
  const [model, setModel] = useState("");
  const [pastedUrl, setPastedUrl] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [error, setError] = useState("");
  const [existingProduct, setExistingProduct] = useState(null);

  const domain = manufacturer?.website || "";
  const canSearch = !!manufacturer && !!domain && model.trim().length > 0 && !searching;

  const handleFind = async () => {
    setSearching(true);
    setError("");
    setCandidates([]);
    setRejected([]);
    setExistingProduct(null);
    setSearched(true);
    try {
      const response = await base44.functions.invoke("findOfficialModelSources", {
        manufacturerName: manufacturer?.name || "",
        manufacturerDomain: domain,
        model: model.trim(),
      });
      const data = response?.data || {};
      if (data.error) setError(data.error);
      else {
        setCandidates(data.candidates || []);
        setRejected(data.rejected || []);
      }
    } catch (err) {
      setError(err?.message || "Model lookup failed");
    } finally {
      setSearching(false);
    }
  };

  // One source, one product: an already-imported URL is reported, never duplicated.
  const applySource = async ({ productUrl, pdfUrl }) => {
    setExistingProduct(null);
    try {
      const already = await checkExistingProduct(productUrl);
      if (already) {
        setExistingProduct(already);
        return;
      }
    } catch {
      // Non-fatal — continue with the selection
    }
    onApplySource({ productUrl, pdfUrl: pdfUrl || "", model: model.trim() });
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ fontSize: 13, color: BRAND.subtext }}>
        Enter a model number. Sound Proof will search the official manufacturer website for that model only.
      </div>

      <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${BRAND.border}`, background: BRAND.bg, fontSize: 12, color: BRAND.subtext }}>
        <div><strong style={{ color: BRAND.text }}>Manufacturer:</strong> {manufacturer?.name || "—"}</div>
        <div style={{ marginTop: 3 }}>
          <strong style={{ color: BRAND.text }}>Official domain searched:</strong> {domain || "none recorded"}
        </div>
      </div>

      {!domain && (
        <div style={{ padding: 10, borderRadius: 9, border: "1px solid #F0D9A8", background: "#FDF6E7", color: "#7A5B12", fontSize: 12 }}>
          {manufacturer?.name || "This manufacturer"} has no website recorded, so there is no official domain to search.
          Add the website under Manufacturers first, or paste the product URL below.
        </div>
      )}

      <label style={{ display: "block" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.text, marginBottom: 4 }}>Model number / name</div>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={INPUT}
          placeholder="e.g. MP150"
        />
        <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 4 }}>
          One model per lookup. Nothing else on the manufacturer's website is read.
        </div>
      </label>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={handleFind}
          disabled={!canSearch}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 14px",
            borderRadius: 9,
            border: "none",
            background: BRAND.green,
            color: "#FFF",
            fontSize: 13,
            fontWeight: 600,
            cursor: searching ? "wait" : canSearch ? "pointer" : "not-allowed",
            opacity: canSearch || searching ? 1 : 0.5,
          }}
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {searched ? "Find Model Data again" : "Find Model Data"}
        </button>
        {onUseManualUrl && (
          <button
            type="button"
            onClick={onUseManualUrl}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 9, border: `1px solid ${BRAND.border}`, background: BRAND.card, color: BRAND.text, fontSize: 13, cursor: "pointer" }}
          >
            <Link2 size={14} />
            Enter URL manually instead
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: 10, borderRadius: 9, border: "1px solid #F0C7BD", background: "#FBEFEC", color: "#8A2E1C", fontSize: 12 }}>
          {error}
        </div>
      )}

      {searched && !searching && candidates.length === 0 && !error && (
        <div style={{ padding: 12, borderRadius: 10, border: "1px solid #F0D9A8", background: "#FDF6E7", color: "#7A5B12", fontSize: 12, display: "flex", gap: 8 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            No official page or datasheet was found on {domain || "the manufacturer's site"} for this exact model.
            Paste the product or PDF URL below instead of substituting a similar model.
          </div>
        </div>
      )}

      {candidates.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.text }}>
            Official sources for {model.trim()} ({candidates.length})
          </div>
          {candidates.map((candidate) => (
            <div
              key={candidate.url}
              style={{ padding: 12, borderRadius: 10, border: `1px solid ${BRAND.border}`, background: BRAND.bg }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.text }}>{candidate.title}</div>
                  <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 2 }}>
                    {candidate.source_type} · {candidate.domain}
                  </div>
                  <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 4, wordBreak: "break-all", display: "flex", alignItems: "center", gap: 4 }}>
                    <ExternalLink size={11} /> {candidate.url}
                  </div>
                  {candidate.states_model === false && (
                    <div style={{ fontSize: 11, color: "#8A2E1C", marginTop: 4 }}>
                      The page may not name this exact model — check before extracting.
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => applySource({
                    productUrl: candidate.url,
                    pdfUrl: candidate.source_type === "Official PDF" ? candidate.url : "",
                  })}
                  style={{ padding: "8px 12px", borderRadius: 9, border: "none", background: BRAND.green, color: "#FFF", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Use this source
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejected.length > 0 && (
        <div style={{ fontSize: 11, color: BRAND.subtext }}>
          {rejected.length} off-domain result{rejected.length === 1 ? "" : "s"} were discarded (not the manufacturer's own site).
        </div>
      )}

      <label style={{ display: "block" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.text, marginBottom: 4 }}>
          Official product or PDF URL (optional)
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={pastedUrl}
            onChange={(e) => setPastedUrl(e.target.value)}
            style={{ ...INPUT, flex: 1 }}
            placeholder="https://mksound.com/products/…"
          />
          <button
            type="button"
            disabled={!pastedUrl.trim()}
            onClick={() => applySource({
              productUrl: pastedUrl.trim(),
              pdfUrl: /\.pdf($|\?)/i.test(pastedUrl.trim()) ? pastedUrl.trim() : "",
            })}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 9, border: `1px solid ${BRAND.border}`, background: BRAND.card, color: BRAND.text, fontSize: 12, fontWeight: 600, cursor: pastedUrl.trim() ? "pointer" : "not-allowed", opacity: pastedUrl.trim() ? 1 : 0.5, whiteSpace: "nowrap" }}
          >
            <FileText size={13} /> Use this URL
          </button>
        </div>
      </label>

      {existingProduct && (
        <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${BRAND.amber}55`, background: BRAND.amber + "10" }}>
          <div style={{ fontSize: 12, color: BRAND.amber, marginBottom: 8 }}>
            This source is already recorded as{" "}
            <strong>{existingProduct.full_product_name || existingProduct.model || "an existing product"}</strong>.
            Update that product rather than creating a second one.
          </div>
          <button
            type="button"
            onClick={() => navigate(`/admin/speaker-database/product/${existingProduct.id}`)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: "none", background: BRAND.green, color: "#FFF", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            <Eye size={13} /> View existing product
          </button>
        </div>
      )}
    </div>
  );
}