// StepSpecReview.jsx
// Step 3 of the model-first workflow: review the specification, see what is
// missing, approve it, and publish the approved version to the RP22 comparison.

import React from "react";
import { Loader2, AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { SPEC_GROUPS } from "../add-speaker/specFieldDefinitions.js";
import { SpecInput } from "../add-speaker/StepReview.jsx";
import { resolveContinuousPower } from "./rp22ComparisonPublish.js";
import SecondaryEvidenceButton from "../secondaryEvidence/SecondaryEvidenceButton.jsx";
import { evidenceRowNote, evidenceStatement, isTrustedEvidence } from "../secondaryEvidence/secondaryEvidencePolicy.js";
import { installedSpaceAssumptionForSpecification, spaceSourceLabel } from "@/components/utils/spl/installedSpaceAssumption.js";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  green: "#213428",
};

function Panel({ title, children, tone = "neutral" }) {
  const border = tone === "warn" ? "#F0D9A8" : tone === "ok" ? "#BEDCC5" : BRAND.border;
  const background = tone === "warn" ? "#FDF6E7" : tone === "ok" ? "#F1F8F3" : BRAND.bg;
  return (
    <div style={{ border: `1px solid ${border}`, background, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.text, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: BRAND.subtext }}>{children}</div>
    </div>
  );
}

