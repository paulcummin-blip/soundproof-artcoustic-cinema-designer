// StepExtract.jsx — Step 4: Raw Extraction
// ---------------------------------------------------------------------------
// Creates the Draft scaffolding (product + spec + documents), then uses AI
// to read the PDF and product page and extract raw specification facts.
//
// The raw extraction is NOT a database record. It feeds into the Review
// step, where a human promotes values into the SpeakerSpecification.
//
// AI never writes directly to the database. The raw extraction is stored
// in wizard state only — it is never persisted until Review promotes it.
// ---------------------------------------------------------------------------

import React, { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, FileSearch, FileText, Globe } from "lucide-react";
import { createDraftScaffolding } from "./addSpeakerExtraction.js";
import { runRawExtraction } from "./rawExtraction.js";
import { CONFIDENCE_LABELS } from "./specFieldDefinitions.js";

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

export default function StepExtract({ manufacturer, productUrl, pdfUrl, additionalDocs, onExtracted, productId, specId, targetModel }) {
  const [phase, setPhase] = useState("idle"); // idle | scaffolding | extracting | done | error
  const [error, setError] = useState("");
  const [rawExtraction, setRawExtraction] = useState(null);
  const [progressMsg, setProgressMsg] = useState("");

  const handleExtract = async () => {
    setPhase("scaffolding");
    setError("");
    setProgressMsg("Creating Draft product and specification…");
    try {
      // Step 1: Create the Draft scaffolding
      const scaffoldingResult = await createDraftScaffolding({
        manufacturer,
        productUrl,
        pdfUrl,
        additionalDocs,
      });

      // Step 2: Run AI raw extraction
      setPhase("extracting");
      setProgressMsg("Reading documents and extracting specifications…");
      try {
        const extraction = await runRawExtraction({
          manufacturerName: manufacturer?.name,
          productUrl,
          pdfUrl,
          targetModel,
        });
        setRawExtraction(extraction);
        setProgressMsg("");
        onExtracted({ ...scaffoldingResult, rawExtraction: extraction });
        setPhase("done");
      } catch (extractErr) {
        // Scaffolding succeeded but extraction failed — still proceed with empty extraction
        console.warn("[RawExtraction] AI extraction failed:", extractErr);
        setRawExtraction({ fields: [], model_name: "", series: "", extracted_at: new Date().toISOString(), documents_read: [], error: extractErr.message });
        onExtracted({ ...scaffoldingResult, rawExtraction: { fields: [], error: extractErr.message } });
        setPhase("done");
      }
    } catch (err) {
      setError(err.message || "Failed to create Draft. Please try again.");
      setPhase("error");
    }
  };

  // ── Done state: show raw extraction results ──────────────────────────
  if (phase === "done" && productId) {
    const extractedFields = (rawExtraction?.fields || []).filter((f) => f.value && f.confidence !== "D");
    const notFoundFields = (rawExtraction?.fields || []).filter((f) => !f.value || f.confidence === "D");

    return (
      <div>
        <div className="mb-4">
          <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, margin: 0 }}>Raw Extraction Complete</h2>
          <p style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            {rawExtraction?.error
              ? "Draft created, but AI extraction encountered an issue. You can still proceed to Review and enter values manually."
              : "AI has read the documents and extracted raw specification facts. These are NOT in the database yet — Review promotes them into the specification."}
          </p>
        </div>

        {!rawExtraction?.error && (
          <div className="rounded-lg p-4 mb-4" style={{ border: `1px solid ${BRAND.green}30`, background: BRAND.green + "08", maxWidth: 700 }}>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: BRAND.green }} />
              <div className="flex-1">
                <div className="text-sm font-medium mb-2" style={{ color: BRAND.green }}>
                  {extractedFields.length} fields extracted from {rawExtraction.documents_read?.join(" + ") || "documents"}
                </div>
                {rawExtraction.model_name && (
                  <div className="text-xs mb-1" style={{ color: BRAND.subtext }}>
                    Model: <strong>{rawExtraction.model_name}</strong>
                    {rawExtraction.series && <span> · Series: {rawExtraction.series}</span>}
                  </div>
                )}
                <div className="text-xs" style={{ color: BRAND.subtext }}>
                  {notFoundFields.length} field(s) not found — will remain blank for manual entry in Review.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Raw extraction table */}
        {!rawExtraction?.error && extractedFields.length > 0 && (
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card, maxWidth: 700 }}>
            <div className="px-4 py-2.5" style={{ background: BRAND.bg, borderBottom: `1px solid ${BRAND.border}` }}>
              <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: BRAND.green, margin: 0 }}>Extracted Facts</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                    <th style={{ textAlign: "left", padding: "6px 12px", fontSize: 10, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase" }}>Field</th>
                    <th style={{ textAlign: "left", padding: "6px 12px", fontSize: 10, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase" }}>Value</th>
                    <th style={{ textAlign: "left", padding: "6px 12px", fontSize: 10, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase" }}>Source</th>
                    <th style={{ textAlign: "left", padding: "6px 12px", fontSize: 10, fontWeight: 600, color: BRAND.subtext, textTransform: "uppercase" }}>Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {extractedFields.map((f, i) => {
                    const confLabel = CONFIDENCE_LABELS[f.confidence] || CONFIDENCE_LABELS.D;
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                        <td style={{ padding: "6px 12px", fontSize: 12, fontWeight: 500, color: BRAND.text }}>{f.field}</td>
                        <td style={{ padding: "6px 12px", fontSize: 12, color: BRAND.text }}>
                          {f.value}{f.unit && <span style={{ color: BRAND.subtext }}> {f.unit}</span>}
                        </td>
                        <td style={{ padding: "6px 12px", fontSize: 11, color: BRAND.subtext }}>{f.source}</td>
                        <td style={{ padding: "6px 12px" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: confLabel.color }}>{f.confidence}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-4 text-sm" style={{ color: BRAND.subtext, maxWidth: 700 }}>
          Click <strong style={{ color: BRAND.text }}>Next</strong> to proceed to Review, where you promote these raw values into the specification.
        </div>
      </div>
    );
  }

  // ── Active state: show progress ──────────────────────────────────────
  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, margin: 0 }}>Raw Extraction</h2>
        <p style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
          Creates a Draft product, then AI reads the documents to extract raw specification facts. Raw values are NOT written to the database — Review promotes them.
        </p>
      </div>

      <div className="rounded-lg p-6" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card, maxWidth: 600 }}>
        {/* Documents to read */}
        <div className="mb-4">
          <div className="text-sm font-medium mb-2" style={{ color: BRAND.text }}>Documents to read:</div>
          <div className="space-y-1.5">
            {pdfUrl && (
              <div className="flex items-center gap-2 text-xs" style={{ color: BRAND.subtext }}>
                <FileText className="w-3.5 h-3.5" style={{ color: BRAND.green }} />
                <span>PDF: {pdfUrl.length > 60 ? pdfUrl.substring(0, 60) + "…" : pdfUrl}</span>
              </div>
            )}
            {productUrl && (
              <div className="flex items-center gap-2 text-xs" style={{ color: BRAND.subtext }}>
                <Globe className="w-3.5 h-3.5" style={{ color: BRAND.green }} />
                <span>Product Page: {productUrl.length > 60 ? productUrl.substring(0, 60) + "…" : productUrl}</span>
              </div>
            )}
          </div>
        </div>

        {/* What happens */}
        <div className="p-3 rounded-md mb-4" style={{ background: BRAND.bg, border: `1px solid ${BRAND.border}` }}>
          <div className="text-xs font-medium mb-1" style={{ color: BRAND.subtext }}>Pipeline</div>
          <ul className="space-y-0.5 text-xs" style={{ color: BRAND.subtext }}>
            <li>1. Create Draft product + specification (empty)</li>
            <li>2. AI reads PDF + product page</li>
            <li>3. Extract raw facts with source &amp; confidence</li>
            <li>4. <strong>Raw values are NOT in the database</strong> — Review promotes them</li>
          </ul>
        </div>

        {/* Progress */}
        {phase !== "idle" && phase !== "error" && (
          <div className="mb-4 flex items-center gap-2 p-3 rounded-md" style={{ background: BRAND.green + "08" }}>
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: BRAND.green }} />
            <div className="text-sm" style={{ color: BRAND.green }}>
              {progressMsg || "Processing…"}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-md" style={{ background: BRAND.danger + "10" }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: BRAND.danger }} />
            <div className="text-sm" style={{ color: BRAND.danger }}>{error}</div>
          </div>
        )}

        <button
          onClick={handleExtract}
          disabled={phase === "scaffolding" || phase === "extracting"}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
          style={{ background: BRAND.green, color: "#fff", opacity: phase === "scaffolding" || phase === "extracting" ? 0.5 : 1 }}
        >
          {phase === "scaffolding" || phase === "extracting"
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <FileSearch className="w-4 h-4" />}
          {phase === "scaffolding" ? "Creating Draft…" : phase === "extracting" ? "Extracting…" : "Run Raw Extraction"}
        </button>
      </div>
    </div>
  );
}