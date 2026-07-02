import React from "react";
import DatasetStatusBadge from "@/components/admin/datasets/DatasetStatusBadge";

const BRAND = { text: "#1B1A1A", subtext: "#3E4349", border: "#DCDBD6" };

const COLUMNS = [
  "Dataset", "Speaker", "Measurement Version", "Schema Version",
  "Horizontal Curves", "Vertical Curves", "Health", "Status", "Last Updated",
];

export default function DatasetManagerTable({ rows, selectedDataset, onSelect }) {
  if (!rows.length) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: BRAND.subtext }}>
        No measured datasets discovered.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto", border: `1px solid ${BRAND.border}`, borderRadius: 10, background: "#fff" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#F8F8F7" }}>
            {COLUMNS.map((col) => (
              <th
                key={col}
                style={{
                  textAlign: "left", padding: "10px 14px", color: BRAND.subtext,
                  fontWeight: 700, borderBottom: `1px solid ${BRAND.border}`, whiteSpace: "nowrap",
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = row.datasetName === selectedDataset;
            return (
              <tr
                key={row.datasetName}
                onClick={() => onSelect(row.datasetName)}
                style={{
                  cursor: "pointer",
                  background: isSelected ? "#F0EFEA" : "#fff",
                  borderBottom: `1px solid ${BRAND.border}`,
                }}
              >
                <td style={{ padding: "10px 14px", color: BRAND.text, fontWeight: 600 }}>{row.datasetName}</td>
                <td style={{ padding: "10px 14px", color: BRAND.text }}>{row.speaker}</td>
                <td style={{ padding: "10px 14px", color: BRAND.text }}>{row.measurementVersion}</td>
                <td style={{ padding: "10px 14px", color: BRAND.text }}>{row.schemaVersion}</td>
                <td style={{ padding: "10px 14px", color: BRAND.text }}>{row.horizontalCount}</td>
                <td style={{ padding: "10px 14px", color: BRAND.text }}>{row.verticalCount}</td>
                <td style={{ padding: "10px 14px" }}><DatasetStatusBadge label={row.healthLabel} tone={row.healthTone} /></td>
                <td style={{ padding: "10px 14px" }}><DatasetStatusBadge label={row.statusLabel} tone={row.statusTone} /></td>
                <td style={{ padding: "10px 14px", color: BRAND.subtext }}>{row.lastUpdated}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}