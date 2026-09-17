// StepApprove.jsx — Step 6: Approval screen
// Shows completeness, data quality, warnings, and confidence.
// Only Approved specifications become Current Specification.

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, AlertTriangle, ShieldCheck, ArrowRight } from "lucide-react";
import { validateDraftSpec } from "./addSpeakerValidation.js";
import { approveSpecification, submitForReview, runValidationAndPersist } from "./addSpeakerPersistence.js";
import { calculateSpecCompleteness, SPEC_COMPLETENESS_FIELDS } from "../speakerDbQualityScore.js";

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

export default function StepApprove({ productId, specId, specData, reviewerName, onReviewerNameChange }) {
  const navigate = useNavigate();
  const [approving, setApproving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const validation = validateDraftSpec(specData);
  const completeness = calculateSpecCompleteness(specData);
  const qualityScore = Math.max(0, 100 - validation.issues.reduce((sum, i) => {
    const weights = { Missing: 3, Conflict: 2, Estimated: 1.5, "Needs Review": 1, "Out of Date": 0.5 };
    return sum + (weights[i.status] || 0.5);
  }, 0));

  const canApprove = specData && specId && reviewerName;

  const handleApprove = async () => {
    setApproving(true);
    setError("");
    try {
      // Run final validation and persist
      await runValidationAndPersist(productId, specData);
      // Approve
      await approveSpecification({ productId, specId, reviewerName });
      setDone(true);
    } catch (err) {
      setError(err.message || "Approval failed.");
    } finally {
      setApproving(false);
    }
  };

  const handleSubmitForReview = async () => {
    setSubmitting(true);
    setError("");
    try {
      await runValidationAndPersist(productId, specData);
      await submitForReview({ productId, specId, reviewerName });
      setDone(true);
    } catch (err) {
      setError(err.message || "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div>
        <div className="mb-4">
          <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, margin: 0 }}>Specification Approved</h2>
          <p style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
            This specification is now the Current Specification. It will appear in the Speaker Database Products list.
          </p>
        </div>

        <div className="rounded-lg p-6" style={{ border: `1px solid ${BRAND.green}30`, background: BRAND.green + "08", maxWidth: 500 }}>
          <div className="flex items-start gap-3 mb-4">
            <CheckCircle2 className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: BRAND.green }} />
            <div>
              <div className="text-base font-medium mb-1" style={{ color: BRAND.green }}>Workflow complete</div>
              <div className="text-sm" style={{ color: BRAND.subtext }}>
                The specification has been approved and is now the Current Specification. Any previous Approved spec on this product has been Superseded (not deleted).
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

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontSize: 18, fontWeight: 700, color: BRAND.text, margin: 0 }}>Approve Specification</h2>
        <p style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
          Review the summary below. Only Approved specifications become the Current Specification. Warnings do not block approval — they simply require review.
        </p>
      </div>

      <div className="grid gap-4" style={{ maxWidth: 700, gridTemplateColumns: "1fr 1fr" }}>
        {/* Completeness */}
        <div className="rounded-lg p-5" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: BRAND.green }}>Specification Completeness</div>
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 32, fontWeight: 700, color: completeness >= 80 ? BRAND.green : completeness >= 50 ? BRAND.amber : BRAND.danger }}>{completeness}%</span>
            <span className="text-xs" style={{ color: BRAND.subtext }}>
              {SPEC_COMPLETENESS_FIELDS.filter((f) => specData?.[f] != null && specData[f] !== "").length} / {SPEC_COMPLETENESS_FIELDS.length} fields
            </span>
          </div>
        </div>

        {/* Data Quality Score */}
        <div className="rounded-lg p-5" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: BRAND.green }}>Data Quality Score</div>
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 32, fontWeight: 700, color: qualityScore >= 80 ? BRAND.green : qualityScore >= 50 ? BRAND.amber : BRAND.danger }}>{qualityScore}</span>
            <span className="text-xs" style={{ color: BRAND.subtext }}>/ 100</span>
          </div>
        </div>
      </div>

      {/* Warnings & Issues */}
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

      {/* Actions */}
      <div className="mt-4 flex items-center gap-3" style={{ maxWidth: 700 }}>
        <button
          onClick={handleApprove}
          disabled={!canApprove || approving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium"
          style={{ background: BRAND.green, color: "#fff", opacity: !canApprove || approving ? 0.5 : 1 }}
        >
          {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {approving ? "Approving…" : "Approve Specification"}
        </button>
        <button
          onClick={handleSubmitForReview}
          disabled={!canApprove || submitting}
          className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium"
          style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.card, opacity: !canApprove || submitting ? 0.5 : 1 }}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {submitting ? "Submitting…" : "Submit for Review"}
        </button>
      </div>

      <div className="mt-3 text-xs" style={{ color: BRAND.subtext, maxWidth: 700 }}>
        <strong>Submit for Review</strong> sets the status to "Awaiting Review" without approving. <strong>Approve</strong> sets it to "Approved" and makes it the Current Specification.
      </div>
    </div>
  );
}