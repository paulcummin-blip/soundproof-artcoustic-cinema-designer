import React from "react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  card: "#FFFFFF",
  green: "#213428",
  amber: "#625143",
  red: "#B23A3A",
  blue: "#2C5AA0",
};

const STATUS_COLORS = {
  active: "#213428",
  inactive: "#3E4349",
  trial: "#625143",
  suspended: "#B23A3A",
};

function StatusPill({ value }) {
  const color = STATUS_COLORS[value] || BRAND.subtext;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 999,
      border: `1px solid ${BRAND.border}`,
      background: BRAND.card, fontSize: 11, fontWeight: 600, color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {value ? value.charAt(0).toUpperCase() + value.slice(1) : "—"}
    </span>
  );
}

function formatDate(val) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return "—";
  }
}

/**
 * Reusable commercial account group section for the Commercial Control Centre.
 *
 * Props:
 * - title: string (e.g. "Premium Partners")
 * - subtitle: string (optional, e.g. "25 accounts")
 * - accounts: Account[]
 * - turnoverMap: Map<account_id, number>
 * - capacityMap: Map<account_id, breakdown>
 * - projectMap: Map<account_id, { count, lastActivity }>
 * - emptyMessage: string (shown when accounts is empty)
 * - showCommercialColumns: boolean (default true) — whether to show capacity/turnover columns
 * - accentColor: string (left border accent)
 */
export default function AccountGroupSection({
  title,
  subtitle,
  accounts,
  turnoverMap,
  capacityMap,
  projectMap,
  emptyMessage,
  showCommercialColumns = true,
  accentColor = "#213428",
}) {
  const count = accounts?.length || 0;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Section header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        marginBottom: 12, paddingLeft: 12,
        borderLeft: `4px solid ${accentColor}`,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 2 }}>
              {subtitle}
            </div>
          )}
        </div>
        <div style={{
          marginLeft: "auto",
          padding: "4px 12px", borderRadius: 999,
          background: BRAND.card, border: `1px solid ${BRAND.border}`,
          fontSize: 12, fontWeight: 700, color: BRAND.subtext,
        }}>
          {count}
        </div>
      </div>

      {count === 0 ? (
        <div style={{
          padding: "24px 20px", textAlign: "center",
          border: `1px dashed ${BRAND.border}`, borderRadius: 10,
          background: BRAND.card, color: BRAND.subtext, fontSize: 13,
        }}>
          {emptyMessage || "No accounts in this group."}
        </div>
      ) : (
        <div style={{
          background: BRAND.card, border: `1px solid ${BRAND.border}`,
          borderRadius: 10, overflow: "auto",
        }}>
          {/* Table header */}
          {showCommercialColumns ? (
            <div style={{
              display: "grid",
              gridTemplateColumns: "1.8fr 1fr 0.7fr 0.7fr 0.7fr 0.7fr 0.8fr 0.8fr 0.7fr 70px",
              padding: "10px 14px",
              background: "rgb(244 243 241)",
              borderBottom: `1px solid ${BRAND.border}`,
              fontSize: 10, fontWeight: 700, color: BRAND.subtext,
              letterSpacing: "0.05em", textTransform: "uppercase",
              minWidth: 1100,
            }}>
              <div>Dealer</div>
              <div>2026 Turnover</div>
              <div style={{ textAlign: "right" }}>Rewarded</div>
              <div style={{ textAlign: "right" }}>Purchased</div>
              <div style={{ textAlign: "right" }}>Used</div>
              <div style={{ textAlign: "right" }}>Available</div>
              <div style={{ textAlign: "right" }}>Projects</div>
              <div>Last Activity</div>
              <div>Status</div>
              <div></div>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr 70px",
              padding: "10px 14px",
              background: "rgb(244 243 241)",
              borderBottom: `1px solid ${BRAND.border}`,
              fontSize: 10, fontWeight: 700, color: BRAND.subtext,
              letterSpacing: "0.05em", textTransform: "uppercase",
            }}>
              <div>Account Name</div>
              <div>Type</div>
              <div>Last Activity</div>
              <div>Status</div>
              <div></div>
            </div>
          )}

          {/* Rows */}
          {accounts.map((acc, i) => {
            const cap = capacityMap?.get(acc.id) || null;
            const turnover = turnoverMap?.get(acc.id);
            const proj = projectMap?.get(acc.id) || { count: 0, lastActivity: null };
            const lastActivity = proj.lastActivity || acc.last_access_at || null;

            if (showCommercialColumns) {
              return (
                <div
                  key={acc.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.8fr 1fr 0.7fr 0.7fr 0.7fr 0.7fr 0.8fr 0.8fr 0.7fr 70px",
                    padding: "12px 14px",
                    borderBottom: i < count - 1 ? `1px solid ${BRAND.border}` : "none",
                    fontSize: 12, alignItems: "center", minWidth: 1100,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgb(248 248 247)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>
                    {acc.name || "—"}
                  </div>
                  <div style={{ color: BRAND.subtext, fontFamily: "monospace", fontSize: 12 }}>
                    {turnover !== null && turnover !== undefined
                      ? new Intl.NumberFormat("en-GB", {
                          style: "currency", currency: "GBP",
                          minimumFractionDigits: 2, maximumFractionDigits: 2,
                        }).format(turnover)
                      : "—"}
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 600, color: BRAND.green }}>
                    {cap?.rewarded ?? 0}
                  </div>
                  <div style={{ textAlign: "right", color: BRAND.subtext }}>
                    {cap?.purchased ?? 0}
                  </div>
                  <div style={{ textAlign: "right", color: BRAND.subtext }}>
                    {cap?.consumed ?? 0}
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 700, color: BRAND.text }}>
                    {cap?.remaining ?? 0}
                  </div>
                  <div style={{ textAlign: "right", color: BRAND.subtext }}>
                    {proj.count}
                  </div>
                  <div style={{ color: BRAND.subtext, fontSize: 11 }}>
                    {formatDate(lastActivity)}
                  </div>
                  <div>
                    <StatusPill value={acc.status} />
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <a
                      href={`/admin/accounts/${acc.id}`}
                      style={{
                        display: "inline-block",
                        padding: "5px 10px", borderRadius: 8,
                        border: `1px solid ${BRAND.border}`,
                        background: BRAND.card, color: BRAND.text,
                        fontSize: 11, fontWeight: 600, textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      View →
                    </a>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={acc.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr 70px",
                  padding: "12px 14px",
                  borderBottom: i < count - 1 ? `1px solid ${BRAND.border}` : "none",
                  fontSize: 12, alignItems: "center",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgb(248 248 247)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>
                  {acc.name || "—"}
                </div>
                <div style={{ color: BRAND.subtext, textTransform: "capitalize" }}>
                  {acc.account_type || "—"}
                </div>
                <div style={{ color: BRAND.subtext, fontSize: 11 }}>
                  {formatDate(lastActivity)}
                </div>
                <div>
                  <StatusPill value={acc.status} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <a
                    href={`/admin/accounts/${acc.id}`}
                    style={{
                      display: "inline-block",
                      padding: "5px 10px", borderRadius: 8,
                      border: `1px solid ${BRAND.border}`,
                      background: BRAND.card, color: BRAND.text,
                      fontSize: 11, fontWeight: 600, textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    View →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}