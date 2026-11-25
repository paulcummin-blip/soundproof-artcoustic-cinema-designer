import React from "react";

/**
 * AccountAccessLiveSummary — compact live headline summary rendered inside the
 * "Account Access & Credits" card on the Admin Dashboard.
 *
 * Layout:
 *   - Headline figure: total live dealer accounts (most prominent).
 *   - Four compact activity indicators beneath, with green/amber/neutral
 *     highlighting so the admin can immediately see what needs attention.
 *
 * Highlighting:
 *   - Newly activated   → green (positive)
 *   - New accounts       → neutral (informational)
 *   - New incomplete     → amber (needs attention)
 *   - Lost access        → amber (needs attention), shown only when > 0
 *   - New dealer projects → neutral/green
 *
 * The activity indicators link to the Account Access page (and the Commercial
 * Control Centre for projects) so the admin can drill in. Zero-activity
 * figures stay neutral.
 */

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  greenBg: "#EEF4F0",
  greenBorder: "#BBD3C4",
  greenText: "#213428",
  amberBg: "#FAF5EC",
  amberBorder: "#E4D6BE",
  amberText: "#7A5B22",
  mutedBg: "#F5F4F2",
  mutedBorder: "#E2E0DC",
  mutedText: "#625143",
};

function Indicator({ value, label, tone, href }) {
  const palette =
    tone === "green"
      ? { bg: BRAND.greenBg, border: BRAND.greenBorder, text: BRAND.greenText }
      : tone === "amber"
      ? { bg: BRAND.amberBg, border: BRAND.amberBorder, text: BRAND.amberText }
      : { bg: BRAND.mutedBg, border: BRAND.mutedBorder, text: BRAND.mutedText };

  const inner = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 16, fontWeight: 800, color: palette.text, lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 11, fontWeight: 600, color: palette.text, lineHeight: 1.2 }}>
        {label}
      </span>
    </span>
  );

  const style = {
    display: "inline-flex",
    alignItems: "center",
    padding: "5px 10px",
    borderRadius: 8,
    border: `1px solid ${palette.border}`,
    background: palette.bg,
    textDecoration: "none",
    cursor: href ? "pointer" : "default",
  };

  if (href) {
    return <a href={href} style={style} title={label}>{inner}</a>;
  }
  return <span style={style}>{inner}</span>;
}

export default function AccountAccessLiveSummary({ summary, loading, error }) {
  if (loading && !summary) {
    return (
      <div style={{
        padding: "16px 0 0",
        borderTop: `1px solid ${BRAND.border}`,
        marginTop: 14,
        fontSize: 12,
        color: BRAND.subtext,
      }}>
        Loading live summary…
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div style={{
        padding: "16px 0 0",
        borderTop: `1px solid ${BRAND.border}`,
        marginTop: 14,
        fontSize: 12,
        color: "#B23A3A",
      }}>
        Live summary unavailable.
      </div>
    );
  }

  const s = summary || {};
  const live = s.liveDealerAccounts ?? 0;
  const newlyActivated = s.newlyActivated ?? 0;
  const newAccounts = s.newAccounts ?? 0;
  const newIncomplete = s.newIncompleteActivations ?? 0;
  const lostAccess = s.lostActiveAccess ?? 0;
  const newProjects = s.newDealerProjects ?? 0;

  const attention = newIncomplete > 0 || lostAccess > 0;

  return (
    <div style={{
      padding: "16px 0 0",
      borderTop: `1px solid ${BRAND.border}`,
      marginTop: 14,
    }}>
      {/* Headline figure */}
      <a
        href="/admin/access"
        style={{ textDecoration: "none", display: "block", marginBottom: 12 }}
      >
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: BRAND.subtext,
          marginBottom: 2,
        }}>
          Live dealer accounts
        </div>
        <div style={{
          fontSize: 32,
          fontWeight: 800,
          color: attention ? BRAND.amberText : BRAND.greenText,
          lineHeight: 1,
        }}>
          {live}
        </div>
        <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 3 }}>
          {attention
            ? `${newIncomplete + lostAccess} need attention since last visit`
            : "Approved & active with a valid access term"}
        </div>
      </a>

      {/* Activity indicators */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
      }}>
        <Indicator
          value={newlyActivated}
          label={newlyActivated === 1 ? "newly activated" : "newly activated"}
          tone={newlyActivated > 0 ? "green" : "neutral"}
          href={newlyActivated > 0 ? "/admin/access?activity=active" : null}
        />
        <Indicator
          value={newAccounts}
          label={newAccounts === 1 ? "new account" : "new accounts"}
          tone={newAccounts > 0 ? "green" : "neutral"}
          href={newAccounts > 0 ? "/admin/access" : null}
        />
        <Indicator
          value={newIncomplete}
          label={newIncomplete === 1 ? "incomplete activation" : "incomplete activations"}
          tone={newIncomplete > 0 ? "amber" : "neutral"}
          href={newIncomplete > 0 ? "/admin/access?activity=not_activated" : null}
        />
        {lostAccess > 0 && (
          <Indicator
            value={lostAccess}
            label={lostAccess === 1 ? "lost access" : "lost access"}
            tone="amber"
            href="/admin/access?status=suspended"
          />
        )}
        <Indicator
          value={newProjects}
          label={newProjects === 1 ? "new dealer project" : "new dealer projects"}
          tone={newProjects > 0 ? "green" : "neutral"}
          href={newProjects > 0 ? "/admin/accounts" : null}
        />
      </div>
    </div>
  );
}