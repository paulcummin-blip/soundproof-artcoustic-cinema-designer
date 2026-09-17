// src/components/admin/speaker-db/SpeakerDbProducts.jsx
//
// Products section: list with search/filter/sort/pagination.
// Clicking a row navigates to the product detail page.

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
    Unknown: BRAND.subtext,
  };
  const color = colors[status] || BRAND.subtext;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: color + "15", color }}>
      {status || "Unknown"}
    </span>
  );
}

function ConfidenceBadge({ confidence }) {
  if (!confidence) return <span style={{ color: BRAND.subtext }}>—</span>;
  const colors = { A: BRAND.green, B: "#9A6E00", C: BRAND.subtext, D: "#B23A3A" };
  const color = colors[confidence] || BRAND.subtext;
  return <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold" style={{ background: color + "15", color }}>{confidence}</span>;
}

export default function SpeakerDbProducts() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.SpeakerProduct.list("-updated_date", 500);
        setRows(data || []);
      } catch (err) {
        console.error("[SpeakerDbProducts] Load failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleRowClick = (row) => {
    navigate(`/admin/speaker-database/product/${row.id}`);
  };

  const columns = [
    { key: "manufacturer_name", label: "Manufacturer", sortable: true, width: "160px", render: (r) => <span className="font-medium">{r.manufacturer_name || "—"}</span> },
    { key: "full_product_name", label: "Product", sortable: true, render: (r) => <span className="font-medium">{r.full_product_name || r.model}</span> },
    { key: "category", label: "Category", sortable: true, width: "100px", render: (r) => r.category || "—" },
    { key: "status", label: "Status", sortable: true, width: "120px", render: (r) => <StatusBadge status={r.status} /> },
    { key: "sensitivity_db", label: "Sensitivity", sortable: true, width: "100px", render: (r) => r.sensitivity_db != null ? `${r.sensitivity_db} dB` : "—" },
    { key: "max_continuous_spl_db", label: "Max SPL", sortable: true, width: "90px", render: (r) => r.max_continuous_spl_db != null ? `${r.max_continuous_spl_db} dB` : "—" },
    { key: "confidence", label: "Conf.", sortable: true, width: "60px", render: (r) => <ConfidenceBadge confidence={r.confidence} /> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm" style={{ color: BRAND.subtext }}>
          {rows.length} product{rows.length !== 1 ? "s" : ""}
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
          rows={rows}
          searchableKeys={["manufacturer_name", "full_product_name", "model", "series"]}
          filters={[
            { key: "category", label: "Categories", options: [
              { value: "LCR", label: "LCR" }, { value: "On Wall", label: "On Wall" },
              { value: "In Wall", label: "In Wall" }, { value: "Surround", label: "Surround" }, { value: "Other", label: "Other" },
            ]},
            { key: "status", label: "Status", options: [
              { value: "Current", label: "Current" }, { value: "Discontinued", label: "Discontinued" },
              { value: "Coming Soon", label: "Coming Soon" }, { value: "Unknown", label: "Unknown" },
            ]},
          ]}
          rowKey={(r) => r.id}
          onRowClick={handleRowClick}
        />
      )}
    </div>
  );
}