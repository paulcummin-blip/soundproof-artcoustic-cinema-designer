// SecondaryEvidenceButton.jsx
// ---------------------------------------------------------------------------
// The one action an admin uses to attach secondary evidence to a competitor
// model, wherever that model is being reviewed: a candidate discovery row, the
// product's Specifications tab, or the model-first specification review step.
//
// It owns the read → inspect → confirm → record sequence and nothing else, so the
// same behaviour is available from every review surface with a few lines of wiring.
// ---------------------------------------------------------------------------

import React, { useState } from "react";
import { FileSearch } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { fetchSecondaryEvidence, loadSpecificationForProduct, persistSecondaryEvidence } from "./secondaryEvidenceClient.js";
import SecondaryEvidenceDialog from "./SecondaryEvidenceDialog.jsx";

const BRAND = { text: "#1B1A1A", subtext: "#3E4349", border: "#DCDBD6", green: "#213428" };

export default function SecondaryEvidenceButton({
  manufacturerName,
  model,
  manufacturerWebsite = "",
  specification = null,
  productId = null,
  ensureProduct = null,
  onAccepted = null,
  label = "Add secondary evidence URL",
  initialUrl = "",
  compact = false,
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const actorName = user?.full_name || user?.email || "";

  const handleConfirm = async (evidence, fields) => {
    let target = specification;
    let targetProductId = productId;

    // A model that is not in the database yet becomes a Draft first — exactly as
    // the discovery import creates it. Nothing is approved by doing so.
    if (!target && ensureProduct) {
      const resolved = await ensureProduct();
      target = resolved?.specification || null;
      targetProductId = resolved?.productId || targetProductId;
    }
    if (!target && targetProductId) {
      target = await loadSpecificationForProduct(targetProductId);
    }

    const summary = await persistSecondaryEvidence({
      productId: targetProductId,
      specification: target,
      evidence,
      fields,
      actorName,
    });
    onAccepted?.(summary);
    return summary;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
        style={{ border: `1px solid ${BRAND.border}`, background: compact ? "transparent" : "#FFF", color: BRAND.text, whiteSpace: "nowrap" }}
        title="Read an admin-supplied copy of the manufacturer's document and accept it as secondary evidence"
      >
        <FileSearch className="w-3 h-3" /> {label}
      </button>

      {open && (
        <SecondaryEvidenceDialog
          manufacturerName={manufacturerName}
          model={model}
          manufacturerWebsite={manufacturerWebsite}
          initialUrl={initialUrl}
          onFetch={(url) => fetchSecondaryEvidence({ url, manufacturerName, model, manufacturerWebsite })}
          onConfirm={handleConfirm}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}