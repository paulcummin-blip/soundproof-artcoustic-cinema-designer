// StepApprove.jsx — Step 6: Approval screen
// Shows completeness, data quality, comparison with existing spec, and
// a phased approval workflow: Save Draft → Submit for Review → Approve.
//
// Approve is only visible when the spec is in "Awaiting Review" status.
// This mirrors a real engineering review workflow.

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, AlertTriangle, ShieldCheck, ArrowRight, Save, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { validateDraftSpec } from "./addSpeakerValidation.js";
import { approveSpecification, submitForReview, runValidationAndPersist, saveDraft } from "./addSpeakerPersistence.js";
import { calculateSpecCompleteness, SPEC_COMPLETENESS_FIELDS } from "../speakerDbQualityScore.js";
import SpecComparison from "./SpecComparison.jsx";

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

export default function StepApprove({ productId, specId, specData, reviewerName, onReviewerNameChange, onSpecDataChange }) {
  const navigate = useNavigate();
  const [approving, setApproving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [done, setDone] = useState(false);
  const [doneAction, setDoneAction] = useState("");
  const [error, setError] = useState("");
  const [existingSpec, setExistingSpec] = useState(null);

  // Load any existing approved spec for comparison
  useEffect(() => {
    if (!productId) return;
    (async () => {
      try {
        const specs = await base44.entities.SpeakerSpecification.filter({ product_id: productId });
        const approved = (specs || []).find((s) => s.approval_status === "Approved" && s.id !== specId);
        if (approved) setExistingSpec(approved);
      } catch {
        // Non-fatal
      }
    })();
  }, [productId, specId]);

  const validation = validateDraftSpec(specData);
  const completeness = calculateSpecCompleteness(specData);
  const qualityScore = Math.max(0, 100 - validation.issues.reduce((sum, i) => {
    const weights = { Missing: 3, Conflict: 2, Estimated: 1.5, "Needs Review": 1, "Out of Date": 0.5 };
    return sum + (weights[i.status] || 0.5);
  }, 0));

  const isAwaitingReview = specData?.approval_status === "Awaiting Review";
  const canAct = specData && specId && reviewerName;

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    setError("");
    try {
      await saveDraft({ productId, specId, reviewerName });
      onSpecDataChange?.({ ...specData, approval_status: "Draft" });
      setDoneAction("Saved as Draft");
      setDone(true);
    } catch (err) {
      setError(err.message || "Save failed.");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmitForReview = async () => {
    setSubmitting(true);
    setError("");
    try {
      await runValidationAndPersist(productId, specData);
      await submitForReview({ productId, specId, reviewerName });
      onSpecDataChange?.({ ...specData, approval_status: "Awaiting Review" });
      setDoneAction("Submitted for Review");
      setDone(true);
    } catch (err) {
      setError(err.message || "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    setError("");
    try {
      await runValidationAndPersist(productId, specData);
      await approveSpecification({ productId, specId, reviewerName });
      setDoneAction("Approved");
      setDone(true);
    } catch (err) {
      setError(err.message || "Approval failed.");
    } finally {
      setApproving(false);
    }
  };

  if (done) {
    return (
      <div>
        <div className="mb-4">
          <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, margin: 0 }}>{doneAction}</h2>
          <p style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            {doneAction === "Approved"
              ? "This specification is now the Current Specification. It will appear in the Speaker Database Products list."
              : doneAction === "Submitted for Review"
                ? "The specification has been submitted for review. A reviewer can now approve it."
                : "The specification has been saved as a Draft. You can return to continue editing later."}
          </p>
        </div>

        <div className="rounded-lg p-6" style={{ border: `1px solid ${BRAND.green}30`, background: BRAND.green + "08", maxWidth: 500 }}>
          <div className="flex items-start gap-3 mb-4">
            <CheckCircle2 className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: BRAND.green }} />
            <div>
              <div className="text-base font-medium mb-1" style={{ color: BRAND.green }}>Workflow complete</div>
              <div className="text-sm" style={{ color: BRAND.subtext }}>
                {doneAction === "Approved"
                  ? "The specification has been approved and is now the Current Specification. Any previous Approved spec on this product has been Superseded (not deleted)."
                  : doneAction === "Submitted for Review"
                    ? "The specification is now Awaiting Review. A reviewer can approve it from this screen."
                    : "The Draft has been saved. Return to the Review step to continue editing."}
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate(`/admin/speaker-database/product/${productId}`)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
            style={{ background: BRAND.green, color: "#fff" }}
          >
            View Product <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const helpText = isAwaitingReview
    ? "Approve sets the status to Approved and makes it the Current Specification. Any previous Approved spec is Superseded."
    : "Submit for Review sets the status to Awaiting Review. Only then can a reviewer approve it.";

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, margin: 0 }}>Approve Specification</h2>
        <p style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
          Review the summary below. Save as Draft to continue later, or Submit for Review to send to a reviewer.
        </p>
      </div>

      {/* Spec Comparison — show if existing approved spec exists */}
      {existingSpec && (
        <div className="mb-4">
          <SpecComparison existingSpec={existingSpec} newSpec={specData} />
        </div>
      )}

      <div className="grid gap-4 mb-4" style={{ maxWidth: 700, gridTemplateColumns: "1fr 1fr" }}>
        <div className="rounded-lg p-5" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: BRAND.green }}>Specification Completeness</div>
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 32, fontWeight: 700, color: completeness >= 80 ? BRAND.green : completeness >= 50 ? BRAND.amber : BRAND.danger }}>{completeness}%</span>
            <span className="text-xs" style={{ color: BRAND.subtext }}>
              {SPEC_COMPLETENESS_FIELDS.filter((f) => specData?.[f] != null && specData[f] !== "").length} / {SPEC_COMPLETENESS_FIELDS.length} fields
            </span>
          </div>
        </div>
        <div className="rounded-lg p-5" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: BRAND.green }}>Data Quality Score</div>
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 32, fontWeight: 700, color: qualityScore >= 80 ? BRAND.green : qualityScore >= 50 ? BRAND.amber : BRAND.danger }}>{qualityScore}</span>
            <span className="text-xs" style={{ color: BRAND.subtext }}>/ 100</span>
          </div>
        </div>
      </div>

      {/* Validation Summary */}
      <div className="mt-4 rounded-lg p-5" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card, maxWidth: 700 }}>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-4 h-4" style={{ color: BRAND.green }} />
          <div className="text-sm font-semibold" style={{ color: BRAND.text }}>Validation Summary</div>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div className="text-center p-3 rounded-md" style={{ background: validation.summary.missing ? BRAND.danger + "10" : BRAND.bg }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: validation.summary.missing ? BRAND.danger : BRAND.subtext }}>{validation.summary.missing}</div>
            <div className="text-xs" style={{ color: BRAND.subtext }}>Missing</div>
          </div>
          <div className="text-center p-3 rounded-md" style={{ background: validation.summary.outOfRange ? BRAND.amber + "10" : BRAND.bg }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: validation.summary.outOfRange ? BRAND.amber : BRAND.subtext }}>{validation.summary.outOfRange}</div>
            <div className="text-xs" style={{ color: BRAND.subtext }}>Out of Range</div>
          </div>
          <div className="text-center p-3 rounded-md" style={{ background: validation.summary.warnings ? BRAND.amber + "10" : BRAND.bg }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: validation.summary.warnings ? BRAND.amber : BRAND.subtext }}>{validation.summary.warnings}</div>
            <div className="text-xs" style={{ color: BRAND.subtext }}>Warnings</div>
          </div>
          <div className="text-center p-3 rounded-md" style={{ background: BRAND.bg }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: BRAND.subtext }}>{validation.summary.conflicts}</div>
            <div className="text-xs" style={{ color: BRAND.subtext }}>Conflicts</div>
          </div>
        </div>
        {validation.summary.missing > 0 && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-md" style={{ background: BRAND.danger + "08" }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: BRAND.danger }} />
            <div className="text-xs" style={{ color: BRAND.danger }}>
              {validation.summary.missing} required field(s) are still missing. You can still approve — the warnings will be recorded for future review.
            </div>
          </div>
        )}
      </div>

      {/* Reviewer name */}
      <div className="mt-4 rounded-lg p-5" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card, maxWidth: 700 }}>
        <label className="text-xs font-medium mb-2 block" style={{ color: BRAND.subtext }}>Reviewer / Approver Name</label>
        <input
          type="text"
          value={reviewerName || ""}
          onChange={(e) => onReviewerNameChange(e.target.value)}
          placeholder="e.g. Paul"
          className="w-full px-3 py-2 rounded-md text-sm outline-none"
          style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.bg }}
        />
        <div className="text-xs mt-1" style={{ color: BRAND.subtext }}>This name will be recorded as both reviewer and approver.</div>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-md" style={{ background: BRAND.danger + "10", maxWidth: 700 }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: BRAND.danger }} />
          <div className="text-sm" style={{ color: BRAND.danger }}>{error}</div>
        </div>
      )}

      {/* Actions — phased workflow */}
      <div className="mt-4 flex items-center gap-3" style={{ maxWidth: 700 }}>
        {/* Save Draft — always available */}
        <button
          onClick={handleSaveDraft}
          disabled={!canAct || savingDraft}
          className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium"
          style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.card, opacity: !canAct || savingDraft ? 0.5 : 1 }}
        >
          {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {savingDraft ? "Saving…" : "Save Draft"}
        </button>

        {/* Submit for Review — available when in Draft */}
        {!isAwaitingReview && (
          <button
            onClick={handleSubmitForReview}
            disabled={!canAct || submitting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium"
            style={{ background: BRAND.green, color: "#fff", opacity: !canAct || submitting ? 0.5 : 1 }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? "Submitting…" : "Submit for Review"}
          </button>
        )}

        {/* Approve — only visible when Awaiting Review */}
        {isAwaitingReview && (
          <button
            onClick={handleApprove}
            disabled={!canAct || approving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium"
            style={{ background: BRAND.green, color: "#fff", opacity: !canAct || approving ? 0.5 : 1 }}
          >
            {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {approving ? "Approving…" : "Approve Specification"}
          </button>
        )}
      </div>

      <div className="mt-3 text-xs" style={{ color: BRAND.subtext, maxWidth: 700 }}>
        {helpText}
      </div>
    </div>
  );
}