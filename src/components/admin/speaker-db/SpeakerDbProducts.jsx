// src/components/admin/speaker-db/SpeakerDbProducts.jsx
//
// Products section: list with search/filter/sort/pagination.
// Clicking a row navigates to the product detail page.
// Specifications are loaded from SpeakerSpecification and merged for display.

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import SpeakerDbTable from "@/components/admin/speaker-db/SpeakerDbTable";
import { Plus } from "lucide-react";

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

  useEffect(() => {
    (async () => {
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

        // Merge product + spec for display
        const merged = (products || []).map((p) => ({
          ...p,
          sensitivity_db: specMap[p.id]?.sensitivity_db ?? null,
          max_continuous_spl_db: specMap[p.id]?.max_continuous_spl_db ?? null,
          confidence: specMap[p.id]?.confidence ?? null,
          frequency_response_low_hz: specMap[p.id]?.frequency_response_low_hz ?? null,
          frequency_response_high_hz: specMap[p.id]?.frequency_response_high_hz ?? null,
          nominal_impedance_ohm: specMap[p.id]?.nominal_impedance_ohm ?? null,
          approval_status: specMap[p.id]?.approval_status ?? null,
        }));

        setRows(merged);
      } catch (err) {
        console.error("[SpeakerDbProducts] Load failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
    { key: "manufacturer_name", label: "Manufacturer", sortable: true, width: "160px", render: (r) => <span className="font-medium">{r.manufacturer_name || "—"}</span> },
    { key: "full_product_name", label: "Product", sortable: true, render: (r) => <span className="font-medium">{r.full_product_name || r.model}</span> },
    { key: "category", label: "Category", sortable: true, width: "110px", render: (r) => r.category || "—" },
    { key: "role", label: "Role", sortable: true, width: "90px", render: (r) => <RoleBadge role={r.role} /> },
    { key: "status", label: "Status", sortable: true, width: "120px", render: (r) => <StatusBadge status={r.status} /> },
    { key: "sensitivity_db", label: "Sensitivity", sortable: true, width: "100px", render: (r) => r.sensitivity_db != null ? `${r.sensitivity_db} dB` : "—" },
    { key: "max_continuous_spl_db", label: "Max SPL", sortable: true, width: "90px", render: (r) => r.max_continuous_spl_db != null ? `${r.max_continuous_spl_db} dB` : "—" },
    { key: "confidence", label: "Conf.", sortable: true, width: "60px", render: (r) => <ConfidenceBadge confidence={r.confidence} /> },
    { key: "approval_status", label: "Approval", sortable: true, width: "100px", render: (r) => <ApprovalBadge status={r.approval_status} /> },
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
        </div>
        <button
          onClick={() => navigate("/admin/speaker-database/product/new")}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors"
          style={{ background: BRAND.btn, color: BRAND.btnText }}
        >
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: BRAND.subtext }}>Loading…</div>
      ) : (
        <SpeakerDbTable
          columns={columns}
          rows={filteredRows}
          searchableKeys={["manufacturer_name", "full_product_name", "model", "series"]}
          filters={[
            { key: "category", label: "Categories", options: [
              { value: "On Wall", label: "On Wall" },
              { value: "In Wall", label: "In Wall" },
              { value: "Freestanding", label: "Freestanding" },
              { value: "Other", label: "Other" },
            ]},
            { key: "role", label: "Role", options: [
              { value: "LCR", label: "LCR" },
              { value: "Surround", label: "Surround" },
              { value: "Both", label: "Both" },
              { value: "Wide", label: "Wide" },
              { value: "Height", label: "Height" },
              { value: "Flexible", label: "Flexible" },
            ]},
            { key: "status", label: "Status", options: [
              { value: "Current", label: "Current" },
              { value: "Discontinued", label: "Discontinued" },
              { value: "Coming Soon", label: "Coming Soon" },
              { value: "Hidden", label: "Hidden" },
              { value: "Archived", label: "Archived" },
              { value: "Unknown", label: "Unknown" },
            ]},
          ]}
          rowKey={(r) => r.id}
          onRowClick={handleRowClick}
        />
      )}
    </div>
  );
}