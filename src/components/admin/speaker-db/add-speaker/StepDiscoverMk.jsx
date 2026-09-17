// StepDiscoverMk.jsx — Step 2 replacement for M&K Sound
// ---------------------------------------------------------------------------
// Replaces manual URL entry with dynamic product discovery from the official
// M&K website. The connector discovers all current qualifying M&K loudspeakers
// and their official documents. The user selects one product, and the Product
// URL + Specification PDF are auto-populated. The remaining wizard stays
// unchanged.
//
// No AI. No database writes. Discovery only.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, CheckCircle2, AlertCircle, ExternalLink, FileText, XCircle, Eye, Link2 } from "lucide-react";
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

export default function StepDiscoverMk({
  manufacturer,
  productUrl,
  onProductUrlChange,
  onPdfUrlChange,
  onTargetModelChange,
  onUseManualUrl,
  onValidationResult,
}) {
  const navigate = useNavigate();
  const [discovering, setDiscovering] = useState(false);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [hasDiscovered, setHasDiscovered] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState(productUrl || "");
  const [existingProduct, setExistingProduct] = useState(null);
  const [checkingExisting, setCheckingExisting] = useState(false);

  const handleDiscover = async () => {
    setDiscovering(true);
    setError("");
    setProducts([]);
    setHasDiscovered(false);
    try {
      const response = await base44.functions.invoke("discoverMkProducts", {});
      const data = response?.data || response;
      if (data.error) {
        setError(data.error);
      } else {
        setProducts(data.products || []);
      }
      setHasDiscovered(true);
    } catch (err) {
      setError(err.message || "Discovery failed. Please try again.");
      setHasDiscovered(true);
    } finally {
      setDiscovering(false);
    }
  };

  const handleSelect = async (product) => {
    setCheckingExisting(true);
    setExistingProduct(null);
    try {
      const existing = await checkExistingProduct(product.product_url);
      if (existing) {
        setExistingProduct(existing);
        onValidationResult({ valid: false, existing: true });
        return;
      }
    } catch {
      // Non-fatal — proceed with selection
    } finally {
      setCheckingExisting(false);
    }

    onProductUrlChange(product.product_url);
    onPdfUrlChange(product.pdf_url || "");
    if (onTargetModelChange) onTargetModelChange(product.model || "");
    setSelectedUrl(product.product_url);
    onValidationResult({ valid: true, existing: false });
  };

  const selectedProduct = products.find((p) => p.product_url === selectedUrl);

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, margin: 0 }}>
          Discover M&K Products
        </h2>
        <p style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
          Sound Proof searches the official M&K website for current loudspeakers and their
          specification documents.
        </p>
      </div>

      {/* Manual fallback — always available. Discovery never blocks manual entry. */}
      <div className="mb-4 flex items-center justify-between p-3 rounded-md" style={{ background: BRAND.bg, border: `1px solid ${BRAND.border}` }}>
        <div className="text-xs" style={{ color: BRAND.subtext }}>
          Can't find the product or discovery failed? You can always enter a URL manually.
        </div>
        <button
          onClick={() => { if (onUseManualUrl) onUseManualUrl(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap"
          style={{ border: `1px solid ${BRAND.green}`, color: BRAND.green, background: BRAND.card }}
        >
          <Link2 className="w-3.5 h-3.5" />
          Use Manual URL Instead
        </button>
      </div>

      {/* Discover button */}
      {!hasDiscovered && (
        <div className="rounded-lg p-6" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card, maxWidth: 600 }}>
          <div className="flex items-center gap-3 mb-4">
            <Search className="w-5 h-5" style={{ color: BRAND.green }} />
            <div className="text-sm" style={{ color: BRAND.text }}>
              Search the official M&K website for all current qualifying loudspeakers.
            </div>
          </div>
          <div className="p-3 rounded-md mb-4" style={{ background: BRAND.bg, border: `1px solid ${BRAND.border}` }}>
            <div className="text-xs font-medium mb-1" style={{ color: BRAND.subtext }}>Discovery Rules</div>
            <ul className="space-y-0.5 text-xs" style={{ color: BRAND.subtext }}>
              <li>• Searches only the official M&K website (mksound.com)</li>
              <li>• Includes: LCR, On-wall, In-wall, Surround speakers</li>
              <li>• Excludes: Subwoofers, In-ceiling, Outdoor, Accessories, Electronics, Packages</li>
              <li>• Discovers products dynamically — new models appear automatically</li>
            </ul>
          </div>
          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-md" style={{ background: BRAND.danger + "10" }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: BRAND.danger }} />
              <div className="text-sm" style={{ color: BRAND.danger }}>{error}</div>
            </div>
          )}
          <button
            onClick={handleDiscover}
            disabled={discovering}
            className="flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium"
            style={{ background: BRAND.green, color: "#fff", opacity: discovering ? 0.5 : 1 }}
          >
            {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {discovering ? "Searching M&K website…" : "Discover M&K Products"}
          </button>
        </div>
      )}

      {/* Loading state */}
      {discovering && (
        <div className="flex items-center gap-3 p-4 rounded-lg" style={{ background: BRAND.green + "08", maxWidth: 600 }}>
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: BRAND.green }} />
          <div className="text-sm" style={{ color: BRAND.green }}>
            Fetching the M&K product index and searching each product page for specification PDFs…
          </div>
        </div>
      )}

      {/* Selected product confirmation */}
      {selectedProduct && !existingProduct && (
        <div className="mb-4 rounded-lg p-4" style={{ border: `1px solid ${BRAND.green}30`, background: BRAND.green + "08", maxWidth: 800 }}>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: BRAND.green }} />
            <div className="flex-1">
              <div className="text-sm font-medium mb-1" style={{ color: BRAND.green }}>
                Selected: {selectedProduct.full_product_name}
              </div>
              <div className="text-xs space-y-0.5" style={{ color: BRAND.subtext }}>
                <div>Series: {selectedProduct.series}</div>
                <div>Product Page: <a href={selectedProduct.product_url} target="_blank" rel="noopener noreferrer" className="underline">{selectedProduct.product_url}</a></div>
                <div>Spec PDF: {selectedProduct.pdf_url ? <a href={selectedProduct.pdf_url} target="_blank" rel="noopener noreferrer" className="underline">{selectedProduct.pdf_url}</a> : <span style={{ color: BRAND.amber }}>⚠ Not found — you can add it manually in the next step</span>}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Already imported warning */}
      {existingProduct && (
        <div className="mb-4 p-4 rounded-md" style={{ background: BRAND.amber + "10", border: `1px solid ${BRAND.amber}30`, maxWidth: 800 }}>
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: BRAND.amber }} />
            <div className="text-sm" style={{ color: BRAND.amber }}>
              This product has already been imported as <strong>{existingProduct.full_product_name || existingProduct.model || "Untitled Product"}</strong>.
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

      {/* Results table */}
      {hasDiscovered && !discovering && products.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card, maxWidth: 900 }}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: BRAND.bg, borderBottom: `1px solid ${BRAND.border}` }}>
            <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: BRAND.green, margin: 0 }}>
              Discovered Products ({products.length})
            </h3>
            <button
              onClick={handleDiscover}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium"
              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.card }}
            >
              <Search className="w-3 h-3" /> Re-search
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase" }}>Model</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase" }}>Series</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase" }}>Product Page</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase" }}>PDF</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => {
                  const isSelected = p.product_url === selectedUrl && !existingProduct;
                  return (
                    <tr
                      key={i}
                      onClick={() => handleSelect(p)}
                      style={{
                        borderBottom: `1px solid ${BRAND.border}`,
                        cursor: checkingExisting ? "wait" : "pointer",
                        background: isSelected ? BRAND.green + "08" : "transparent",
                      }}
                    >
                      <td style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, color: BRAND.text }}>
                        <div className="flex items-center gap-2">
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: BRAND.green }} />}
                          {p.model}
                        </div>
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: BRAND.subtext }}>{p.series}</td>
                      <td style={{ padding: "8px 12px", fontSize: 11, color: BRAND.green }}>
                        {p.product_url ? (
                          <a href={p.product_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 underline">
                            Page <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span style={{ color: BRAND.danger }}>Not found</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 11 }}>
                        {p.pdf_url ? (
                          <a href={p.pdf_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 underline" style={{ color: BRAND.green }}>
                            <FileText className="w-3 h-3" /> PDF
                          </a>
                        ) : (
                          <span style={{ color: BRAND.amber, fontSize: 11 }}>⚠ Not found</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: p.status === "Discontinued" ? BRAND.danger : p.status === "Current" ? BRAND.green : BRAND.subtext,
                        }}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 text-xs" style={{ background: BRAND.bg, borderTop: `1px solid ${BRAND.border}`, color: BRAND.subtext }}>
            Click a product to select it. The Product URL and Specification PDF will be populated automatically.
          </div>
        </div>
      )}

      {/* No results */}
      {hasDiscovered && !discovering && products.length === 0 && !error && (
        <div className="rounded-lg p-6" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card, maxWidth: 600 }}>
          <div className="flex items-start gap-3 mb-4">
            <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: BRAND.amber }} />
            <div>
              <div className="text-sm font-medium mb-1" style={{ color: BRAND.text }}>No qualifying products found</div>
              <div className="text-xs" style={{ color: BRAND.subtext }}>
                The M&K website may have changed structure, or no products matched the inclusion rules.
              </div>
            </div>
          </div>
          <button
            onClick={() => { if (onUseManualUrl) onUseManualUrl(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
            style={{ background: BRAND.green, color: "#fff" }}
          >
            <Link2 className="w-4 h-4" />
            Enter URL Manually
          </button>
        </div>
      )}

      {/* Error state */}
      {hasDiscovered && error && products.length === 0 && (
        <div className="rounded-lg p-6" style={{ border: `1px solid ${BRAND.danger}30`, background: BRAND.card, maxWidth: 600 }}>
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: BRAND.danger }} />
            <div>
              <div className="text-sm font-medium mb-1" style={{ color: BRAND.danger }}>Unable to discover official documents</div>
              <div className="text-xs" style={{ color: BRAND.subtext }}>{error}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDiscover}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.card }}
            >
              <Search className="w-4 h-4" /> Try Again
            </button>
            <button
              onClick={() => { if (onUseManualUrl) onUseManualUrl(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
              style={{ background: BRAND.green, color: "#fff" }}
            >
              <Link2 className="w-4 h-4" />
              Enter URL Manually
            </button>
          </div>
        </div>
      )}
    </div>
  );
}