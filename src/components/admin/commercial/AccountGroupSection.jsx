import React, { useState, useMemo } from "react";

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

function formatGbp(val) {
  if (val === null || val === undefined) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency", currency: "GBP",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(val);
}

// ---- Sortable column definitions ----
// Each column: key, label, align, getSortValue(account, ctx) => number|string|date-string|null
const COLUMNS = [
  { key: "dealer", label: "Dealer", align: "left",
    getSortValue: (a) => (a.name || "").toLowerCase() },
  { key: "turnover", label: "2026 Turnover", align: "left",
    getSortValue: (a, ctx) => {
      const v = ctx.turnoverMap?.get(a.id);
      return v === undefined ? null : v;
    } },
  { key: "rewarded", label: "Rewarded", align: "right",
    getSortValue: (a, ctx) => ctx.capacityMap?.get(a.id)?.rewarded ?? null },
  { key: "purchased", label: "Purchased", align: "right",
    getSortValue: (a, ctx) => ctx.capacityMap?.get(a.id)?.purchased ?? null },
  { key: "used", label: "Used", align: "right",
    getSortValue: (a, ctx) => ctx.capacityMap?.get(a.id)?.consumed ?? null },
  { key: "available", label: "Available", align: "right",
    getSortValue: (a, ctx) => ctx.capacityMap?.get(a.id)?.remaining ?? null },
  { key: "projects", label: "Projects", align: "right",
    getSortValue: (a, ctx) => {
      const p = ctx.projectMap?.get(a.id);
      return p?.count ?? 0;
    } },
  { key: "lastActivity", label: "Last Activity", align: "left",
    getSortValue: (a, ctx) => {
      const p = ctx.projectMap?.get(a.id);
      const v = p?.lastActivity || a.last_access_at || null;
      return v; // ISO string or null
    } },
  { key: "status", label: "Status", align: "left",
    getSortValue: (a) => (a.status || "").toLowerCase() },
];

// Comparator that always places missing/null values last, regardless of direction.
function makeComparator(sortKey, sortDir, ctx) {
  const col = COLUMNS.find(c => c.key === sortKey);
  if (!col) return null;
  const isDate = sortKey === "lastActivity";
  const dir = sortDir === "desc" ? -1 : 1;

  return (a, b) => {
    const av = col.getSortValue(a, ctx);
    const bv = col.getSortValue(b, ctx);
    const aMissing = av === null || av === undefined || av === "";
    const bMissing = bv === null || bv === undefined || bv === "";

    // Missing always last, regardless of direction.
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;

    if (isDate) {
      const at = new Date(av).getTime();
      const bt = new Date(bv).getTime();
      return (at - bt) * dir;
    }
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * dir;
    }
    // String compare
    return String(av).localeCompare(String(bv)) * dir;
  };
}

// Understated sort indicator
function SortIndicator({ active, dir }) {
  if (!active) {
    return (
      <span style={{
        marginLeft: 4, fontSize: 8, color: BRAND.border,
        lineHeight: 1, display: "inline-block", verticalAlign: "middle",
      }}>
        ↕
      </span>
    );
  }
  return (
    <span style={{
      marginLeft: 4, fontSize: 8, color: BRAND.subtext,
      lineHeight: 1, display: "inline-block", verticalAlign: "middle",
    }}>
      {dir === "desc" ? "▼" : "▲"}
    </span>
  );
}

function SortableHeader({ col, active, dir, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: "pointer",
        userSelect: "none",
        textAlign: col.align,
        transition: "color 0.12s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { e.currentTarget.style.color = BRAND.text; }}
      onMouseLeave={e => { e.currentTarget.style.color = ""; }}
    >
      {col.label}
      <SortIndicator active={active} dir={dir} />
    </div>
  );
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

  // Sort state — default Dealer A–Z
  const [sortKey, setSortKey] = useState("dealer");
  const [sortDir, setSortDir] = useState("asc");

  const ctx = useMemo(() => ({ turnoverMap, capacityMap, projectMap }), [turnoverMap, capacityMap, projectMap]);

  const sortedAccounts = useMemo(() => {
    if (!accounts || accounts.length === 0) return [];
    const comparator = makeComparator(sortKey, sortDir, ctx);
    if (!comparator) return [...accounts];
    return [...accounts].sort(comparator);
  }, [accounts, sortKey, sortDir, ctx]);

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // Sensible default direction per column type
      const isNumericOrDate = ["turnover", "rewarded", "purchased", "used", "available", "projects", "lastActivity"].includes(key);
      setSortDir(isNumericOrDate ? "desc" : "asc");
    }
  }

  // Wider Projects (0.95fr) and Last Activity (1.15fr) for clear separation
  const commercialGrid = "1.8fr 1fr 0.7fr 0.7fr 0.7fr 0.7fr 0.95fr 1.15fr 0.7fr 70px";
  const simpleGrid = "2fr 1fr 1fr 1fr 70px";

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
              gridTemplateColumns: commercialGrid,
              padding: "10px 14px",
              background: "rgb(244 243 241)",
              borderBottom: `1px solid ${BRAND.border}`,
              fontSize: 10, fontWeight: 700, color: BRAND.subtext,
              letterSpacing: "0.05em", textTransform: "uppercase",
              minWidth: 1120,
            }}>
              {COLUMNS.map(col => (
                <SortableHeader
                  key={col.key}
                  col={col}
                  active={sortKey === col.key}
                  dir={sortDir}
                  onClick={() => handleSort(col.key)}
                />
              ))}
              <div></div>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: simpleGrid,
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
          {showCommercialColumns
            ? sortedAccounts.map((acc, i) => {
                const cap = capacityMap?.get(acc.id) || null;
                const turnover = turnoverMap?.get(acc.id);
                const proj = projectMap?.get(acc.id) || { count: 0, lastActivity: null };
                const lastActivity = proj.lastActivity || acc.last_access_at || null;

                return (
                  <div
                    key={acc.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: commercialGrid,
                      padding: "12px 14px",
                      borderBottom: i < count - 1 ? `1px solid ${BRAND.border}` : "none",
                      fontSize: 12, alignItems: "center", minWidth: 1120,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgb(248 248 247)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, color: BRAND.text }}>
                      {acc.name || "—"}
                    </div>
                    <div style={{ color: BRAND.subtext, fontFamily: "monospace", fontSize: 12 }}>
                      {formatGbp(turnover)}
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
                    <div style={{ color: BRAND.subtext, fontSize: 11, whiteSpace: "nowrap" }}>
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
              })
            : sortedAccounts.map((acc, i) => {
                const proj = projectMap?.get(acc.id) || { count: 0, lastActivity: null };
                const lastActivity = proj.lastActivity || acc.last_access_at || null;

                return (
                  <div
                    key={acc.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: simpleGrid,
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
              })
          }
        </div>
      )}
    </div>
  );
}