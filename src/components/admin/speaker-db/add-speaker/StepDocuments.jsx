// StepDocuments.jsx — Step 3: Display document URLs and status

import React, { useState } from "react";
import { FileText, ExternalLink, Plus, Trash2, Globe, FileCheck } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  bg: "#F8F8F7",
};

const DOC_TYPES = ["Product Page", "PDF", "Manual", "CAD", "Spinorama", "Engineering Document", "Support Document"];

function DocRow({ icon, label, url, placeholder, onChange, onRemove, showTypeSelector, docType, onTypeChange }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: showTypeSelector ? "140px 1fr" : "1fr" }}>
        {showTypeSelector && (
          <select
            value={docType || "PDF"}
            onChange={(e) => onTypeChange?.(e.target.value)}
            className="px-2 py-1.5 rounded text-sm outline-none"
            style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.bg }}
          >
            {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder}
            className="flex-1 px-3 py-1.5 rounded text-sm outline-none"
            style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.bg }}
          />
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-gray-100">
              <ExternalLink className="w-4 h-4" style={{ color: BRAND.green }} />
            </a>
          )}
          {onRemove && (
            <button onClick={onRemove} className="p-1.5 rounded hover:bg-red-50">
              <Trash2 className="w-4 h-4" style={{ color: "#B23A3A", opacity: 0.6 }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StepDocuments({ productUrl, pdfUrl, onPdfUrlChange, additionalDocs, onAdditionalDocsChange }) {
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
          Reference the official documents for this speaker. Nothing is extracted yet — documents are linked for the review stage.
        </p>
      </div>

      <div className="space-y-3" style={{ maxWidth: 800 }}>
        {/* Product Page — from Step 2 (read-only) */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: BRAND.green }}>Product Page</div>
          <DocRow
            icon={<Globe className="w-5 h-5" style={{ color: BRAND.subtext }} />}
            url={productUrl}
            placeholder="Product page URL (from Step 2)"
          />
          <div className="text-xs mt-1" style={{ color: BRAND.subtext }}>✓ Linked from Step 2</div>
        </div>

        {/* Specification PDF */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: BRAND.green }}>Specification PDF</div>
          <DocRow
            icon={<FileText className="w-5 h-5" style={{ color: BRAND.subtext }} />}
            url={pdfUrl}
            placeholder="https://manufacturer.com/specs/product.pdf"
            onChange={onPdfUrlChange}
          />
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
                <DocRow
                  key={i}
                  icon={<FileCheck className="w-5 h-5" style={{ color: BRAND.subtext }} />}
                  url={doc.url}
                  placeholder="https://…"
                  onChange={(v) => updateAdditionalDoc(i, "url", v)}
                  onRemove={() => removeDoc(i)}
                  showTypeSelector
                  docType={doc.document_type}
                  onTypeChange={(v) => updateAdditionalDoc(i, "document_type", v)}
                />
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