// src/components/admin/speaker-db/SpeakerDbDataQuality.jsx
//
// Data Quality section: list of all data quality issues across products.
// Filter by severity and status. Update issue status.
// Renamed from SpeakerDbValidation to avoid confusion with RP22 validation.

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
  const colors = {
    Missing: BRAND.red,
    Conflict: BRAND.amber,
    Estimated: BRAND.subtext,
    "Needs Review": BRAND.amber,
    "Out of Date": BRAND.subtext,
    Resolved: BRAND.green,
    Ignored: BRAND.subtext,
  };
  const color = colors[status] || BRAND.subtext;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: color + "15", color }}>{status}</span>;
}

export default function SpeakerDbDataQuality() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.SpeakerDataQuality.list("-created_date", 500);
      setRows(data || []);
    } catch (err) {
      console.error("[SpeakerDbDataQuality] Load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleStatusChange = async (row, newStatus) => {
    try {
      await base44.entities.SpeakerDataQuality.update(row.id, { status: newStatus });
      await loadData();
    } catch (err) {
      console.error("[SpeakerDbDataQuality] Status update failed:", err);
    }
  };

  const columns = [
    { key: "severity", label: "Severity", sortable: true, width: "100px", render: (r) => <div className="flex items-center gap-2"><SeverityIcon severity={r.severity} /><span className="text-sm">{r.severity}</span></div> },
    { key: "field", label: "Field", sortable: true, width: "160px", render: (r) => <span className="font-medium">{r.field}</span> },
    { key: "message", label: "Message", render: (r) => r.message },
    { key: "status", label: "Status", sortable: true, width: "120px", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions", label: "", width: "140px", render: (r) => (
        <select
          value={r.status}
          onChange={(e) => handleStatusChange(r, e.target.value)}
          className="px-2 py-1 rounded text-xs outline-none cursor-pointer"
          style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text, background: BRAND.card }}
        >
          <option value="Missing">Missing</option>
          <option value="Conflict">Conflict</option>
          <option value="Estimated">Estimated</option>
          <option value="Needs Review">Needs Review</option>
          <option value="Out of Date">Out of Date</option>
          <option value="Resolved">Resolved</option>
          <option value="Ignored">Ignored</option>
        </select>
      ),
    },
  ];

  return (
    <div>
      <div className="text-sm mb-4" style={{ color: BRAND.subtext }}>
        {rows.length} data quality issue{rows.length !== 1 ? "s" : ""}
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
              { value: "Missing", label: "Missing" },
              { value: "Conflict", label: "Conflict" },
              { value: "Estimated", label: "Estimated" },
              { value: "Needs Review", label: "Needs Review" },
              { value: "Out of Date", label: "Out of Date" },
              { value: "Resolved", label: "Resolved" },
              { value: "Ignored", label: "Ignored" },
            ]},
          ]}
          rowKey={(r) => r.id}
        />
      )}
    </div>
  );
}