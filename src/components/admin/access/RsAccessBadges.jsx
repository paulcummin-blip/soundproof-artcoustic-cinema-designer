import React from "react";
import AccessPill from "@/components/admin/access/AccessPill";

/**
 * RsAccessBadges — the three-status Access column for Richer Sounds rows,
 * introduced by RS-01. Renders up to three compact, vertically stacked badges:
 *
 *   1. Sound Proof eligibility (Approved / Not Approved) — the existing Master
 *      Admin approval, unchanged.
 *   2. RS internal approval (RS Approved / RS Awaiting Approval / RS
 *      Suspended) — the new second dimension for ordinary RS stores. Custom
 *      Install - 93 shows a neutral "Central Administrator" badge here and is
 *      exempt from RS approval. Non-RS groups show no second badge.
 *   3. Activation state (Not Activated / Invitation Pending / Active / Expired
 *      / Suspended) — the existing activation pill with countdown.
 *
 * Tones: green (ok) for Sound Proof Approved, RS Approved and Activated; warm
 * (warn) for RS Awaiting Approval; red (danger) for RS Suspended; neutral
 * (muted) for Not Activated / Not Approved. Non-RS rows fall back to the
 * existing two-pill stack so every other dealer group is unaffected.
 *
 * Props: row (a built access row carrying eligibilityState, activationPill /
 *        activationState, rsApprovalState, isRsCentralAdmin, account).
 */
export default function RsAccessBadges({ row }) {
  const eligibility = row.eligibilityState || { label: "—", tone: "muted" };
  const activationPill = row.activationPill || row.activationState || { label: "—", tone: "muted" };
  const isRs = row.account?.dealer_group === "RICHER_SOUNDS";

  // Non-Richer-Sounds rows keep the exact existing two-pill stack.
  if (!isRs) {
    return (
      <div className="flex flex-col items-start gap-1">
        <AccessPill
          label={eligibility.label}
          tone={eligibility.tone}
          title="Sound Proof eligibility — approved by admin"
        />
        <AccessPill
          label={activationPill.label}
          tone={activationPill.tone}
          title="Activation state with countdown — account status, membership and audit history"
        />
      </div>
    );
  }

  // Custom Install - 93: Central Administrator badge replaces the RS approval
  // badge. 93 is exempt from RS internal approval.
  if (row.isRsCentralAdmin) {
    return (
      <div className="flex flex-col items-start gap-1">
        <AccessPill
          label={eligibility.label}
          tone={eligibility.tone}
          title="Sound Proof eligibility — approved by admin"
        />
        <AccessPill
          label="Central Administrator"
          tone="muted"
          title="Custom Install - 93 — central Richer Sounds administrator, exempt from RS internal approval"
        />
        <AccessPill
          label={activationPill.label}
          tone={activationPill.tone}
          title="Activation state with countdown — account status, membership and audit history"
        />
      </div>
    );
  }

  // Ordinary Richer Sounds store: three badges — eligibility, RS approval,
  // activation.
  const rsApproval = row.rsApprovalState || { label: "RS Awaiting Approval", tone: "warn" };
  return (
    <div className="flex flex-col items-start gap-1">
      <AccessPill
        label={eligibility.label}
        tone={eligibility.tone}
        title="Sound Proof eligibility — approved by Sound Proof Master Admin"
      />
      <AccessPill
        label={rsApproval.label}
        tone={rsApproval.tone}
        title="RS internal approval — set by a Master Admin or an authorised Custom Install - 93 administrator"
      />
      <AccessPill
        label={activationPill.label}
        tone={activationPill.tone}
        title="Activation state with countdown — account status, membership and audit history"
      />
    </div>
  );
}