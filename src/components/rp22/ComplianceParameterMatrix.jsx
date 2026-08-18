// Compact, scannable Compliance Report matrix with expandable per-parameter detail.
// Pure presentation — all levels, values, per-seat pills and detail cards come from
// callbacks supplied by the parent (RP22CompliancePanel), so no RP22/RP23 calculation
// or bass-readiness logic lives here.
import React, { useState, useMemo } from "react";
import RP22GradingPill from "@/components/ui/RP22GradingPill";
import { ChevronDown } from "lucide-react";

const LEVEL_ORD = { L4: 4, L3: 3, L2: 2, L1: 1, FAIL: 0 };

const levelKey = (lvl) => {
  const s = String(lvl).toUpperCase();
  if (s === "L4" || lvl === 4) return "L4";
  if (s === "L3" || lvl === 3) return "L3";
  if (s === "L2" || lvl === 2) return "L2";
  if (s === "L1" || lvl === 1) return "L1";
  if (s === "FAIL" || lvl === 0) return "FAIL";
  return "NV";
};

const deriveStatus = (achievedValue) => {
  const v = String(achievedValue || "");
  if (/not verified|waiting for bass|waiting for authoritative/i.test(v)) return { label: "Not verified", color: "#8B7F76" };
  if (/not calculated|insufficient|—|^n\/a$/i.test(v) || v === "") return { label: "Not calculated", color: "#8B7F76" };
  return { label: "Calculated", color: "#2d7a4f" };
};

const SummaryTile = ({ label, count, tone }) => (
  <div style={{ borderRadius: 6, border: "1px solid #E6E4DD", background: "#F8F8F7", padding: "5px 8px", minWidth: 0 }}>
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#625143" }}>{label}</div>
    <div style={{ fontSize: 15, fontWeight: 700, color: tone === "fail" ? "#A7302F" : tone === "muted" ? "#8B7F76" : "#213428" }}>{count}</div>
  </div>
);

export default function ComplianceParameterMatrix({
  parameters,
  getLevelForParam,
  getValueForParam,
  renderDetailCard,
}) {
  const [expandedId, setExpandedId] = useState(null);

  const rowsData = useMemo(
    () =>
      parameters.map((p) => {
        const lvl = getLevelForParam(p);
        const achievedValue = getValueForParam(p);
        const isSeatScope = String(p.scope || "").toLowerCase() === "seat";
        const status = deriveStatus(achievedValue);
        return { p, lvl, achievedValue, isSeatScope, status };
      }),
    [parameters, getLevelForParam, getValueForParam]
  );

  const summary = useMemo(() => {
    const counts = { L4: 0, L3: 0, L2: 0, L1: 0, fail: 0, notVerified: 0 };
    let lowestOrd = null;
    let active = 0;
    let unavailable = 0;
    rowsData.forEach(({ lvl }) => {
      const k = levelKey(lvl);
      if (k === "L4") { counts.L4++; active++; }
      else if (k === "L3") { counts.L3++; active++; }
      else if (k === "L2") { counts.L2++; active++; }
      else if (k === "L1") { counts.L1++; active++; }
      else if (k === "FAIL") { counts.fail++; active++; }
      else { counts.notVerified++; unavailable++; }
      if (k in LEVEL_ORD) {
        const ord = LEVEL_ORD[k];
        if (lowestOrd === null || ord < lowestOrd) lowestOrd = ord;
      }
    });
    const lowestLabel =
      lowestOrd === 4 ? "L4" :
      lowestOrd === 3 ? "L3" :
      lowestOrd === 2 ? "L2" :
      lowestOrd === 1 ? "L1" :
      lowestOrd === 0 ? "Below L1" : "—";
    return { counts, lowestLabel, active, unavailable };
  }, [rowsData]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 1. Compliance Summary */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#625143", marginBottom: 6 }}>
          Compliance Summary
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))", gap: 6 }}>
          <SummaryTile label="L4" count={summary.counts.L4} />
          <SummaryTile label="L3" count={summary.counts.L3} />
          <SummaryTile label="L2" count={summary.counts.L2} />
          <SummaryTile label="L1" count={summary.counts.L1} />
          <SummaryTile label="Fail" count={summary.counts.fail} tone="fail" />
          <SummaryTile label="Not verified" count={summary.counts.notVerified} tone="muted" />
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "#625143", flexWrap: "wrap" }}>
          <span>Lowest achieved: <strong style={{ color: "#1B1A1A" }}>{summary.lowestLabel}</strong></span>
          <span>Active: <strong style={{ color: "#1B1A1A" }}>{summary.active}</strong></span>
          <span>Unavailable: <strong style={{ color: "#1B1A1A" }}>{summary.unavailable}</strong></span>
        </div>
      </div>

      {/* 2. Compact Parameter Matrix + 3. Expandable Detail */}
      <div style={{ border: "1px solid #DCDBD6", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        <div style={{ padding: "6px 10px", background: "#F8F8F7", borderBottom: "1px solid #E6E4DD", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#625143", display: "flex", justifyContent: "space-between" }}>
          <span>Parameter</span>
          <span>Level</span>
        </div>
        {rowsData.map(({ p, lvl, achievedValue, isSeatScope, status }, idx) => {
          const isOpen = expandedId === p.id;
          return (
            <div key={p.id} style={{ borderTop: idx === 0 ? "none" : "1px solid #F0EFEA" }}>
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : p.id)}
                aria-expanded={isOpen}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1B1A1A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    P{p.id} {p.short || p.title}
                  </div>
                  <div style={{ fontSize: 10, color: "#625143", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.scope} · <span style={{ color: status.color }}>{status.label}</span> · <span style={{ color: "#213428", fontWeight: 600 }}>{achievedValue}</span>
                  </div>
                </div>
                <div style={{ flex: "0 0 auto" }}>
                  <RP22GradingPill level={lvl} />
                </div>
                <div style={{ flex: "0 0 auto", color: "#625143", display: "inline-flex", alignItems: "center" }}>
                  <ChevronDown size={14} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }} />
                </div>
              </button>
              {isOpen && (
                <div style={{ padding: "6px 10px 12px 10px", background: "#FBFAF8", borderTop: "1px solid #F0EFEA" }}>
                  {renderDetailCard(p)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}