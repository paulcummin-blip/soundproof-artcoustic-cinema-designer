import React from "react";

export const fmt = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "No data";
export const text = (value) => value === null || value === undefined || value === "" ? "No data" : String(value);
export const yesNo = (value) => typeof value === "boolean" ? (value ? "Yes" : "No") : "No data";

export default function DiagnosticTable({ columns, rows = [] }) {
  if (!rows.length) return <div className="py-2 font-mono text-[10px] text-slate-500">No data</div>;
  return <div className="overflow-x-auto"><table className="min-w-full font-mono text-[10px] text-slate-700">
    <thead className="border-b border-slate-300 text-slate-500"><tr>{columns.map((column) => <th key={column.key} className="whitespace-nowrap px-2 py-1 text-left">{column.label}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={row.key || index} className="border-b border-slate-200">{columns.map((column) => <td key={column.key} className="whitespace-nowrap px-2 py-1 align-top">{column.render ? column.render(row) : text(row[column.key])}</td>)}</tr>)}</tbody>
  </table></div>;
}