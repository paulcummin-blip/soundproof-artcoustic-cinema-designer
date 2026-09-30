// src/components/admin/speaker-db/SpeakerDbProducts.jsx
//
// Products section: list with search/filter/sort/pagination.
// Clicking a row navigates to the product detail page.
// Specifications are loaded from SpeakerSpecification and merged for display.

import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import SpeakerDbTable from "@/components/admin/speaker-db/SpeakerDbTable";
import ProductRowActions from "@/components/admin/speaker-db/ProductRowActions.jsx";
import { CompletenessCell, EvidenceCell, ReadinessCell, TextCell } from "@/components/admin/speaker-db/ProductComparisonCells.jsx";
import { comparisonReadiness, evidenceText, powerBasisText, sensitivityText } from "@/components/admin/speaker-db/comparisonReadiness.js";
import { Plus, UserPlus } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  btn: "#1B1A1A",
  btnText: "#FFFFFF",
};

function StatusBadge({ status }) {
  const colors = {
    Current: BRAND.green,
    Discontinued: BRAND.subtext,
    "Coming Soon": "#9A6E00",
    Hidden: "#625143",
    Archived: "#625143",
    Unknown: BRAND.subtext,
  };
  const color = colors[status] || BRAND.subtext;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: color + "15", color }}>
      {status || "Unknown"}
    </span>
  );
}

function RoleBadge({ role }) {
  if (!role) return <span style={{ color: BRAND.subtext }}>—</span>;
  const colors = {
    LCR: BRAND.green,
    Surround: "#9A6E00",
    Both: BRAND.green,
    Wide: BRAND.subtext,
    Height: BRAND.subtext,
    Flexible: BRAND.subtext,
  };
  const color = colors[role] || BRAND.subtext;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: color + "15", color }}>{role}</span>;
}

function ConfidenceBadge({ confidence }) {
  if (!confidence) return <span style={{ color: BRAND.subtext }}>—</span>;
  const colors = { A: BRAND.green, B: "#9A6E00", C: BRAND.subtext, D: "#B23A3A" };
  const color = colors[confidence] || BRAND.subtext;
  return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold" style={{ background: color + "15", color }}>{confidence}</span>;
}

function ApprovalBadge({ status }) {
  if (!status) return <span style={{ color: BRAND.subtext }}>—</span>;
  const colors = { Draft: BRAND.subtext, "Awaiting Review": "#9A6E00", Approved: BRAND.green, Superseded: "#625143", Archived: "#625143" };
  const color = colors[status] || BRAND.subtext;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: color + "15", color }}>{status}</span>;
}