export default function StepSpecReview({
  product,
  specification,
  onFieldChange,
  gaps,
  issues,
  ambiguousFields,
  saving,
  message,
  onSaveDraft,
  onSubmitForReview,
  onApprove,
  onPublish,
  publishResult,
  refreshOnPublish = true,
  onSecondaryEvidenceAccepted = null,
}) {
  const approved = specification?.approval_status === "Approved";
  const power = resolveContinuousPower(specification);
  // The installed-speaker normalisation assumption, stated in full wherever the
  // comparison's measurement basis is reviewed.
  const spaceAssumption = installedSpaceAssumptionForSpecification(specification);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text }}>
            {product?.manufacturer_name} {product?.model}
          </div>
          <div style={{ fontSize: 12, color: BRAND.subtext }}>
            Status: {specification?.approval_status || "Draft"}
            {specification?.approved_by ? ` · approved by ${specification.approved_by}` : ""}
            {" · "}{gaps.critical.length} RP22 gap{gaps.critical.length === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onSaveDraft} disabled={saving} style={{ padding: "8px 12px", borderRadius: 9, border: `1px solid ${BRAND.border}`, background: "#FFF", color: BRAND.text, fontSize: 13, cursor: "pointer" }}>
            Save draft
          </button>
          <button type="button" onClick={onSubmitForReview} disabled={saving} style={{ padding: "8px 12px", borderRadius: 9, border: `1px solid ${BRAND.border}`, background: "#FFF", color: BRAND.text, fontSize: 13, cursor: "pointer" }}>
            Submit for review
          </button>
          <button type="button" onClick={onApprove} disabled={saving || approved} style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: BRAND.green, color: "#FFF", fontSize: 13, fontWeight: 600, cursor: saving || approved ? "not-allowed" : "pointer", opacity: saving || approved ? 0.5 : 1 }}>
            {approved ? "Approved" : "Approve specification"}
          </button>
        </div>
      </div>

      {message && (
        <div style={{ padding: 10, borderRadius: 9, border: `1px solid ${BRAND.border}`, background: "#FFF", fontSize: 12, color: BRAND.text }}>
          {message}
        </div>
      )}

      {gaps.critical.length > 0 && (
        <Panel title="Missing for RP22 comparison" tone="warn">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {gaps.critical.map((gap) => (<li key={gap.key}>{gap.label}</li>))}
          </ul>
          These stay blank until the source states them. They will be published as warnings, not filled in.
        </Panel>
      )}

      {ambiguousFields.length > 0 && (
        <Panel title="Needs review" tone="warn">
          The source stated these values ambiguously, so they were filled in but flagged: {ambiguousFields.join(", ")}.
        </Panel>
      )}

      {issues.length > 0 && (
        <Panel title={`Data quality (${issues.length})`} tone="warn">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {issues.slice(0, 12).map((issue, index) => (
              <li key={`${issue.field}-${index}`}>{issue.message}</li>
            ))}
          </ul>
        </Panel>
      )}

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
        <Panel title="Power used for comparison">
          {power.value === null
            ? "No continuous power figure yet."
            : `${power.value} W (${power.label})`}
        </Panel>
        <Panel title="Max SPL basis">
          {specification?.max_spl_basis && specification.max_spl_basis !== "unknown"
            ? specification.max_spl_basis
            : "Not stated — comparison will record it as unspecified."}
        </Panel>
        <Panel title="Measurement space">
          <div>{spaceSourceLabel(specification?.measurement_space)}</div>
          {spaceAssumption.applied && (
            <div style={{ marginTop: 4 }}>{spaceAssumption.note}</div>
          )}
        </Panel>
      </div>

      {SPEC_GROUPS.map((group) => (
        <div key={group.label} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, background: "#FFF", padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: BRAND.subtext, marginBottom: 8 }}>
            {group.label}
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
            {group.fields.map((field) => (
              <label key={field.key} style={{ display: "block" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.text, marginBottom: 3 }}>{field.label}</div>
                <SpecInput
                  field={field}
                  value={specification?.[field.key]}
                  onChange={(value) => onFieldChange(field.key, value)}
                />
              </label>
            ))}
          </div>
        </div>
      ))}

      {/* Secondary evidence — an admin-approved copy of the manufacturer's own
          document, for models whose live official page no longer states the values. */}
      <div style={{ border: `1px solid ${specification?.secondary_evidence ? "#BEDCC5" : BRAND.border}`, background: specification?.secondary_evidence ? "#F1F8F3" : BRAND.bg, borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.text }}>
          {specification?.secondary_evidence ? evidenceRowNote(specification.secondary_evidence) : "Secondary evidence"}
        </div>
        {specification?.secondary_evidence ? (
          <div style={{ fontSize: 12, color: BRAND.subtext, display: "grid", gap: 3 }}>
            <div style={{ overflowWrap: "anywhere" }}>{specification.secondary_evidence.url}</div>
            <div>
              Host {specification.secondary_evidence.host || "—"} · {String(specification.secondary_evidence.document_type || "document").replace(/_/g, " ")}
            </div>
            <div>
              Accepted by {specification.secondary_evidence.accepted_by || "—"}
              {specification.secondary_evidence.accepted_date ? ` · ${new Date(specification.secondary_evidence.accepted_date).toLocaleDateString("en-GB")}` : ""}
            </div>
            <div>Basis: {specification.secondary_evidence.basis} · {specification.secondary_evidence.confidence_cap_reason}</div>
            {isTrustedEvidence(specification.secondary_evidence) && (
              <div>{evidenceStatement(specification.secondary_evidence)}</div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: BRAND.subtext }}>
            The live official source states no engineering values for this model. An admin can supply the manufacturer's own document
            from elsewhere and accept it explicitly: the values are recorded as secondary evidence and the comparison is capped at C.
          </div>
        )}
        <div>
          <SecondaryEvidenceButton
            manufacturerName={product?.manufacturer_name || ""}
            model={product?.model || ""}
            productId={product?.id || null}
            specification={specification}
            onAccepted={onSecondaryEvidenceAccepted}
          />
        </div>
      </div>

      <div style={{ border: `1px solid ${approved ? "#BEDCC5" : BRAND.border}`, background: approved ? "#F1F8F3" : BRAND.bg, borderRadius: 10, padding: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {approved ? <CheckCircle2 size={16} style={{ color: BRAND.green }} /> : <AlertTriangle size={16} style={{ color: "#7A5B12" }} />}
          <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.text }}>Publish to RP22 Comparison</div>
        </div>
        <div style={{ fontSize: 12, color: BRAND.subtext }}>
          {approved
            ? "Publishes this approved specification into the RP22 comparison library as one row, with its source, date, confidence and approval status. Publishing again updates that same row."
            : "Approve the specification first — only approved specifications can be compared on the RP22 page."}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={onPublish}
            disabled={saving || !approved}
            style={{ padding: "9px 14px", borderRadius: 9, border: "none", background: BRAND.green, color: "#FFF", fontSize: 13, fontWeight: 600, cursor: saving || !approved ? "not-allowed" : "pointer", opacity: saving || !approved ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Publish to RP22 Comparison
          </button>
          {publishResult && (
            <span style={{ fontSize: 12, color: BRAND.subtext }}>
              {publishResult.created ? "Published as a new comparison row." : "Updated the existing comparison row."}
            </span>
          )}
        </div>
        {approved && gaps.critical.length > 0 && (
          <div style={{ fontSize: 12, color: "#7A5B12" }}>
            Publishing now will show this model with {gaps.critical.length} missing value{gaps.critical.length === 1 ? "" : "s"},
            which limits or blocks its P12/P13 grading until they are entered.
          </div>
        )}
      </div>
    </div>
  );
}