/**
 * CompetitorPriceManager
 * ----------------------
 * Price entry for the RP22 comparison: find a speaker, type its retail price,
 * click Save.
 *
 * The price is written to the comparison row itself — CompetitorSpeaker
 * .retail_price_inc_vat — which is the field the comparison already displays as
 * "Retail inc VAT". So a saved price appears in the comparison straight away
 * and survives a refresh, with one authoritative price per product and no
 * duplicate speaker record. Nothing here creates a product, touches a
 * specification, changes an approval or publication state, or reaches the SPL
 * engine: the graded SPL and the RP22 levels are computed from published
 * acoustic data, never from a price.
 *
 * Basis: retail price including VAT, per speaker, GBP — the comparison's own
 * convention (its import note states "Prices are per speaker, including VAT").
 * A blank entry means no price is set and is stored as null, never as zero.
 * Dealer trade prices are not part of this feature and are never exposed.
 *
 * Administrators only, at both levels: this panel is rendered only for an
 * admin, and the CompetitorSpeaker entity's row-level security permits create,
 * update and delete to admins alone — everyone else can read the prices the
 * comparison shows and cannot change them.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";

const BRAND = {
  panel: "#FFFFFF",
  border: "#DCDBD6",
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
  soft: "#F1F0EE",
};

const TABLE_GRID = "minmax(150px, 1fr) minmax(220px, 1.6fr) 150px 96px";
const PAGE_SIZE = 100;

export const PRICE_BASIS_LABEL = "Retail price including VAT, per speaker · GBP (£)";

export function formatRetailPrice(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "Not set";
  const n = Number(value);
  if (!Number.isFinite(n)) return "Not set";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Parse what the admin typed. Blank clears the price; anything else must be a number. */
export function parsePriceEntry(raw) {
  const trimmed = String(raw ?? "").trim().replace(/[£,\s]/g, "");
  if (trimmed === "") return { value: null, valid: true };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return { value: null, valid: false };
  return { value: n, valid: true };
}