export default function SpeakerDbProducts({ drillFilter, onClearDrillFilter }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Each row carries its own product and current specification so the
  // comparison-readiness classification is derived exactly the way the RP22
  // Speaker Capability page derives the grades a dealer sees.
  const loadProducts = useCallback(async () => {
    try {
      const [products, specs] = await Promise.all([
        base44.entities.SpeakerProduct.list("-updated_date", 500),
        base44.entities.SpeakerSpecification.list("-created_date", 500),
      ]);

      // Build a map of product_id → current specification
      const specMap = {};
      (specs || []).forEach((s) => {
        if (!specMap[s.product_id] || s.is_current) {
          specMap[s.product_id] = s;
        }
      });

      const merged = (products || []).map((p) => {
        const spec = specMap[p.id] || null;
        const readiness = comparisonReadiness({ product: p, specification: spec });
        return {
          ...p,
          product: p,
          spec,
          sensitivity_db: spec?.sensitivity_db ?? null,
          max_continuous_spl_db: spec?.max_continuous_spl_db ?? null,
          confidence: spec?.confidence ?? null,
          frequency_response_low_hz: spec?.frequency_response_low_hz ?? null,
          frequency_response_high_hz: spec?.frequency_response_high_hz ?? null,
          nominal_impedance_ohm: spec?.nominal_impedance_ohm ?? null,
          approval_status: spec?.approval_status ?? null,
          readiness,
          readiness_label: readiness.label,
          readiness_rank: { A: 1, B: 2, C: 3, D: 4 }[readiness.confidence] || 5,
          completeness_rank: readiness.presentCount,
        };
      });

      setRows(merged);
    } catch (err) {
      console.error("[SpeakerDbProducts] Load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Drill-in filter from Manufacturer Health page
  const KEY_SPEC_FIELDS = ["sensitivity_db", "frequency_response_low_hz", "frequency_response_high_hz", "max_continuous_spl_db", "nominal_impedance_ohm"];
  const isProductComplete = (r) => KEY_SPEC_FIELDS.every((f) => r[f] != null && r[f] !== "");
  const filteredRows = drillFilter
    ? rows.filter((r) => r.manufacturer_id === drillFilter.manufacturerId && (!drillFilter.incompleteOnly || !isProductComplete(r)))
    : rows;

  const handleRowClick = (row) => {
    navigate(`/admin/speaker-database/product/${row.id}`);
  };

  const columns = [
    { key: "manufacturer_name", label: "Manufacturer", sortable: true, width: "140px", render: (r) => <span className="font-medium">{r.manufacturer_name || "—"}</span> },
    { key: "full_product_name", label: "Product", sortable: true, render: (r) => <span className="font-medium">{r.full_product_name || r.model}</span> },
    { key: "role", label: "Role", sortable: true, width: "90px", render: (r) => <RoleBadge role={r.role} /> },
    { key: "sensitivity_db", label: "Sensitivity", sortable: true, width: "120px", render: (r) => <TextCell value={sensitivityText(r.spec)} /> },
    { key: "power_basis", label: "Power / Max SPL basis", width: "170px", render: (r) => <TextCell value={powerBasisText(r.spec)} /> },
    { key: "completeness_rank", label: "Completeness", sortable: true, width: "100px", render: (r) => <CompletenessCell readiness={r.readiness} /> },
    { key: "readiness_rank", label: "RP22 Readiness", sortable: true, width: "185px", render: (r) => <ReadinessCell readiness={r.readiness} /> },
    { key: "confidence", label: "Evidence", sortable: true, width: "155px", render: (r) => <EvidenceCell readiness={r.readiness} text={evidenceText(r.readiness)} /> },
    { key: "approval_status", label: "Approval", sortable: true, width: "115px", render: (r) => <ApprovalBadge status={r.approval_status} /> },
    { key: "actions", label: "Actions", width: "215px", render: (r) => <ProductRowActions row={r} onChanged={loadProducts} /> },
  ];

  return (
    <div>
      {drillFilter && (
        <div className="flex items-center justify-between mb-4 p-3 rounded-lg" style={{ border: `1px solid ${BRAND.border}`, background: "#F8F8F7" }}>
          <div className="text-sm" style={{ color: BRAND.text }}>
            Showing incomplete products for <span className="font-medium">{drillFilter.manufacturerName}</span>
          </div>
          <button onClick={onClearDrillFilter} className="text-sm underline" style={{ color: BRAND.green }}>Show all products</button>
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm" style={{ color: BRAND.subtext }}>
          {filteredRows.length} product{filteredRows.length !== 1 ? "s" : ""}
          <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 2 }}>
            Readiness is measured against the fields the RP22 engine consumes — the same ones every Artcoustic row supplies.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/admin/speaker-database/add-speaker")}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            style={{ background: BRAND.green, color: "#fff" }}
          >
            <UserPlus className="w-4 h-4" /> Add Speaker
          </button>
          <button
            onClick={() => navigate("/admin/speaker-database/product/new")}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.card }}
          >
            <Plus className="w-4 h-4" /> Quick Add
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: BRAND.subtext }}>Loading…</div>
      ) : (
        <SpeakerDbTable
          columns={columns}
          rows={filteredRows}
          searchableKeys={["manufacturer_name", "full_product_name", "model", "series", "readiness_label"]}
          filters={[
            { key: "readiness_label", label: "RP22 readiness", options: [
              { value: "Comparable", label: "Comparable" },
              { value: "Partially Comparable", label: "Partially Comparable" },
              { value: "ADI Estimate", label: "ADI Estimate" },
              { value: "Insufficient Data", label: "Insufficient Data" },
            ]},
            { key: "role", label: "Role", options: [
              { value: "LCR", label: "LCR" },
              { value: "Surround", label: "Surround" },
              { value: "Both", label: "Both" },
              { value: "Wide", label: "Wide" },
              { value: "Height", label: "Height" },
              { value: "Flexible", label: "Flexible" },
            ]},
            { key: "approval_status", label: "Approval", options: [
              { value: "Draft", label: "Draft" },
              { value: "Awaiting Review", label: "Awaiting Review" },
              { value: "Approved", label: "Approved" },
              { value: "Superseded", label: "Superseded" },
              { value: "Archived", label: "Archived" },
            ]},
          ]}
          rowKey={(r) => r.id}
          onRowClick={handleRowClick}
        />
      )}
    </div>
  );
}