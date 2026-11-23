import React from "react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
};

const STATUS_COLORS = {
  healthy: "#213428",
  operational: "#213428",
  active: "#213428",
  warning: "#625143",
  setup_required: "#625143",
  offline: "#B23A3A",
  error: "#B23A3A",
};

// Unread accent colours. "error" (System Health) uses red; "activity"
// (Account/Commercial) uses the brand green. Both are subtle: a 4px left
// border accent plus a badge, never an aggressive full-card treatment.
const UNREAD_ACCENTS = {
  error: { border: "#B23A3A", badgeBg: "#FDE8E8", badgeText: "#B23A3A" },
  activity: { border: "#213428", badgeBg: "#EEF4F0", badgeText: "#213428" },
};

function StatusBadge({ status }) {
  const key = (status || "").toLowerCase().replace(/\s+/g, "_");
  const color = STATUS_COLORS[key] || BRAND.subtext;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 999,
      border: `1px solid ${BRAND.border}`,
      background: BRAND.card, fontSize: 11, fontWeight: 600, color,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      {status}
    </span>
  );
}

function UnreadBadge({ count, label, tone }) {
  const accent = UNREAD_ACCENTS[tone] || UNREAD_ACCENTS.activity;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "4px 10px", borderRadius: 999,
      background: accent.badgeBg, color: accent.badgeText,
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
    }}>
      {count} {label}
    </span>
  );
}

/**
 * Reusable admin landing-page card.
 * Props: title, description, status, count, href, unread
 *
 * unread (optional): { count: number, label: string, tone: 'error' | 'activity' }
 * When count > 0 the card shows a subtle left-border accent and an unread badge
 * replacing the count line. When count is 0 or unread is absent the card keeps
 * its existing normal appearance.
 */
export default function AdminSectionCard({ title, description, status, count, href, unread }) {
  const hasUnread = Boolean(unread && unread.count > 0);
  const accent = hasUnread ? (UNREAD_ACCENTS[unread.tone] || UNREAD_ACCENTS.activity) : null;

  return (
    <a
      href={href}
      style={{
        display: "block", textDecoration: "none",
        background: BRAND.card,
        border: `1px solid ${BRAND.border}`,
        borderLeft: hasUnread ? `4px solid ${accent.border}` : `1px solid ${BRAND.border}`,
        borderRadius: 14, padding: 22,
        transition: "box-shadow 0.15s, transform 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: BRAND.text }}>{title}</div>
        <StatusBadge status={status} />
      </div>
      <div style={{ fontSize: 13, color: BRAND.subtext, marginBottom: 16, lineHeight: 1.4 }}>
        {description}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {hasUnread
            ? <UnreadBadge count={unread.count} label={unread.label} tone={unread.tone} />
            : <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>{count}</span>}
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#213428" }}>
          Manage →
        </span>
      </div>
    </a>
  );
}