export default function CompetitorPriceManager({ onPriceSaved = null }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [manufacturers, setManufacturers] = useState([]);
  const [search, setSearch] = useState("");
  const [manufacturerFilter, setManufacturerFilter] = useState("");
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [rowError, setRowError] = useState(null);
  const [error, setError] = useState("");

  const buildQuery = useCallback(() => {
    const query = {};
    if (manufacturerFilter) query.manufacturer = manufacturerFilter;
    const term = search.trim();
    if (term) {
      query.$or = [
        { manufacturer: { $regex: term, $options: "i" } },
        { model: { $regex: term, $options: "i" } },
      ];
    }
    return query;
  }, [manufacturerFilter, search]);

  // The manufacturer list is a column value, so it comes from the database
  // rather than from the page currently loaded.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await base44.entities.CompetitorSpeaker.filter({}, { distinct: "manufacturer" });
        const values = Array.isArray(result) ? result : result?.items || [];
        if (!cancelled) setManufacturers(values.filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))));
      } catch {
        if (!cancelled) setManufacturers([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Every search term and filter choice is a fresh server query: the table shows
  // what the database matched, not a subset of whatever happened to be loaded.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const page = await base44.entities.CompetitorSpeaker.filter(buildQuery(), { sort: "manufacturer", limit: PAGE_SIZE });
        const items = Array.isArray(page) ? page : page?.items || [];
        if (cancelled) return;
        setRows(items);
        setCursor(Array.isArray(page) ? null : page?.next_cursor || null);
        setHasMore(Array.isArray(page) ? false : page?.has_more === true);
        setDrafts({});
        setRowError(null);
      } catch (e) {
        if (cancelled) return;
        setRows([]);
        setError(e?.message || "Could not load the comparison library.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search.trim() ? 300 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, buildQuery, search]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await base44.entities.CompetitorSpeaker.filter(buildQuery(), { sort: "manufacturer", limit: PAGE_SIZE, cursor });
      const items = Array.isArray(page) ? page : page?.items || [];
      setRows((prev) => [...prev, ...items]);
      setCursor(Array.isArray(page) ? null : page?.next_cursor || null);
      setHasMore(Array.isArray(page) ? false : page?.has_more === true);
    } catch (e) {
      setError(e?.message || "Could not load more speakers.");
    } finally {
      setLoadingMore(false);
    }
  };

  const valueFor = (row) => (row.id in drafts ? drafts[row.id] : (row.retail_price_inc_vat ?? ""));
  const isDirty = (row) => row.id in drafts
    && String(drafts[row.id]).trim().replace(/[£,\s]/g, "") !== String(row.retail_price_inc_vat ?? "").trim();

  const savePrice = async (row) => {
    const parsed = parsePriceEntry(valueFor(row));
    if (!parsed.valid) {
      setRowError({ id: row.id, message: "Enter a price as a number, or leave it blank." });
      return;
    }
    setSavingId(row.id);
    setRowError(null);
    try {
      await base44.entities.CompetitorSpeaker.update(row.id, {
        retail_price_inc_vat: parsed.value,
        currency: "GBP",
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, retail_price_inc_vat: parsed.value, currency: "GBP" } : r)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setSavedId(row.id);
      onPriceSaved?.(row.id, parsed.value);
      setTimeout(() => setSavedId((current) => (current === row.id ? null : current)), 2500);
    } catch (e) {
      setRowError({ id: row.id, message: e?.message || "Could not save this price." });
    } finally {
      setSavingId(null);
    }
  };

  const inputStyle = {
    width: "100%",
    border: `1px solid ${BRAND.border}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    color: BRAND.text,
    background: "#FFF",
    fontFamily: "inherit",
  };

  return (
    <div style={{ marginTop: 14, background: BRAND.panel, border: `1px solid ${BRAND.border}`, borderRadius: 14 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", border: 0, background: "transparent", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: BRAND.text }}
      >
        <span style={{ fontWeight: 700 }}>Admin · Manage Prices</span>
        {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${BRAND.border}`, padding: 18 }}>
          <div style={{ fontSize: 12, color: BRAND.hint, marginBottom: 12 }}>{PRICE_BASIS_LABEL}</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "8px 11px", background: "#FFF", flex: "1 1 260px" }}>
              <Search size={15} color={BRAND.hint} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search manufacturer or speaker model"
                style={{ border: 0, outline: "none", background: "transparent", fontSize: 14, color: BRAND.text, width: "100%", fontFamily: "inherit" }}
              />
            </label>
            <select
              value={manufacturerFilter}
              onChange={(e) => setManufacturerFilter(e.target.value)}
              style={{ ...inputStyle, width: "auto", minWidth: 200, cursor: "pointer" }}
            >
              <option value="">All manufacturers</option>
              {manufacturers.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: TABLE_GRID, gap: 8, padding: "0 4px 8px", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND.hint }}>
            <div>Manufacturer</div>
            <div>Speaker model</div>
            <div>Retail price (inc VAT)</div>
            <div />
          </div>

          <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: 16, color: BRAND.subtext, fontSize: 13 }}>Loading speakers…</div>
            ) : error ? (
              <div style={{ padding: 16, color: "#7A1E19", fontSize: 13 }}>{error}</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 16, color: BRAND.subtext, fontSize: 13 }}>No speaker matches this search.</div>
            ) : rows.map((row, index) => (
              <div
                key={row.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: TABLE_GRID,
                  gap: 8,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderTop: index === 0 ? 0 : `1px solid ${BRAND.soft}`,
                  background: savedId === row.id ? "#F4F8F3" : "#FFF",
                }}
              >
                <div style={{ fontSize: 14, color: BRAND.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{row.manufacturer || "—"}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text, minWidth: 0 }}>{row.model || "—"}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: BRAND.hint, fontSize: 14 }}>£</span>
                  <input
                    value={valueFor(row)}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") savePrice(row); }}
                    inputMode="numeric"
                    placeholder="Not set"
                    aria-label={`Retail price including VAT for ${row.manufacturer || ""} ${row.model || ""}`.trim()}
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                  {savedId === row.id && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#213428" }}>
                      <Check size={14} /> Saved
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => savePrice(row)}
                    disabled={savingId === row.id || !isDirty(row)}
                    style={{
                      border: 0,
                      borderRadius: 9,
                      padding: "8px 14px",
                      fontSize: 13,
                      fontFamily: "inherit",
                      cursor: isDirty(row) ? "pointer" : "default",
                      background: isDirty(row) ? BRAND.text : BRAND.soft,
                      color: isDirty(row) ? "#FFF" : BRAND.hint,
                    }}
                  >
                    {savingId === row.id ? "Saving…" : "Save"}
                  </button>
                </div>
                {rowError?.id === row.id && (
                  <div style={{ gridColumn: "3 / 5", fontSize: 12, color: "#7A1E19" }}>{rowError.message}</div>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: BRAND.hint }}>
              {rows.length} speaker{rows.length === 1 ? "" : "s"} shown · leave a price blank to clear it
            </div>
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "8px 14px", background: "#FFF", color: BRAND.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}