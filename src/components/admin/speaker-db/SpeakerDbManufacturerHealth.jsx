// src/components/admin/speaker-db/SpeakerDbManufacturerHealth.jsx
//
// Manufacturer Health section for the Speaker Database.
// Shows per-manufacturer completeness stats so the admin can see at a glance
// which manufacturers need attention, rather than browsing the full product list.
//
// Columns: Manufacturer, Products, Complete %, Missing, Warnings, Last Update.
// Clicking a manufacturer row drills into the Products tab filtered to that
// manufacturer's incomplete products only.

import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { calculateQualityScore } from "@/components/admin/speaker-db/speakerDbQualityScore";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  amber: "#9A6E00",
  red: "#B23A3A",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
};

// Key spec fields that must all be present for a product to be "complete".
const KEY_SPEC_FIELDS = [
  "sensitivity_db",
  "frequency_response_low_hz",
  "frequency_response_high_hz",
  "max_continuous_spl_db",
  "nominal_impedance_ohm",
];

function isSpecComplete(spec) {
  if (!spec) return false;
  return KEY_SPEC_FIELDS.every(
    (f) => spec[f] != null && spec[f] !== ""
  );
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 24 && date.getDate() === now.getDate()) return "Today";
  if (diffHours < 48) return "Yesterday";
  if (diffHours < 7 * 24) return `${Math.floor(diffHours / 24)} days ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function CompleteBadge({ percent }) {
  let color = BRAND.green;
  if (percent < 90) color = BRAND.amber;
  if (percent < 75) color = BRAND.red;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: color + "15", color }}
    >
      {percent}%
    </span>
  );
}

export default function SpeakerDbManufacturerHealth({ onDrillInto }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [manufacturers, products, specs, dataQuality, history] = await Promise.all([
          base44.entities.SpeakerManufacturer.list("name", 500),
          base44.entities.SpeakerProduct.list("-created_date", 500),
          base44.entities.SpeakerSpecification.list("-created_date", 500),
          base44.entities.SpeakerDataQuality.list("-created_date", 500),
          base44.entities.SpeakerChangeHistory.list("-created_date", 500),
        ]);

        if (!mounted) return;

        // Build spec map: product_id → current spec
        const specMap = {};
        (specs || []).forEach((s) => {
          if (!specMap[s.product_id] || s.is_current) {
            specMap[s.product_id] = s;
          }
        });

        // Build data-quality map: product_id → array of open issues
        const dqMap = {};
        (dataQuality || []).forEach((dq) => {
          if (dq.status === "Resolved" || dq.status === "Ignored") return;
          if (!dqMap[dq.product_id]) dqMap[dq.product_id] = [];
          dqMap[dq.product_id].push(dq);
        });

        // Build last-update map: product_id → most recent change date
        const lastUpdateMap = {};
        (history || []).forEach((h) => {
          const pid = h.product_id;
          if (!pid) return;
          if (!lastUpdateMap[pid] || new Date(h.created_date) > new Date(lastUpdateMap[pid])) {
            lastUpdateMap[pid] = h.created_date;
          }
        });

        // Group products by manufacturer
        const productsByMfr = {};
        (products || []).forEach((p) => {
          const mid = p.manufacturer_id;
          if (!mid) return;
          if (!productsByMfr[mid]) productsByMfr[mid] = [];
          productsByMfr[mid].push(p);
        });

        const mfrRows = (manufacturers || []).map((m) => {
          const mfrProducts = productsByMfr[m.id] || [];
          const total = mfrProducts.length;
          const completeCount = mfrProducts.filter((p) => isSpecComplete(specMap[p.id])).length;
          const missing = total - completeCount;
          const warnings = mfrProducts.reduce((acc, p) => acc + (dqMap[p.id]?.length || 0), 0);
          const allMfrIssues = mfrProducts.flatMap((p) => dqMap[p.id] || []);
          const qualityScore = calculateQualityScore(allMfrIssues);
          const lastUpdate = mfrProducts.reduce((latest, p) => {
            const d = lastUpdateMap[p.id];
            if (!d) return latest;
            if (!latest || new Date(d) > new Date(latest)) return d;
            return latest;
          }, null);
          const percent = total > 0 ? Math.round((completeCount / total) * 100) : 0;

          return {
            id: m.id,
            name: m.name,
            productCount: total,
            percent,
            missing,
            warnings,
            qualityScore,
            lastUpdate,
          };
        });

        // Sort by product count descending, then name
        mfrRows.sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name));
        setRows(mfrRows);
      } catch (err) {
        console.error("[SpeakerDbManufacturerHealth] Load failed:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleClick = (row) => {
    if (onDrillInto && row.productCount > 0) {
      onDrillInto(row.id, row.name);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-sm" style={{ color: BRAND.subtext }}>Loading manufacturer health…</div>;
  }

  return (
    <div>
      <div className="text-sm mb-4" style={{ color: BRAND.subtext }}>
        {rows.length} manufacturer{rows.length !== 1 ? "s" : ""}. Click a row to view its incomplete products.
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center text-sm" style={{ color: BRAND.subtext }}>No manufacturers found.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BRAND.border}` }}>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.subtext }}>Manufacturer</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.subtext }}>Products</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.subtext }}>Complete</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.subtext }}>Quality Score</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.subtext }}>Missing</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.subtext }}>Warnings</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.subtext }}>Last Update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => handleClick(row)}
                  className="transition-colors"
                  style={{
                    borderBottom: `1px solid ${BRAND.border}`,
                    cursor: row.productCount > 0 ? "pointer" : "default",
                  }}
                  onMouseEnter={(e) => { if (row.productCount > 0) e.currentTarget.style.background = "#F8F8F7"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: BRAND.subtext }} />
                      <span className="font-medium" style={{ color: BRAND.text }}>{row.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: BRAND.text }}>{row.productCount}</td>
                  <td className="px-4 py-3 text-right">
                    {row.productCount > 0 ? <CompleteBadge percent={row.percent} /> : <span style={{ color: BRAND.subtext }}>—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.productCount > 0 ? <CompleteBadge percent={row.qualityScore} /> : <span style={{ color: BRAND.subtext }}>—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.missing > 0 ? (
                      <span className="inline-flex items-center gap-1" style={{ color: BRAND.amber }}>
                        <XCircle className="w-3.5 h-3.5" />{row.missing}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1" style={{ color: BRAND.green }}>
                        <CheckCircle className="w-3.5 h-3.5" />0
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.warnings > 0 ? (
                      <span className="inline-flex items-center gap-1" style={{ color: BRAND.amber }}>
                        <AlertTriangle className="w-3.5 h-3.5" />{row.warnings}
                      </span>
                    ) : (
                      <span style={{ color: BRAND.subtext }}>0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: BRAND.subtext }}>{formatRelativeDate(row.lastUpdate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}