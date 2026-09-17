// StepExtract.jsx — Step 4: Create the Draft scaffolding (extraction engine)

import React, { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, FileSearch } from "lucide-react";
import { createDraftScaffolding } from "./addSpeakerExtraction.js";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  bg: "#F8F8F7",
  danger: "#B23A3A",
};

export default function StepExtract({ manufacturer, productUrl, pdfUrl, additionalDocs, onExtracted, productId, specId }) {
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(!!productId);

  const handleExtract = async () => {
    setExtracting(true);
    setError("");
    try {
      const result = await createDraftScaffolding({
        manufacturer,
        productUrl,
        pdfUrl,
        additionalDocs,
      });
      setDone(true);
      onExtracted(result);
    } catch (err) {
      setError(err.message || "Extraction failed. Please try again.");
    } finally {
      setExtracting(false);
    }
  };

  if (done && productId) {
    return (
      <div>
        <div className="mb-4">
          <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, margin: 0 }}>Extraction Complete</h2>
          <p style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            A Draft product and specification have been created. No specification values were extracted — all fields are blank and ready for manual review.
          </p>
        </div>

        <div className="rounded-lg p-6" style={{ border: `1px solid ${BRAND.green}30`, background: BRAND.green + "08", maxWidth: 600 }}>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: BRAND.green }} />
            <div className="flex-1">
              <div className="text-sm font-medium mb-2" style={{ color: BRAND.green }}>Draft scaffolding created successfully</div>
              <div className="space-y-1 text-xs" style={{ color: BRAND.subtext }}>
                <div>✓ SpeakerProduct record created (import_status: Manual)</div>
                <div>✓ SpeakerSpecification created (approval_status: Draft)</div>
                <div>✓ SpeakerDocument records linked</div>
                <div>✓ SpeakerSource records linked</div>
                <div>✓ Change History: "Created" entry logged</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm" style={{ color: BRAND.subtext, maxWidth: 600 }}>
          Click <strong style={{ color: BRAND.text }}>Next</strong> to proceed to the Review screen, where you will populate the specification fields manually.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, margin: 0 }}>Extract</h2>
        <p style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
          This step creates an empty Draft from the available data. It is <strong>not</strong> AI extraction — no specification values are guessed or invented.
        </p>
      </div>

      <div className="rounded-lg p-6" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card, maxWidth: 600 }}>
        <div className="flex items-start gap-3 mb-4">
          <FileSearch className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: BRAND.subtext }} />
          <div className="flex-1">
            <div className="text-sm font-medium mb-2" style={{ color: BRAND.text }}>What will be created:</div>
            <ul className="space-y-1 text-xs" style={{ color: BRAND.subtext }}>
              <li>• A SpeakerProduct linked to <strong>{manufacturer?.name}</strong></li>
              <li>• A Draft SpeakerSpecification (all fields blank)</li>
              <li>• SpeakerDocument records for the product page and PDF</li>
              <li>• SpeakerSource records for traceability</li>
              <li>• A Change History "Created" entry</li>
            </ul>
          </div>
        </div>

        <div className="p-3 rounded-md mb-4" style={{ background: BRAND.bg, border: `1px solid ${BRAND.border}` }}>
          <div className="text-xs font-medium mb-1" style={{ color: BRAND.subtext }}>Data Rules</div>
          <ul className="space-y-0.5 text-xs" style={{ color: BRAND.subtext }}>
            <li>• Missing fields remain blank — never invented</li>
            <li>• Confidence defaults to D (Engineering Estimate)</li>
            <li>• Evidence Quality defaults to Unknown</li>
            <li>• Blank is preferable to incorrect</li>
          </ul>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-md" style={{ background: BRAND.danger + "10" }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: BRAND.danger }} />
            <div className="text-sm" style={{ color: BRAND.danger }}>{error}</div>
          </div>
        )}

        <button
          onClick={handleExtract}
          disabled={extracting}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
          style={{ background: BRAND.green, color: "#fff", opacity: extracting ? 0.5 : 1 }}
        >
          {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSearch className="w-4 h-4" />}
          {extracting ? "Creating Draft…" : "Create Draft"}
        </button>
      </div>
    </div>
  );
}