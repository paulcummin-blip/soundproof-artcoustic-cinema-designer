// src/components/admin/speaker-db/SpeakerDbTable.jsx
//
// Reusable data table with search, filter, sort, and pagination.
// Modern Sound Proof card style — not a spreadsheet grid.
// Props:
//   columns: [{ key, label, sortable, render?(row), width? }]
//   rows: array of data objects
//   searchableKeys: array of row keys to search across
//   filters: [{ key, label, options: [{value, label}] }]
//   rowKey: function(row) => unique key
//   onRowClick: function(row)
//   pageSize: number (default 10)

import React, { useState, useMemo } from "react";
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  card: "#FFFFFF",
  green: "#213428",
  hover: "#F8F8F7",
};

export default function SpeakerDbTable({
  columns,
  rows,
  searchableKeys = [],
  filters = [],
  rowKey,
  onRowClick,
  pageSize = 10,
}) {
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState({});
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(0);

  // Filter rows by search
  const searched = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase().trim();
    return rows.filter((row) =>
      searchableKeys.some((key) => {
        const val = row[key];
        if (val == null) return false;
        return String(val).toLowerCase().includes(q);
      })
    );
  }, [rows, search, searchableKeys]);

  // Filter rows by dropdown filters
  const filtered = useMemo(() => {
    let result = searched;
    for (const [key, value] of Object.entries(filterValues)) {
      if (!value || value === "all") continue;
      result = result.filter((row) => String(row[key]) === value);
    }
    return result;
  }, [searched, filterValues]);

  // Sort rows
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = useMemo(
    () => sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
    [sorted, currentPage, pageSize]
  );

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleSearch = (val) => {
    setSearch(val);
    setPage(0);
  };

  const handleFilter = (key, val) => {
    setFilterValues((prev) => ({ ...prev, [key]: val }));
    setPage(0);
  };

  return (
    <div>
      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: BRAND.subtext }} />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-md text-sm outline-none"
            style={{
              border: `1px solid ${BRAND.border}`,
              background: BRAND.card,
              color: BRAND.text,
            }}
          />
        </div>
        {filters.map((f) => (
          <select
            key={f.key}
            value={filterValues[f.key] || "all"}
            onChange={(e) => handleFilter(f.key, e.target.value)}
            className="px-3 py-2 rounded-md text-sm outline-none cursor-pointer"
            style={{
              border: `1px solid ${BRAND.border}`,
              background: BRAND.card,
              color: BRAND.text,
            }}
          >
            <option value="all">All {f.label}</option>
            {f.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ))}
      </div>

      {/* Table */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}
      >
        {/* Header */}
        <div
          className="flex items-center"
          style={{ borderBottom: `1px solid ${BRAND.border}`, background: BRAND.hover }}
        >
          {columns.map((col) => (
            <div
              key={col.key}
              className="px-4 py-3 text-xs font-semibold uppercase tracking-wide flex items-center gap-1"
              style={{
                color: BRAND.subtext,
                width: col.width,
                flex: col.width ? undefined : 1,
                cursor: col.sortable ? "pointer" : "default",
                userSelect: "none",
              }}
              onClick={() => col.sortable && handleSort(col.key)}
            >
              {col.label}
              {col.sortable && sortKey === col.key && (
                sortDir === "asc"
                  ? <ChevronUp className="w-3 h-3" />
                  : <ChevronDown className="w-3 h-3" />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        {pageRows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm" style={{ color: BRAND.subtext }}>
            No records found.
          </div>
        ) : (
          pageRows.map((row, idx) => (
            <div
              key={rowKey ? rowKey(row) : idx}
              className="flex items-center transition-colors"
              style={{
                borderBottom: idx < pageRows.length - 1 ? `1px solid ${BRAND.border}` : "none",
                cursor: onRowClick ? "pointer" : "default",
                background: BRAND.card,
              }}
              onMouseEnter={(e) => { if (onRowClick) e.currentTarget.style.background = BRAND.hover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.card; }}
              onClick={() => onRowClick && onRowClick(row)}
            >
              {columns.map((col) => (
                <div
                  key={col.key}
                  className="px-4 py-3 text-sm"
                  style={{
                    width: col.width,
                    flex: col.width ? undefined : 1,
                    color: BRAND.text,
                  }}
                >
                  {col.render ? col.render(row) : String(row[col.key] ?? "")}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {sorted.length > pageSize && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-xs" style={{ color: BRAND.subtext }}>
            {sorted.length} record{sorted.length !== 1 ? "s" : ""} · Showing{" "}
            {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, sorted.length)}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, currentPage - 1))}
              disabled={currentPage === 0}
              className="p-1.5 rounded-md transition-colors disabled:opacity-30"
              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs" style={{ color: BRAND.subtext }}>
              Page {currentPage + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
              disabled={currentPage >= totalPages - 1}
              className="p-1.5 rounded-md transition-colors disabled:opacity-30"
              style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}