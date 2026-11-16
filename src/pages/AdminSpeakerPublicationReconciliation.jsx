import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { buildComparisonRow } from "@/components/admin/speaker-db/model-first/rp22ComparisonPublish";
import { classifyDataAdequacy } from "@/components/spl/dataAdequacyClassification";
import { normalizeCompetitor } from "@/components/utils/spl/competitorNormalization";

const BRAND = {
  bg: "#F8F8F7", panel: "#FFFFFF", border: "#DCDBD6", text: "#1B1A1A",
  subtext: "#3E4349", hint: "#625143", soft: "#F1F0EE",
  green: "#213428", amber: "#9A6E00", danger: "#B23A3A",
};

// Fields the published snapshot stores, mapped against the spec fields the
// publish path reads. A mismatch means the stored CompetitorSpeaker row differs
// from what a fresh publish would produce — the precise stale-snapshot signal.
const MAPPED_FIELDS = [
  { comp: "sensitivity_value_db", spec: "sensitivity_db", label: "Sensitivity" },
  { comp: "sensitivity_reference", spec: "sensitivity_basis", label: "Sensitivity basis" },
  { comp: "rated_impedance_ohm", spec: "nominal_impedance_ohm", label: "Nominal impedance" },
  { comp: "continuous_power_w", spec: "power_handling_continuous_w", label: "Continuous power" },
  { comp: "published_max_continuous_spl_db_1m", spec: "max_continuous_spl_db", label: "Max continuous SPL" },
  { comp: "published_max_peak_spl_db_1m", spec: "max_peak_spl_db", label: "Max peak SPL" },
  { comp: "recommended_amp_min_w", spec: "recommended_amp_min_w", label: "Rec. amp min" },
  { comp: "recommended_amp_max_w", spec: "recommended_amp_max_w", label: "Rec. amp max" },
];

function norm(v) { return v === null || v === undefined ? "" : String(v); }
function eq(a, b) { return norm(a) === norm(b); }

function itemsOf(result) { return Array.isArray(result) ? result : result?.items || []; }

/**
 * Compare one published CompetitorSpeaker row to what a fresh publish from its
 * current source specification would produce, using the SAME buildComparisonRow
 * mapping the publish path uses. Returns the mismatched fields and the
 * recommended action.
 */
function reconcileRow({ row, product, specification }) {
  const mismatches = [];
  const specStatus = specification?.approval_status || "unknown";

  if (!specification) {
    mismatches.push({ field: "source_specification_id", label: "Source spec", published: row.source_specification_id, expected: "not found", severity: "high" });
  } else {
    const expected = buildComparisonRow({ product, specification, manufacturerName: product?.manufacturer_name || row.manufacturer || "" });
    for (const field of MAPPED_FIELDS) {
      if (!eq(row[field.comp], expected[field.comp])) {
        mismatches.push({
          field: field.comp, label: field.label,
          published: row[field.comp], expected: expected[field.comp],
          severity: "high",
        });
      }
    }
    // Source-spec pointer freshness
    if (product?.current_specification_id && product.current_specification_id !== row.source_specification_id) {
      mismatches.push({
        field: "source_specification_id", label: "Source spec pointer",
        published: row.source_specification_id, expected: product.current_specification_id,
        severity: "medium",
      });
    }
  }

  let action = "none";
  let actionLabel = "In sync";
  if (mismatches.length === 0) {
    action = "none";
    actionLabel = "In sync";
  } else if (specStatus === "Approved") {
    action = "republish";
    actionLabel = "Re-publish from current approved spec";
  } else {
    // Draft / unapproved — do NOT publish technical values to dealers.
    action = "defer";
    actionLabel = "Do not sync — spec is not approved";
  }

  return { mismatches, action, actionLabel, specStatus };
}

