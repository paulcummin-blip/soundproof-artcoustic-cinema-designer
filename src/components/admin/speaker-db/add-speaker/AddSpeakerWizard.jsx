// AddSpeakerWizard.jsx
// ---------------------------------------------------------------------------
// Main 6-step wizard for adding a single speaker to the Speaker Database.
// Internal pipeline: Import. UI label: "Add Speaker".
//
// Steps: Manufacturer → Product URL → Documents → Extract → Review → Approve
// Nothing bypasses the Review stage. No automatic approval.
// ---------------------------------------------------------------------------

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

import StepManufacturer from "./StepManufacturer.jsx";
import StepProductUrl from "./StepProductUrl.jsx";
import StepDiscoverMk from "./StepDiscoverMk.jsx";
import StepDocuments from "./StepDocuments.jsx";
import StepExtract from "./StepExtract.jsx";
import StepReview from "./StepReview.jsx";
import StepApprove from "./StepApprove.jsx";
import ProductPreviewPanel from "./ProductPreviewPanel.jsx";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  bg: "#F8F8F7",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
};

const STEPS = [
  { key: "manufacturer", label: "Manufacturer" },
  { key: "url", label: "Product URL" },
  { key: "documents", label: "Documents" },
  { key: "extract", label: "Raw Extraction" },
  { key: "review", label: "Review" },
  { key: "approve", label: "Approve" },
];

// M&K Sound detection — when selected, Step 2 becomes dynamic product discovery
// instead of manual URL entry. Matches by manufacturer name or website domain.
function isMkManufacturer(manufacturer) {
  if (!manufacturer) return false;
  const name = (manufacturer.name || "").toLowerCase();
  const website = (manufacturer.website || "").toLowerCase();
  return name.includes("m&k") || name.includes("mk sound") || website.includes("mksound");
}

