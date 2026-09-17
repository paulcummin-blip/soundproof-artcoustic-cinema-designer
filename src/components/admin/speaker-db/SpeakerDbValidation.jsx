// src/components/admin/speaker-db/SpeakerDbValidation.jsx
//
// Validation section: list of all validation warnings across products.
// Filter by severity and status. Update warning status (Open/Resolved/Ignored).

import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import SpeakerDbTable from "@/components/admin/speaker-db/SpeakerDbTable";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  amber: "#9A6E00",
  red: "#B23A3A",
};

function SeverityIcon({ severity }) {
  if (severity === "Critical") return <AlertCircle className="w-4 h-4" style={{ color: BRAND.red }} />;
  if (severity === "Warning") return <AlertTriangle className="w-4 h-4" style={{ color: BRAND.amber }} />;
  return <Info className="w-4 h-4" style={{ color: BRAND.subtext }} />;
}

function StatusBadge({ status }) {
  const colors = { Open: BRAND.amber, Resolved: BRAND.green, Ignored: BRAND.subtext };
  const color = colors[status] || BRAND.subtext;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: color + "15", color }}>{status}</span>;
}

export default function SpeakerDbValidation() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.SpeakerValidation.list("-created_date", 500);
      setRows(data || []);
    } catch (err) {
      console.error("[SpeakerDbValidation] Load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleStatusChange = async (row, newStatus) => {
    try {
      await base44.entities.SpeakerValidation.update(row.id, { status: newStatus });
      await loadData();
    } catch (err) {
      console.error("[SpeakerDbValidation] Status update failed:", err);
    }
  };

  const columns = [
    { key: "severity", label: "Severity", sortable: true, width: "100px", render: (r) => <div className="flex items-center gap-2"><SeverityIcon severity={r.severity} /><span className="text-sm">{r.severity}</span></div> },
    { key: "field", label: "Field", sortable: true, width: "160px", render: (r) => <span className="font-medium">{r.field}</span> },
    { key: "message", label: "Message", render: (r) => r.message },
    { key: "status", label: "Status", sortable: true, width: "120px", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions", label: "", width: "120px", render: (r) => (
        <select
          value={r.status}
          onChange={(e) => handleStatusChange(r, e.target.value)}
          className="px-2 py-1 rounded text-xs outline-none cursor-pointer"
          style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.card }}
        >
          <option value="Open">Open</option>
          <option value="Resolved">Resolved</option>
          <option value="Ignored">Ignored</option>
        </select>
      ),
    },
  ];

  return (
    <div>
      <div className="text-sm mb-4" style={{ color: BRAND.subtext }}>
        {rows.length} validation warning{rows.length !== 1 ? "s" : ""}
      </div>
      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: BRAND.subtext }}>Loading…</div>
      ) : (
        <SpeakerDbTable
          columns={columns}
          rows={rows}
          searchableKeys={["field", "message"]}
          filters={[
            { key: "severity", label: "Severity", options: [
              { value: "Critical", label: "Critical" }, { value: "Warning", label: "Warning" }, { value: "Information", label: "Information" },
            ]},
            { key: "status", label: "Status", options: [
              { value: "Open", label: "Open" }, { value: "Resolved", label: "Resolved" }, { value: "Ignored", label: "Ignored" },
            ]},
          ]}
          rowKey={(r) => r.id}
        />
      )}
    </div>
  );
}