// StepProductUrl.jsx — Step 2: Paste and validate the official product URL

import React, { useState } from "react";
import { Link2, Loader2, CheckCircle2, AlertCircle, ExternalLink, Eye, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

export default function StepProductUrl({ manufacturer, productUrl, onProductUrlChange, onTargetModelChange, onValidationResult, showBackToDiscovery, onBackToDiscovery, targetModel }) {
  const navigate = useNavigate();
  const [validating, setValidating] = useState(false);
  const [validationState, setValidationState] = useState("idle"); // idle | valid | exists | invalid
  const [existingProduct, setExistingProduct] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleValidate = async () => {
    if (!productUrl) return;
    setValidating(true);
    setErrorMsg("");
    setValidationState("idle");
    setExistingProduct(null);

    try {
      // Basic URL format check
      let url;
      try {
        url = new URL(productUrl);
      } catch {
        setValidationState("invalid");
        setErrorMsg("Invalid URL format. Please enter a full URL including https://");
        setValidating(false);
        return;
      }

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        setValidationState("invalid");
        setErrorMsg("URL must use http or https protocol.");
        setValidating(false);
        return;
      }

      // Check if already imported
      const existing = await checkExistingProduct(productUrl);
      if (existing) {
        setValidationState("exists");
        setExistingProduct(existing);
        onValidationResult({ valid: false, existing: true });
        setValidating(false);
        return;
      }

      // Check manufacturer domain match (best-effort heuristic)
      const manufacturerDomain = manufacturer?.website ? (() => {
        try { return new URL(manufacturer.website).hostname.replace(/^www\./, ""); } catch { return null; }
      })() : null;
      const urlDomain = url.hostname.replace(/^www\./, "");

      if (manufacturerDomain && !urlDomain.endsWith(manufacturerDomain) && !manufacturerDomain.endsWith(urlDomain)) {
        // Soft warning — don't block, but warn
        setErrorMsg(`Warning: URL domain (${urlDomain}) does not match the manufacturer website (${manufacturerDomain}). Please verify this is an official source.`);
      }

      setValidationState("valid");
      onValidationResult({ valid: true, existing: false });
    } catch (err) {
      setValidationState("invalid");
      setErrorMsg("Could not validate URL. Please check the address.");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, margin: 0 }}>Official Product URL</h2>
        <p style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
          Paste the official manufacturer product page URL for this speaker.
        </p>
      </div>

      <div className="rounded-lg p-6" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card, maxWidth: 700 }}>
        {showBackToDiscovery && (
          <div className="mb-4">
            <button
              onClick={() => { if (onBackToDiscovery) onBackToDiscovery(); }}
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: BRAND.green }}
            >
              <Search className="w-3.5 h-3.5" />
              Back to M&K Discovery
            </button>
          </div>
        )}
        <label className="text-xs font-medium mb-2 block" style={{ color: BRAND.subtext }}>
          Product Page URL
        </label>
        <div className="flex gap-2">
          <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-md" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.bg }}>
            <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: BRAND.subtext }} />
            <input
              type="url"
              value={productUrl}
              onChange={(e) => {
                onProductUrlChange(e.target.value);
                setValidationState("idle");
                setErrorMsg("");
                setExistingProduct(null);
              }}
              placeholder="https://manufacturer.com/product/xxxxx"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: BRAND.text }}
            />
          </div>
          <button
            onClick={handleValidate}
            disabled={!productUrl || validating}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap"
            style={{ background: BRAND.green, color: "#fff", opacity: !productUrl || validating ? 0.5 : 1 }}
          >
            {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {validating ? "Validating…" : "Validate"}
          </button>
        </div>

        {/* Optional target model — helps with multi-model brochure scoping */}
        <div className="mt-3">
          <label className="text-xs font-medium mb-1 block" style={{ color: BRAND.subtext }}>
            Target Model (optional — for multi-model brochures)
          </label>
          <input
            type="text"
            value={targetModel || ""}
            onChange={(e) => { if (onTargetModelChange) onTargetModelChange(e.target.value); }}
            placeholder="e.g. MP-150 — helps the extractor find the right section in a brochure"
            className="w-full px-3 py-2 rounded-md text-sm outline-none"
            style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.bg }}
          />
        </div>

        {/* Validation result */}
        {validationState === "valid" && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-md" style={{ background: BRAND.green + "10" }}>
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: BRAND.green }} />
            <div className="text-sm" style={{ color: BRAND.green }}>
              URL validated. This product has not been imported before.
              {errorMsg && <div className="mt-1 text-xs" style={{ color: BRAND.amber }}>{errorMsg}</div>}
            </div>
          </div>
        )}

        {validationState === "exists" && existingProduct && (
          <div className="mt-3 p-4 rounded-md" style={{ background: BRAND.amber + "10", border: `1px solid ${BRAND.amber}30` }}>
            <div className="flex items-start gap-2 mb-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: BRAND.amber }} />
              <div className="text-sm" style={{ color: BRAND.amber }}>
                This product URL has already been imported as <strong>{existingProduct.full_product_name || existingProduct.model || "Untitled Product"}</strong>.
              </div>
            </div>
            <button
              onClick={() => navigate(`/admin/speaker-database/product/${existingProduct.id}`)}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium"
              style={{ background: BRAND.green, color: "#fff" }}
            >
              <Eye className="w-4 h-4" /> View Existing Product
            </button>
          </div>
        )}

        {validationState === "invalid" && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-md" style={{ background: BRAND.danger + "10" }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: BRAND.danger }} />
            <div className="text-sm" style={{ color: BRAND.danger }}>{errorMsg}</div>
          </div>
        )}

        {productUrl && validationState === "valid" && (
          <div className="mt-3">
            <a href={productUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline" style={{ color: BRAND.green }}>
              Open URL in new tab <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}