function RowCard({ entry }) {
  const tone = entry.mismatches.length === 0 ? BRAND.green
    : entry.action === "defer" ? BRAND.amber : BRAND.danger;
  return (
    <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.panel, padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text }}>{entry.manufacturer} · {entry.model}</div>
          <div style={{ fontSize: 11, color: BRAND.hint, marginTop: 2 }}>
            Current spec: {entry.current_spec_id || "—"} · Published source: {entry.published_source_spec_id || "—"} · Status: {entry.specStatus}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: tone, border: `1px solid ${tone}40`, borderRadius: 999, padding: "3px 10px" }}>
            {entry.mismatches.length === 0 ? "IN SYNC" : entry.action === "defer" ? "DRAFT — DO NOT SYNC" : `${entry.mismatches.length} MISMATCH`}
          </span>
          <span style={{ fontSize: 12, color: BRAND.subtext }}>{entry.actionLabel}</span>
        </div>
      </div>
      {entry.mismatches.length > 0 && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${BRAND.border}`, paddingTop: 10 }}>
          {entry.mismatches.map((m, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr", gap: 8, fontSize: 12, padding: "4px 0", borderBottom: i < entry.mismatches.length - 1 ? `1px solid ${BRAND.soft}` : "none" }}>
              <div style={{ fontWeight: 600, color: BRAND.subtext }}>{m.label}</div>
              <div style={{ color: BRAND.danger }}>Published: <code style={{ fontSize: 11 }}>{norm(m.published) || "(blank)"}</code></div>
              <div style={{ color: BRAND.green }}>Expected: <code style={{ fontSize: 11 }}>{norm(m.expected) || "(blank)"}</code></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminSpeakerPublicationReconciliation() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = itemsOf(await base44.entities.CompetitorSpeaker.list("manufacturer", 500));
      const published = rows.filter((r) =>
        r.publish_source === "speaker_database" && r.published === true && r.active !== false
      );

      const specIds = published.map((r) => r.source_specification_id).filter(Boolean);
      const productIds = published.map((r) => r.source_product_id).filter(Boolean);

      const [specPage, prodPage] = await Promise.all([
        specIds.length ? base44.entities.SpeakerSpecification.filter({ id: { $in: specIds } }) : { items: [] },
        productIds.length ? base44.entities.SpeakerProduct.filter({ id: { $in: productIds } }) : { items: [] },
      ]);

      const specById = new Map(itemsOf(specPage).map((s) => [s.id, s]));
      const prodById = new Map(itemsOf(prodPage).map((p) => [p.id, p]));

      const results = published.map((row) => {
        const product = prodById.get(row.source_product_id) || null;
        const specification = specById.get(row.source_specification_id) || null;
        const rec = reconcileRow({ row, product, specification });
        return {
          key: row.id,
          manufacturer: row.manufacturer,
          model: row.model,
          competitor_id: row.id,
          current_spec_id: product?.current_specification_id || row.source_specification_id,
          published_source_spec_id: row.source_specification_id,
          specStatus: rec.specStatus,
          mismatches: rec.mismatches,
          action: rec.action,
          actionLabel: rec.actionLabel,
        };
      });

      // Show mismatches first, then in-sync rows
      results.sort((a, b) => {
        const am = a.mismatches.length > 0 ? 0 : 1;
        const bm = b.mismatches.length > 0 ? 0 : 1;
        if (am !== bm) return am - bm;
        return String(a.manufacturer).localeCompare(String(b.manufacturer));
      });

      setEntries(results);
    } catch (err) {
      setError(err?.message || "Failed to load reconciliation data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => {
    const mismatched = entries.filter((e) => e.mismatches.length > 0);
    const draftMismatch = mismatched.filter((e) => e.action === "defer");
    const approvedMismatch = mismatched.filter((e) => e.action === "republish");
    return {
      total: entries.length,
      inSync: entries.length - mismatched.length,
      mismatched: mismatched.length,
      draftMismatch: draftMismatch.length,
      approvedMismatch: approvedMismatch.length,
    };
  }, [entries]);

  return (
    <div style={{ minHeight: "100vh", background: BRAND.bg, padding: 24, fontFamily: '"Didact Gothic", "Century Gothic", sans-serif' }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 400, margin: 0, color: BRAND.text }}>Speaker Publication Reconciliation</h1>
            <p style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4 }}>
              Read-only audit of published CompetitorSpeaker snapshots against their current source specifications.
              Draft and unapproved specifications are never synced to the calculator.
            </p>
          </div>
          <button type="button" onClick={load} disabled={loading} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: `1px solid ${BRAND.border}`, background: BRAND.panel, color: BRAND.text, cursor: "pointer", fontSize: 13 }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Refresh
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 18 }}>
          {[
            ["Published rows", summary.total, BRAND.subtext],
            ["In sync", summary.inSync, BRAND.green],
            ["Mismatched", summary.mismatched, BRAND.danger],
            ["Approved — re-publish", summary.approvedMismatch, BRAND.danger],
            ["Draft — do not sync", summary.draftMismatch, BRAND.amber],
          ].map(([label, value, color]) => (
            <div key={label} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, background: BRAND.panel, padding: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: 11, color: BRAND.hint, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ padding: 12, borderRadius: 9, background: BRAND.danger + "10", color: BRAND.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: BRAND.subtext }}>
            <Loader2 className="animate-spin" style={{ display: "inline-block" }} /> Loading reconciliation…
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 18, color: BRAND.subtext, fontSize: 13 }}>No published Speaker Database rows found.</div>
        ) : (
          <div>
            {entries.map((entry) => <RowCard key={entry.key} entry={entry} />)}
          </div>
        )}
      </div>
    </div>
  );
}