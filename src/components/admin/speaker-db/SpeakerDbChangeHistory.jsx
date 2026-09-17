// src/components/admin/speaker-db/SpeakerDbChangeHistory.jsx
//
// Change History section: append-only audit log of all specification changes.
// Read-only with search/filter/sort/pagination.

import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import SpeakerDbTable from "@/components/admin/speaker-db/SpeakerDbTable";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
};

function ChangeTypeBadge({ type }) {
  const colors = { Created: "#213428", Updated: "#9A6E00", Removed: "#B23A3A", "Manual Edit": "#625143" };
  const color = colors[type] || BRAND.subtext;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: color + "15", color }}>{type}</span>;
}

export default function SpeakerDbChangeHistory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await base44.entities.SpeakerChangeHistory.list("-created_date", 500);
        setRows(data || []);
      } catch (err) {
        console.error("[SpeakerDbChangeHistory] Load failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const columns = [
    { key: "created_date", label: "Date", sortable: true, width: "140px", render: (r) => r.created_date ? new Date(r.created_date).toLocaleDateString("en-GB") : "—" },
    { key: "field_changed", label: "Field", sortable: true, width: "180px", render: (r) => <span className="font-medium">{r.field_changed}</span> },
    { key: "old_value", label: "Old Value", width: "150px", render: (r) => r.old_value || "—" },
    { key: "new_value", label: "New Value", width: "150px", render: (r) => r.new_value || "—" },
    { key: "source", label: "Source", sortable: true, width: "120px", render: (r) => r.source || "—" },
    { key: "change_type", label: "Type", sortable: true, width: "120px", render: (r) => <ChangeTypeBadge type={r.change_type} /> },
  ];

  return (
    <div>
      <div className="text-sm mb-4" style={{ color: BRAND.subtext }}>
        {rows.length} change{rows.length !== 1 ? "s" : ""}
      </div>
      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: BRAND.subtext }}>Loading…</div>
      ) : (
        <SpeakerDbTable
          columns={columns}
          rows={rows}
          searchableKeys={["field_changed", "old_value", "new_value", "source"]}
          filters={[
            { key: "change_type", label: "Type", options: [
              { value: "Created", label: "Created" }, { value: "Updated", label: "Updated" },
              { value: "Removed", label: "Removed" }, { value: "Manual Edit", label: "Manual Edit" },
            ]},
          ]}
          rowKey={(r) => r.id}
        />
      )}
    </div>
  );
}