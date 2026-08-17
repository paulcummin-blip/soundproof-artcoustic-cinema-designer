import React from 'react';

/**
 * 200-day age review dialog.
 *
 * Clean, non-threatening confirmation asking whether an old project is still live.
 * Actions: "Keep Live" (stamps last_age_reviewed_at) or "Archive Project"
 * (sets lifecycle_status = "Archived" — no deletion, no credit refund).
 *
 * Styling matches the existing Projects page inline-modal pattern (BRAND tokens
 * passed via props) so it feels native, not like a new feature panel.
 */
export default function AgeReviewDialog({
  open,
  projectName,
  ageDays,
  brand,
  onKeepLive,
  onArchive,
  onCancel,
}) {
  if (!open) return null;

  const B = brand || {
    text: "#1B1A1A",
    subtext: "#3E4349",
    border: "#DCDBD6",
    card: "#FFFFFF",
    btn: "#1B1A1A",
    btnText: "#FFFFFF",
    btnGhost: "#FFFFFF",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: "min(440px, 92vw)",
          background: B.card,
          border: `1px solid ${B.border}`,
          borderRadius: 12,
          padding: 24,
          color: B.text,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: B.text }}>
          Is this project still live?
        </h2>
        <p style={{ marginTop: 12, fontSize: 14, color: B.subtext, lineHeight: 1.5 }}>
          This project is now {ageDays} days old.
        </p>
        {projectName && (
          <p style={{ marginTop: 4, fontSize: 12, color: B.subtext }}>
            {projectName}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button
            type="button"
            onClick={onKeepLive}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: `1px solid ${B.border}`,
              background: B.btn,
              color: B.btnText,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Keep Live
          </button>
          <button
            type="button"
            onClick={onArchive}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: `1px solid ${B.border}`,
              background: B.btnGhost,
              color: B.text,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Archive Project
          </button>
        </div>
      </div>
    </div>
  );
}