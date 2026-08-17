import React from "react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  amber: "#625143",
  red: "#B23A3A",
};

/**
 * Compact commercial summary card for the AccountDashboard header.
 *
 * Props:
 * - account: Account object
 * - breakdown: capacity breakdown object (from aggregateCapacityBreakdown)
 * - turnover: number|null (GBP)
 * - projectCount: number
 * - calendarYear: number
 */
export default function CommercialSummaryCard({
  account,
  breakdown,
  turnover,
  projectCount,
  calendarYear,
}) {
  if (!account) return null;

  const b = breakdown || {
    purchased: 0, rewarded: 0, promotional: 0,
    distributorAllocated: 0, adminGranted: 0, trial: 0,
    internal: 0, consumed: 0, remaining: 0,
  };

  const formatGBP = (val) => {
    if (val === null || val === undefined) return "—";
    try {
      return new Intl.NumberFormat("en-GB", {
        style: "currency", currency: "GBP",
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(val);
    } catch {
      return "—";
    }
  };

  const Stat = ({ label, value, accent }) => (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: BRAND.subtext,
        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 18, fontWeight: 700,
        color: accent || BRAND.text,
      }}>
        {value}
      </div>
    </div>
  );

  const CapacityRow = ({ label, value, bold }) => (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "6px 0", borderBottom: `1px solid ${BRAND.border}`,
    }}>
      <span style={{ fontSize: 12, color: BRAND.subtext }}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: bold ? 700 : 600,
        color: bold ? BRAND.green : BRAND.text,
      }}>
        {value}
      </span>
    </div>
  );

  return (
    <div style={{
      background: BRAND.card, border: `1px solid ${BRAND.border}`,
      borderRadius: 12, padding: "20px 24px", marginBottom: 20,
    }}>
      {/* Top row: turnover + projects + status */}
      <div style={{
        display: "flex", gap: 40, flexWrap: "wrap",
        paddingBottom: 16, marginBottom: 16,
        borderBottom: `1px solid ${BRAND.border}`,
      }}>
        <Stat
          label={`${calendarYear} Turnover`}
          value={formatGBP(turnover)}
          accent={BRAND.green}
        />
        <Stat label="Projects" value={projectCount ?? 0} />
        <Stat label="Status" value={account.status || "—"} />
      </div>

      {/* Professional Projects breakdown */}
      <div style={{ marginBottom: 4 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: BRAND.subtext,
          textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8,
        }}>
          Professional Projects
        </div>
        <div style={{ maxWidth: 320 }}>
          <CapacityRow label="Rewarded" value={b.rewarded} />
          <CapacityRow label="Purchased" value={b.purchased} />
          {b.promotional > 0 && <CapacityRow label="Promotional" value={b.promotional} />}
          {b.distributorAllocated > 0 && <CapacityRow label="Distributor Allocated" value={b.distributorAllocated} />}
          {b.adminGranted > 0 && <CapacityRow label="Admin Granted" value={b.adminGranted} />}
          {b.trial > 0 && <CapacityRow label="Trial" value={b.trial} />}
          <CapacityRow label="Used" value={b.consumed} />
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 0", marginTop: 4,
            borderTop: `2px solid ${BRAND.green}`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.green }}>
              Available
            </span>
            <span style={{
              fontSize: 20, fontWeight: 700, color: BRAND.green,
            }}>
              {b.remaining}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}