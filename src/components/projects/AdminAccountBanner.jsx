import React from "react";

// Brand tokens — kept local so this component is self-contained and can be
// imported anywhere without a dependency on the page's BRAND object.
const ACCENT = "#213428";
const BORDER = "#E2DED7";

/**
 * AdminAccountBanner — a subtle account-ownership label shown at the top of
 * a project card, visible only to administrators.
 *
 * Resolution uses the existing project→account ownership relationship:
 *   - No account_id → admin-owned → "ADI / Admin"
 *   - account_id resolved to an Account record → that account's business name
 *   - account_id present but Account record not resolved → "Account unknown"
 *
 * It never infers ownership from project names, clients or the viewing user.
 * It changes no ownership, permissions or visibility — it is display only.
 */
export default function AdminAccountBanner({ accountId = null, account = null }) {
  const hasAccountId = Boolean(accountId && String(accountId).trim());
  const accountName = account?.name || null;

  let label;
  if (!hasAccountId) {
    label = "ADI / Admin";
  } else if (accountName) {
    label = accountName;
  } else {
    label = "Account unknown";
  }

  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: ACCENT,
        padding: "10px 22px",
        borderBottom: `1px solid ${BORDER}`,
        lineHeight: 1.4,
      }}
      title={`Account ownership: ${label}`}
    >
      {label}
    </div>
  );
}