export default function AddSpeakerWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // Wizard state
  const [manufacturers, setManufacturers] = useState([]);
  const [selectedManufacturer, setSelectedManufacturer] = useState(null);
  const [productUrl, setProductUrl] = useState("");
  const [urlValid, setUrlValid] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [targetModel, setTargetModel] = useState("");
  const [useManualUrl, setUseManualUrl] = useState(false);
  const [additionalDocs, setAdditionalDocs] = useState([]);
  const [productId, setProductId] = useState(null);
  const [specId, setSpecId] = useState(null);
  const [specData, setSpecData] = useState(null);
  const [productData, setProductData] = useState(null);
  const [reviewerName, setReviewerName] = useState(user?.full_name || "");
  const [validationResult, setValidationResult] = useState(null);
  const [rawExtraction, setRawExtraction] = useState(null);

  // Load manufacturers
  useEffect(() => {
    (async () => {
      try {
        const mans = await base44.entities.SpeakerManufacturer.list("name", 500);
        setManufacturers(mans || []);
      } catch (err) {
        console.error("[AddSpeakerWizard] Failed to load manufacturers:", err);
      }
    })();
  }, []);

  // After extraction, load the spec and product data
  useEffect(() => {
    if (!productId) return;
    (async () => {
      try {
        const specs = await base44.entities.SpeakerSpecification.filter({ product_id: productId });
        const current = (specs || []).find((s) => s.is_current) || (specs || [])[0];
        if (current) {
          setSpecId(current.id);
          setSpecData(current);
        }
        const product = await base44.entities.SpeakerProduct.get(productId);
        setProductData(product);
      } catch (err) {
        console.error("[AddSpeakerWizard] Failed to load spec:", err);
      }
    })();
  }, [productId]);

  const handleExtracted = (result) => {
    setProductId(result.productId);
    setSpecId(result.specId);
    setSpecData(result.spec);
    if (result.rawExtraction) setRawExtraction(result.rawExtraction);
  };

  const canProceed = () => {
    switch (step) {
      case 0: return !!selectedManufacturer;
      case 1: return urlValid;
      case 2: return true; // Documents are optional (product URL already provided)
      case 3: return !!productId; // Must have extracted
      case 4: return !!specId; // Must have a spec to review
      case 5: return false; // Last step — no "Next"
      default: return false;
    }
  };

  const handleNext = () => {
    if (canProceed() && step < STEPS.length - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <a href="/admin/speaker-database" style={{ fontSize: 13, color: BRAND.subtext, textDecoration: "none" }}>← Back to Speaker Database</a>
          <h1 style={{ margin: "8px 0 0", fontSize: 24, color: BRAND.text }}>Add Speaker</h1>
        </div>
        <button
          onClick={() => navigate("/admin/speaker-database")}
          className="p-2 rounded-md hover:bg-gray-100"
          title="Cancel and close"
        >
          <X className="w-5 h-5" style={{ color: BRAND.subtext }} />
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
        {STEPS.map((s, i) => {
          const isActive = i === step;
          const isComplete = i < step;
          const isAccessible = i <= step || (i === 4 && productId) || (i === 5 && specId);
          return (
            <React.Fragment key={s.key}>
              <button
                onClick={() => isAccessible && setStep(i)}
                disabled={!isAccessible}
                className="flex items-center gap-2 px-3 py-2 rounded-md whitespace-nowrap transition-all"
                style={{
                  background: isActive ? BRAND.green : isComplete ? BRAND.green + "10" : "transparent",
                  color: isActive ? "#fff" : isComplete ? BRAND.green : BRAND.subtext,
                  cursor: isAccessible ? "pointer" : "not-allowed",
                  opacity: isAccessible ? 1 : 0.4,
                }}
              >
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                  style={{
                    background: isActive ? "rgba(255,255,255,0.2)" : isComplete ? BRAND.green : BRAND.border,
                    color: isActive ? "#fff" : isComplete ? "#fff" : BRAND.subtext,
                  }}
                >
                  {isComplete ? "✓" : i + 1}
                </span>
                <span className="text-sm font-medium">{i === 1 && isMkManufacturer(selectedManufacturer) && !useManualUrl ? "Discover Products" : s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div style={{ width: 24, height: 2, background: isComplete ? BRAND.green : BRAND.border, flexShrink: 0 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step content — two-column layout for steps 4-6 with product preview */}
      <div className={step >= 3 && productId ? "flex gap-6" : ""}>
        <div className="flex-1 rounded-lg p-6" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card, minWidth: 0 }}>
          {step === 0 && (
            <StepManufacturer
              manufacturers={manufacturers}
              selected={selectedManufacturer}
              onSelect={setSelectedManufacturer}
            />
          )}
          {step === 1 && isMkManufacturer(selectedManufacturer) && !useManualUrl ? (
            <StepDiscoverMk
              manufacturer={selectedManufacturer}
              productUrl={productUrl}
              onProductUrlChange={setProductUrl}
              onPdfUrlChange={setPdfUrl}
              onTargetModelChange={setTargetModel}
              onUseManualUrl={() => { setUseManualUrl(true); setTargetModel(""); setUrlValid(false); }}
              onValidationResult={({ valid }) => setUrlValid(valid)}
            />
          ) : step === 1 ? (
            <StepProductUrl
              manufacturer={selectedManufacturer}
              productUrl={productUrl}
              onProductUrlChange={setProductUrl}
              onTargetModelChange={setTargetModel}
              onValidationResult={({ valid }) => setUrlValid(valid)}
              showBackToDiscovery={isMkManufacturer(selectedManufacturer)}
              onBackToDiscovery={() => { setUseManualUrl(false); setTargetModel(""); setUrlValid(false); }}
            />
          ) : null}
          {step === 2 && (
            <StepDocuments
              productUrl={productUrl}
              pdfUrl={pdfUrl}
              onPdfUrlChange={setPdfUrl}
              additionalDocs={additionalDocs}
              onAdditionalDocsChange={setAdditionalDocs}
            />
          )}
          {step === 3 && (
            <StepExtract
              manufacturer={selectedManufacturer}
              productUrl={productUrl}
              pdfUrl={pdfUrl}
              additionalDocs={additionalDocs}
              onExtracted={handleExtracted}
              productId={productId}
              specId={specId}
              targetModel={targetModel}
            />
          )}
          {step === 4 && specData && (
            <StepReview
              productId={productId}
              specId={specId}
              specData={specData}
              onSpecDataChange={setSpecData}
              onValidationUpdate={setValidationResult}
              rawExtraction={rawExtraction}
            />
          )}
          {step === 5 && specData && (
            <StepApprove
              productId={productId}
              specId={specId}
              specData={specData}
              reviewerName={reviewerName}
              onReviewerNameChange={setReviewerName}
              onSpecDataChange={setSpecData}
            />
          )}
        </div>
        {step >= 3 && productId && (
          <div style={{ width: 280, flexShrink: 0 }}>
            <ProductPreviewPanel
              product={productData}
              manufacturer={selectedManufacturer}
              specData={specData}
            />
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={handleBack}
          disabled={step === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
          style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.card, opacity: step === 0 ? 0.4 : 1 }}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {step < STEPS.length - 1 && (
          <button
            onClick={handleNext}
            disabled={!canProceed()}
            className="flex items-center gap-2 px-5 py-2 rounded-md text-sm font-medium"
            style={{ background: BRAND.green, color: "#fff", opacity: !canProceed() ? 0.5 : 1 }}
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}