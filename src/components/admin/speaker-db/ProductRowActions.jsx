// ProductRowActions.jsx
// ---------------------------------------------------------------------------
// Per-row actions on the Products list: review the record, publish an approved
// specification to RP22, and archive or remove the product.
//
// Removal never happens silently and never guesses: the product's own
// specifications decide whether the choice offered is Archive (approved or
// published data exists) or Delete (a draft with no publish history).
// ---------------------------------------------------------------------------

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, Loader2, Send, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { publishSpecificationToRp22 } from "./model-first/rp22ComparisonPublish.js";
import { archiveProduct, assessRemoval, deleteProduct, loadProductSpecs } from "./speakerProductLifecycle.js";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  green: "#213428",
  danger: "#B23A3A",
  card: "#FFFFFF",
};

const BTN = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "5px 8px",
  borderRadius: 7,
  border: `1px solid ${BRAND.border}`,
  background: BRAND.card,
  color: BRAND.text,
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
  cursor: "pointer",
};

export default function ProductRowActions({ row, onChanged }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [message, setMessage] = useState("");

  const product = row.product || row;
  const spec = row.spec || null;
  const approvedSpec = spec && spec.approval_status === "Approved" ? spec : null;
  const alreadyPublished = !!spec?.rp22_published_competitor_id;

  const stop = (event) => event.stopPropagation();

  const handleReview = (event) => {
    stop(event);
    navigate(`/admin/speaker-database/product/${product.id}`);
  };

  const handlePublish = async (event) => {
    stop(event);
    setBusy(true);
    setMessage("");
    try {
      await publishSpecificationToRp22({
        product,
        specification: approvedSpec,
        manufacturerName: product.manufacturer_name,
        actorName: user?.full_name || "Admin",
      });
      setMessage(alreadyPublished ? "Comparison row updated" : "Published to RP22");
      onChanged?.();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const openRemoval = async (event) => {
    stop(event);
    setBusy(true);
    setMessage("");
    try {
      const specs = await loadProductSpecs(product.id);
      setConfirmation(assessRemoval(product, specs));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmRemoval = async () => {
    setBusy(true);
    try {
      if (confirmation.mode === "archive") {
        await archiveProduct({ product, specs: confirmation.specs, actorName: user?.full_name || "Admin" });
        setMessage("Product archived");
      } else {
        await deleteProduct({ product, specs: confirmation.specs, actorName: user?.full_name || "Admin" });
        setMessage("Draft product deleted");
      }
      setConfirmation(null);
      onChanged?.();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={stop} style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "nowrap" }}>
      <button type="button" style={BTN} onClick={handleReview} title="Open this product to review or update its data">
        Review / Update
      </button>

      {approvedSpec && (
        <button type="button" style={BTN} onClick={handlePublish} disabled={busy} title="Publish this approved specification to the RP22 comparison">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          {alreadyPublished ? "Re-publish" : "Publish"}
        </button>
      )}

      <button
        type="button"
        style={{ ...BTN, color: BRAND.danger, borderColor: BRAND.danger + "55" }}
        onClick={openRemoval}
        disabled={busy}
        title={alreadyPublished || approvedSpec ? "Archive this product" : "Delete this draft product"}
      >
        {alreadyPublished || approvedSpec ? <Archive size={12} /> : <Trash2 size={12} />}
      </button>

      {message && (
        <span style={{ fontSize: 11, color: BRAND.subtext }} title={message}>
          {message.length > 22 ? `${message.slice(0, 22)}…` : message}
        </span>
      )}

      {confirmation && (
        <div
          onClick={stop}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 600,
            background: "rgba(27,26,26,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div style={{ width: "100%", maxWidth: 460, background: BRAND.card, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>{confirmation.headline}</div>
            <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 8, lineHeight: 1.5 }}>{confirmation.detail}</div>
            <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 10 }}>
              {product.manufacturer_name} · {product.model}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button type="button" style={{ ...BTN, padding: "8px 12px", fontSize: 12 }} onClick={() => setConfirmation(null)} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoval}
                disabled={busy}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 7,
                  border: "none",
                  background: confirmation.mode === "archive" ? BRAND.green : BRAND.danger,
                  color: "#FFFFFF",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : confirmation.mode === "archive" ? <Archive size={13} /> : <Trash2 size={13} />}
                {confirmation.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}