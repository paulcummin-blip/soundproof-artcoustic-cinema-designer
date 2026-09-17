// StepDocuments.jsx — Step 3: Auto-discover documents from the product page
//
// When the user enters this step, the wizard automatically fetches the product
// page and looks for official document links (PDFs, manuals, CAD, spinorama).
// The user only intervenes if something wasn't found.
//
// No AI. No crawling. Just "find the official documents" on the page.

import React, { useState, useEffect } from "react";
import { FileText, ExternalLink, Plus, Trash2, Globe, FileCheck, Loader2, CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";

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

const DOC_TYPES = ["Product Page", "PDF", "Manual", "CAD", "Spinorama", "Engineering Document", "Support Document"];

// Document types we search for automatically
const AUTO_DISCOVER_TYPES = [
  { type: "Product Page", label: "Product Page", icon: Globe },
  { type: "PDF", label: "Specification PDF", icon: FileText },
  { type: "Manual", label: "Manual", icon: FileText },
  { type: "CAD", label: "CAD Drawing", icon: FileText },
  { type: "Spinorama", label: "Spinorama", icon: FileText },
];

export default function StepDocuments({ productUrl, pdfUrl, onPdfUrlChange, additionalDocs, onAdditionalDocsChange }) {
  const [discovering, setDiscovering] = useState(false);
  const [discoveredDocs, setDiscoveredDocs] = useState([]);
  const [discoverError, setDiscoverError] = useState("");
  const [hasDiscovered, setHasDiscovered] = useState(false);

  // Auto-fetch documents when entering the step
  useEffect(() => {
    if (productUrl && !hasDiscovered) {
      handleDiscover();
    }
  }, [productUrl]);

  const handleDiscover = async () => {
    if (!productUrl) return;
    setDiscovering(true);
    setDiscoverError("");
    try {
      const response = await base44.functions.invoke("discoverSpeakerDocuments", { productUrl });
      const docs = response?.data?.documents || [];
      setDiscoveredDocs(docs);

      // Auto-populate PDF URL if found
      const pdfDoc = docs.find((d) => d.document_type === "PDF");
      if (pdfDoc && !pdfUrl) {
        onPdfUrlChange(pdfDoc.url);
      }

      // Auto-populate additional docs (manuals, CAD, spinorama)
      const otherDocs = docs.filter((d) => ["Manual", "CAD", "Spinorama"].includes(d.document_type));
      if (otherDocs.length > 0 && additionalDocs.length === 0) {
        onAdditionalDocsChange(otherDocs.map((d) => ({
          document_type: d.document_type,
          url: d.url,
          title: d.title,
        })));
      }

      setHasDiscovered(true);
    } catch (err) {
      setDiscoverError(err.message || "Could not fetch the product page. You can add documents manually.");
      setHasDiscovered(true);
    } finally {
      setDiscovering(false);
    }
  };

  // Build status map: which document types were found
  const foundTypes = new Set();
  if (productUrl) foundTypes.add("Product Page");
  if (pdfUrl) foundTypes.add("PDF");
  for (const doc of additionalDocs) {
    if (doc.url) foundTypes.add(doc.document_type);
  }

  const updateAdditionalDoc = (index, field, value) => {
    const next = [...additionalDocs];
    next[index] = { ...next[index], [field]: value };
    onAdditionalDocsChange(next);
  };

  const addDoc = () => {
    onAdditionalDocsChange([...additionalDocs, { document_type: "PDF", url: "", title: "" }]);
  };

  const removeDoc = (index) => {
    onAdditionalDocsChange(additionalDocs.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, margin: 0 }}>Documents</h2>
        <p style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
          Sound Proof searched the product page for official documents. Add any that weren't found automatically.
        </p>
      </div>

      {/* Auto-discovery status */}
      <div className="rounded-lg p-4 mb-4" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card, maxWidth: 800 }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium" style={{ color: BRAND.text }}>Document Discovery</div>
          <button
            onClick={handleDiscover}
            disabled={discovering || !productUrl}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium"
            style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.bg, opacity: discovering || !productUrl ? 0.5 : 1 }}
          >
            {discovering ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            {discovering ? "Searching…" : "Re-search"}
          </button>
        </div>

        {discovering ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: BRAND.green }} />
            <span className="text-sm" style={{ color: BRAND.subtext }}>Searching product page for documents…</span>
          </div>
        ) : (
          <>
            {/* Found / not-found grid */}
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
              {AUTO_DISCOVER_TYPES.map(({ type, label, icon: Icon }) => {
                const found = foundTypes.has(type);
                return (
                  <div key={type} className="flex items-center gap-2 p-2.5 rounded-md" style={{ background: found ? BRAND.green + "08" : BRAND.bg, border: `1px solid ${found ? BRAND.green + "20" : BRAND.border}` }}>
                    {found ? (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: BRAND.green }} />
                    ) : (
                      <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: BRAND.subtext, opacity: 0.4 }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate" style={{ color: found ? BRAND.green : BRAND.subtext }}>{label}</div>
                      <div className="text-[10px]" style={{ color: found ? BRAND.green : BRAND.subtext, opacity: found ? 0.7 : 0.5 }}>
                        {found ? "Found" : "Not found"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {discoverError && (
              <div className="mt-3 flex items-start gap-2 p-2.5 rounded-md" style={{ background: BRAND.amber + "10" }}>
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: BRAND.amber }} />
                <div className="text-xs" style={{ color: BRAND.amber }}>{discoverError}</div>
              </div>
            )}

            {discoveredDocs.length > 0 && (
              <div className="mt-3 text-xs" style={{ color: BRAND.subtext }}>
                Found {discoveredDocs.length} document link{discoveredDocs.length !== 1 ? "s" : ""} on the product page.
              </div>
            )}
          </>
        )}
      </div>

      {/* Document URLs */}
      <div className="space-y-3" style={{ maxWidth: 800 }}>
        {/* Product Page — from Step 2 (read-only) */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: BRAND.green }}>Product Page</div>
          <div className="flex items-center gap-3 p-3 rounded-lg" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
            <Globe className="w-5 h-5 flex-shrink-0" style={{ color: BRAND.subtext }} />
            <input
              type="url"
              value={productUrl}
              readOnly
              className="flex-1 px-3 py-1.5 rounded text-sm outline-none"
              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.bg }}
            />
            {productUrl && (
              <a href={productUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-gray-100">
                <ExternalLink className="w-4 h-4" style={{ color: BRAND.green }} />
              </a>
            )}
          </div>
          <div className="text-xs mt-1" style={{ color: BRAND.green }}>✓ Linked from Step 2</div>
        </div>

        {/* Specification PDF */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: BRAND.green }}>Specification PDF</div>
          <div className="flex items-center gap-3 p-3 rounded-lg" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
            <FileText className="w-5 h-5 flex-shrink-0" style={{ color: BRAND.subtext }} />
            <input
              type="url"
              value={pdfUrl}
              onChange={(e) => onPdfUrlChange(e.target.value)}
              placeholder="https://manufacturer.com/specs/product.pdf"
              className="flex-1 px-3 py-1.5 rounded text-sm outline-none"
              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.bg }}
            />
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-gray-100">
                <ExternalLink className="w-4 h-4" style={{ color: BRAND.green }} />
              </a>
            )}
          </div>
          <div className="text-xs mt-1" style={{ color: pdfUrl ? BRAND.green : BRAND.subtext }}>
            {pdfUrl ? "✓ PDF URL provided" : "Optional — add if available"}
          </div>
        </div>

        {/* Additional Documents */}
        {additionalDocs.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: BRAND.green }}>Additional Documents</div>
            <div className="space-y-2">
              {additionalDocs.map((doc, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
                  <FileCheck className="w-5 h-5 flex-shrink-0" style={{ color: BRAND.subtext }} />
                  <select
                    value={doc.document_type || "PDF"}
                    onChange={(e) => updateAdditionalDoc(i, "document_type", e.target.value)}
                    className="px-2 py-1.5 rounded text-sm outline-none"
                    style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.bg, width: 140 }}
                  >
                    {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="url"
                    value={doc.url}
                    onChange={(e) => updateAdditionalDoc(i, "url", e.target.value)}
                    placeholder="https://…"
                    className="flex-1 px-3 py-1.5 rounded text-sm outline-none"
                    style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.bg }}
                  />
                  {doc.url && (
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-gray-100">
                      <ExternalLink className="w-4 h-4" style={{ color: BRAND.green }} />
                    </a>
                  )}
                  <button onClick={() => removeDoc(i)} className="p-1.5 rounded hover:bg-red-50">
                    <Trash2 className="w-4 h-4" style={{ color: "#B23A3A", opacity: 0.6 }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={addDoc}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium"
          style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.card }}
        >
          <Plus className="w-4 h-4" /> Add Document
        </button>
      </div>
    </div>
  );
}