// ProductPreviewPanel.jsx
// Right-side product preview shown during Review and Approve steps.
// Displays: product image, manufacturer, model, status, import status.
// Keeps the reviewer connected to the product context while editing specs.

import React from "react";
import { Image, Building2, Tag, CircleDot, FileCheck } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  bg: "#F8F8F7",
};

const STATUS_COLORS = {
  Current: "#213428",
  Discontinued: "#B23A3A",
  "Coming Soon": "#9A6E00",
  Hidden: "#625143",
  Archived: "#625143",
  Unknown: "#8A7B6A",
};

const IMPORT_STATUS_COLORS = {
  Manual: "#625143",
  Imported: "#9A6E00",
  Verified: "#213428",
  "Needs Review": "#B23A3A",
  Locked: "#213428",
};

export default function ProductPreviewPanel({ product, manufacturer, specData }) {
  if (!product && !manufacturer) return null;

  const statusColor = STATUS_COLORS[product?.status] || BRAND.subtext;
  const importColor = IMPORT_STATUS_COLORS[product?.import_status] || BRAND.subtext;

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card, position: "sticky", top: 16 }}>
      {/* Header */}
      <div className="px-4 py-3" style={{ background: BRAND.bg, borderBottom: `1px solid ${BRAND.border}` }}>
        <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: BRAND.green, margin: 0 }}>Product Preview</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Product image */}
        <div className="rounded-md flex items-center justify-center" style={{ background: BRAND.bg, border: `1px solid ${BRAND.border}`, height: 160 }}>
          {product?.hero_image_url ? (
            <img src={product.hero_image_url} alt={product.full_product_name || product.model || "Product"} style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
          ) : (
            <div className="flex flex-col items-center gap-2" style={{ color: BRAND.subtext }}>
              <Image className="w-8 h-8" style={{ opacity: 0.3 }} />
              <span className="text-xs">No image</span>
            </div>
          )}
        </div>

        {/* Manufacturer */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: BRAND.subtext }}>
            <Building2 className="w-3 h-3" /> Manufacturer
          </div>
          <div className="text-sm font-medium" style={{ color: BRAND.text }}>
            {manufacturer?.name || product?.manufacturer_name || "—"}
          </div>
        </div>

        {/* Model */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: BRAND.subtext }}>
            <Tag className="w-3 h-3" /> Model
          </div>
          <div className="text-sm font-medium" style={{ color: BRAND.text }}>
            {product?.model || product?.full_product_name || "Not yet set"}
          </div>
          {product?.series && (
            <div className="text-xs mt-0.5" style={{ color: BRAND.subtext }}>{product.series}</div>
          )}
        </div>

        {/* Status */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: BRAND.subtext }}>
            <CircleDot className="w-3 h-3" /> Status
          </div>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: statusColor + "15", color: statusColor }}>
            {product?.status || "Unknown"}
          </span>
        </div>

        {/* Import Status */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: BRAND.subtext }}>
            <FileCheck className="w-3 h-3" /> Import Status
          </div>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: importColor + "15", color: importColor }}>
            {product?.import_status || "Manual"}
          </span>
        </div>

        {/* Spec approval status */}
        {specData?.approval_status && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: BRAND.subtext }}>Spec Approval</div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: BRAND.green + "10", color: BRAND.green }}>
              {specData.approval_status}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}