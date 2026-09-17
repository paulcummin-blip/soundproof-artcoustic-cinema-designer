// src/components/admin/speaker-db/SpeakerDbDashboard.jsx
//
// Dashboard section for the Speaker Capability Database.
// Shows summary statistics: total manufacturers, total products, current,
// discontinued, warnings, missing data, last update, recent changes.

import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Building2, Package, CheckCircle, XCircle, AlertTriangle, HelpCircle, Clock, FileText } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  amber: "#9A6E00",
  red: "#B23A3A",
};

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div
      className="rounded-lg p-5"
      style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex items-center justify-center rounded-md"
          style={{ width: 36, height: 36, background: color + "15" }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.subtext }}>
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold" style={{ color: BRAND.text }}>
        {value}
      </div>
    </div>
  );
}

export default function SpeakerDbDashboard() {
  const [stats, setStats] = useState({
    manufacturers: 0,
    products: 0,
    current: 0,
    discontinued: 0,
    warnings: 0,
    missingData: 0,
    lastUpdate: null,
    recentChanges: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentHistory, setRecentHistory] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [manufacturers, products, validations, history] = await Promise.all([
          base44.entities.SpeakerManufacturer.list("-created_date", 500),
          base44.entities.SpeakerProduct.list("-created_date", 500),
          base44.entities.SpeakerValidation.filter({ status: "Open" }, "-created_date", 500),
          base44.entities.SpeakerChangeHistory.list("-created_date", 10),
        ]);

        if (!mounted) return;

        const productList = products || [];
        const current = productList.filter((p) => p.status === "Current").length;
        const discontinued = productList.filter((p) => p.status === "Discontinued").length;
        const warnings = (validations || []).length;
        const missingData = productList.filter(
          (p) => p.sensitivity_db == null || p.frequency_response_low_hz == null || p.max_continuous_spl_db == null
        ).length;
        const lastUpdate = history && history.length > 0 ? history[0].created_date : null;

        setStats({
          manufacturers: (manufacturers || []).length,
          products: productList.length,
          current,
          discontinued,
          warnings,
          missingData,
          lastUpdate,
          recentChanges: (history || []).length,
        });
        setRecentHistory(history || []);
      } catch (err) {
        console.error("[SpeakerDbDashboard] Load failed:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return <div className="py-12 text-center text-sm" style={{ color: BRAND.subtext }}>Loading dashboard…</div>;
  }

  return (
    <div>
      {/* Stat cards */}
      <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        <StatCard icon={Building2} label="Manufacturers" value={stats.manufacturers} color={BRAND.green} />
        <StatCard icon={Package} label="Total Products" value={stats.products} color={BRAND.green} />
        <StatCard icon={CheckCircle} label="Current" value={stats.current} color={BRAND.green} />
        <StatCard icon={XCircle} label="Discontinued" value={stats.discontinued} color={BRAND.subtext} />
        <StatCard icon={AlertTriangle} label="Products with Warnings" value={stats.warnings} color={BRAND.amber} />
        <StatCard icon={HelpCircle} label="Products Missing Data" value={stats.missingData} color={BRAND.amber} />
      </div>

      {/* Last update + Recent changes */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="rounded-lg p-5" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4" style={{ color: BRAND.subtext }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.subtext }}>
              Last Database Update
            </span>
          </div>
          <div className="text-sm" style={{ color: BRAND.text }}>
            {stats.lastUpdate
              ? new Date(stats.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
              : "No updates yet"}
          </div>
        </div>

        <div className="rounded-lg p-5" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4" style={{ color: BRAND.subtext }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND.subtext }}>
              Recent Changes
            </span>
          </div>
          {recentHistory.length === 0 ? (
            <div className="text-sm" style={{ color: BRAND.subtext }}>No recent changes.</div>
          ) : (
            <div className="space-y-2">
              {recentHistory.slice(0, 5).map((h) => (
                <div key={h.id} className="text-sm flex items-center gap-2" style={{ color: BRAND.text }}>
                  <span className="font-medium">{h.field_changed}</span>
                  <span style={{ color: BRAND.subtext }}>·</span>
                  <span style={{ color: BRAND.subtext }}>{h.change_type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}