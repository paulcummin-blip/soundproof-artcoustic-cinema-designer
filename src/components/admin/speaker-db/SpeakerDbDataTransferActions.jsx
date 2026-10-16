// SpeakerDbDataTransferActions.jsx
// ---------------------------------------------------------------------------
// Header action area for the canonical Speaker Database export / import.
//
//   Export speaker data → downloads the versioned canonical .xlsx workbook
//                         directly through the existing export workflow. No
//                         dialog: the only message is an inline failure notice
//                         if the workbook cannot be built.
//   Import speaker data → hands over to the canonical import workflow
//                         (upload → validate → preview → apply) via onImport.
//
// Admin-only surface: it is rendered only by the admin Speaker Database page,
// which is gated to admin both on the route and inside the page. It reuses the
// existing export and import engines unchanged — no schema, data, calculation,
// RP22 or approval / publish behaviour is touched here.
// ---------------------------------------------------------------------------

import React, { useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { CANONICAL_SCHEMA_VERSION } from "./canonical/canonicalSchema.js";
import { downloadCanonicalWorkbook } from "./canonical/canonicalExportWorkbook.js";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  danger: "#B23A3A",
};

export default function SpeakerDbDataTransferActions({ onImport }) {
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    setFailed(false);
    setStatus("");
    try {
      const result = await downloadCanonicalWorkbook();
      setStatus(
        `${result.fileName} · ${result.manufacturers} manufacturers · ${result.products} products · ${result.specifications} specifications`,
      );
    } catch (error) {
      setFailed(true);
      setStatus(error?.message || "Could not build the workbook. Nothing was downloaded.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            border: "none",
            borderRadius: 10,
            padding: "9px 14px",
            background: BRAND.green,
            color: "#FFFFFF",
            fontSize: 13,
            fontWeight: 600,
            cursor: exporting ? "wait" : "pointer",
          }}
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Export speaker data
        </button>

        <button
          type="button"
          onClick={onImport}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            border: `1px solid ${BRAND.border}`,
            borderRadius: 10,
            padding: "9px 14px",
            background: BRAND.card,
            color: BRAND.text,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Upload size={14} />
          Import speaker data
        </button>
      </div>

      <div
        style={{
          maxWidth: 460,
          textAlign: "right",
          fontSize: 12,
          lineHeight: 1.5,
          overflowWrap: "anywhere",
          color: failed ? BRAND.danger : BRAND.hint,
        }}
      >
        {status || `Canonical workbook (${CANONICAL_SCHEMA_VERSION}) · .xlsx`}
      </div>
    </div>
  );
}