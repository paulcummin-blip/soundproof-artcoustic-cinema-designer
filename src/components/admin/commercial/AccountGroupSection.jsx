import React, { useState, useMemo } from "react";
import { computeLastActivity } from "@/lib/commercial/commercialOverview";
import GroupPromotionArea from "@/components/admin/promotions/GroupPromotionArea";
import {
  isEffective,
  promotionBelongsToGroup,
} from "@/components/admin/promotions/promotionStatus";

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
    getSortValue: (a, ctx) => ctx.projectMap?.get(a.id)?.count ?? 0 },
  { key: "promoProjects", label: "Promo Projects", align: "right",
    getSortValue: (a, ctx) => ctx.promoUsageMap?.get(a.id) ?? 0 },
  { key: "lastActivity", label: "Last Activity", align: "left",
    getSortValue: (a, ctx) => {
      const p = ctx.projectMap?.get(a.id);
      return computeLastActivity(p, a);
    } },
  { key: "status", label: "Status", align: "left",
    getSortValue: (a) => (a.status || "").toLowerCase() },
];

// Comparator — missing values always sort last, regardless of direction.
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

    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;

    if (isDate) {
      return (new Date(av).getTime() - new Date(bv).getTime()) * dir;
    }
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * dir;
    }
    return String(av).localeCompare(String(bv)) * dir;
  };
}

// Simple text-style sort indicator: - ^ v
function SortIndicator({ active, dir }) {
  const glyph = !active ? "-" : dir === "desc" ? "v" : "^";
  return (
    <span style={{
      marginLeft: 4, fontSize: 9, fontWeight: 600,
      color: active ? BRAND.subtext : BRAND.border,
      lineHeight: 1, display: "inline-block", verticalAlign: "middle",
    }}>
      {glyph}
    </span>
  );
}

function SortableHeader({ col, active, dir, onClick, style }) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: "pointer",
        userSelect: "none",
        textAlign: col.align,
        transition: "color 0.12s",
        whiteSpace: "nowrap",
        ...style,
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
 * - title, subtitle, accounts, turnoverMap, capacityMap, projectMap
 * - emptyMessage, showCommercialColumns, accentColor
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
  // Promotion props
  groupKey = null,
  promotions = [],
  promotionUsage = [],
  allAccounts = [],
  onPromotionsChanged = null,
}) {
  const count = accounts?.length || 0;

  const [sortKey, setSortKey] = useState("dealer");
  const [sortDir, setSortDir] = useState("asc");

  // Build per-account promo usage map for the CURRENT active promotion in this group.
  // Authority: PromotionUsage records — not Project count, not CapacityLedger.
  // Promo Projects is a usage/engagement metric that persists even if the
  // underlying Project is later cleaned up (abuse-monitoring rule).
  const promoUsageMap = useMemo(() => {
    const map = new Map();
    if (!groupKey || !promotions || !promotionUsage) return map;
    const activeIds = new Set(
      promotions
        .filter(p => promotionBelongsToGroup(p, groupKey, allAccounts))
        .filter(p => isEffective(p))
        .map(p => p.id)
    );
    if (activeIds.size === 0) return map;
    for (const u of promotionUsage) {
      if (!activeIds.has(u.promotion_id)) continue;
      map.set(u.account_id, (map.get(u.account_id) || 0) + 1);
    }
    return map;
  }, [groupKey, promotions, promotionUsage, allAccounts]);

  const ctx = useMemo(() => ({ turnoverMap, capacityMap, projectMap, promoUsageMap }), [turnoverMap, capacityMap, projectMap, promoUsageMap]);

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
      const isNumericOrDate = ["turnover", "rewarded", "purchased", "used", "available", "projects", "promoProjects", "lastActivity"].includes(key);
      setSortDir(isNumericOrDate ? "desc" : "asc");
    }
  }

  // Wider Projects (0.9fr) and Last Activity (1.3fr) with explicit padding
  // for clear visual separation between the two columns.
  const commercialGrid = "1.8fr 1fr 0.7fr 0.7fr 0.7fr 0.7fr 0.9fr 0.8fr 1.3fr 0.7fr 70px";
  const simpleGrid = "2fr 1fr 1fr 1fr 70px";

  // Explicit padding to create breathing room between Projects and Last Activity
  const projectsCellPadding = { paddingRight: 28 };
  const lastActivityCellPadding = { paddingLeft: 20 };

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

      {/* Promotion area — between heading and table */}
      {groupKey && (
        <GroupPromotionArea
          groupKey={groupKey}
          promotions={promotions}
          promotionUsage={promotionUsage}
          allAccounts={allAccounts}
          onPromotionsChanged={onPromotionsChanged}
        />
      )}

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
              minWidth: 1240,
            }}>
              {COLUMNS.map((col, idx) => {
                const isProjects = col.key === "projects";
                const isLastActivity = col.key === "lastActivity";
                const extraStyle = isProjects ? projectsCellPadding
                  : isLastActivity ? lastActivityCellPadding : {};
                return (
                  <SortableHeader
                    key={col.key}
                    col={col}
                    active={sortKey === col.key}
                    dir={sortDir}
                    onClick={() => handleSort(col.key)}
                    style={extraStyle}
                  />
                );
              })}
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
                const lastActivity = computeLastActivity(proj, acc);

                return (
                  <div
                    key={acc.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: commercialGrid,
                      padding: "12px 14px",
                      borderBottom: i < count - 1 ? `1px solid ${BRAND.border}` : "none",
                      fontSize: 12, alignItems: "center", minWidth: 1180,
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
                    <div style={{ textAlign: "right", color: BRAND.subtext, ...projectsCellPadding }}>
                      {proj.count}
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 600, color: BRAND.green }}>
                      {promoUsageMap.get(acc.id) || 0}
                    </div>
                    <div style={{ color: BRAND.subtext, fontSize: 11, whiteSpace: "nowrap", ...lastActivityCellPadding }}>
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
                const lastActivity = computeLastActivity(proj, acc);

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