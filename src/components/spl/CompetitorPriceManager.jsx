/**
 * CompetitorPriceManager
 * ----------------------
 * Price entry for the RP22 comparison: find a speaker, type its retail price,
 * click Save.
 *
 * The list shown here IS the RP22 comparison selection list. It is built by the
 * same candidate builder the comparison dropdown uses, so the two can never
 * drift apart: every speaker that can be selected for comparison appears here
 * exactly once, under the same manufacturer and model names, and a speaker added
 * to the database becomes priceable with no separate maintenance. Legacy records
 * that cannot be selected for comparison are not mixed into this list and keep
 * their existing prices untouched.
 *
 * Each row is resolved to that speaker's own price row, and the price is written
 * to CompetitorSpeaker.retail_price_inc_vat — the field the comparison already
 * displays as "Retail inc VAT". So a saved price appears in the comparison
 * straight away, survives a refresh and stays attached through a specification
 * update or a republication, which updates the same row in place. A speaker with
 * no comparison row yet (a database product not yet published) gets its single
 * price row on first save; that row carries no publish provenance, so it never
 * changes which speakers the comparison offers.
 *
 * Nothing here creates a product, touches a specification, changes an approval
 * or publication state, or reaches the SPL engine: the graded SPL and the RP22
 * levels are computed from published acoustic data, never from a price.
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

import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Search } from "lucide-react";
import { loadComparisonCandidates } from "@/components/utils/spl/speakerDbComparisonCandidates";
import { saveCandidatePrice } from "@/components/spl/comparisonPriceRecord";

const BRAND = {
  panel: "#FFFFFF",
  border: "#DCDBD6",
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
  soft: "#F1F0EE",
};

const TABLE_GRID = "minmax(150px, 1fr) minmax(220px, 1.6fr) 150px 96px";

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
  const [candidates, setCandidates] = useState([]);
  const [search, setSearch] = useState("");
  const [manufacturerFilter, setManufacturerFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [rowError, setRowError] = useState(null);
  const [error, setError] = useState("");

  // The list is the RP22 selection list itself — the same candidate builder the
  // comparison dropdown uses, including the database products a master admin can
  // select before they are published — so no selectable speaker can be missing.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const list = await loadComparisonCandidates({ includeUnpublished: true });
        if (cancelled) return;
        setCandidates(list);
        setDrafts({});
        setRowError(null);
      } catch (e) {
        if (cancelled) return;
        setCandidates([]);
        setError(e?.message || "Could not load the comparison speakers.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Manufacturer names come from the list itself, so they are the comparison's
  // own names rather than whatever a raw record happens to spell.
  const manufacturers = useMemo(() => (
    [...new Set(candidates.map((candidate) => candidate.manufacturer).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), "en", { sensitivity: "base" }))
  ), [candidates]);

  // The list already reads manufacturer A–Z then model A–Z, so a manufacturer
  // group is a run of one manufacturer and the models inside it are alphabetical.
  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const grouped = [];
    for (const candidate of candidates) {
      if (manufacturerFilter && candidate.manufacturer !== manufacturerFilter) continue;
      if (term && !`${candidate.manufacturer || ""} ${candidate.model || ""}`.toLowerCase().includes(term)) continue;
      const name = candidate.manufacturer || "Unattributed";
      const last = grouped[grouped.length - 1];
      if (last && last.manufacturer === name) last.rows.push(candidate);
      else grouped.push({ manufacturer: name, rows: [candidate] });
    }
    return grouped;
  }, [candidates, search, manufacturerFilter]);

  const shownCount = groups.reduce((total, group) => total + group.rows.length, 0);

  const priceOf = (candidate) => (candidate.record?.retail_price_inc_vat ?? "");
  const valueFor = (candidate) => (candidate.id in drafts ? drafts[candidate.id] : priceOf(candidate));
  const isDirty = (candidate) => candidate.id in drafts
    && String(drafts[candidate.id]).trim().replace(/[£,\s]/g, "") !== String(priceOf(candidate)).trim();

  const savePrice = async (candidate) => {
    const parsed = parsePriceEntry(valueFor(candidate));
    if (!parsed.valid) {
      setRowError({ id: candidate.id, message: "Enter a price as a number, or leave it blank." });
      return;
    }
    setSavingId(candidate.id);
    setRowError(null);
    try {
      const { recordId } = await saveCandidatePrice({ candidate, value: parsed.value });
      setCandidates((prev) => prev.map((c) => (c.id === candidate.id
        ? {
          ...c,
          priceRecordId: recordId ?? c.priceRecordId,
          record: { ...c.record, retail_price_inc_vat: parsed.value, currency: "GBP" },
        }
        : c)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[candidate.id];
        return next;
      });
      setSavedId(candidate.id);
      // The candidate id is the key the comparison itself selects by, so the row
      // on screen is refreshed without reloading the list or losing a selection.
      onPriceSaved?.(candidate.id, parsed.value);
      setTimeout(() => setSavedId((current) => (current === candidate.id ? null : current)), 2500);
    } catch (e) {
      setRowError({ id: candidate.id, message: e?.message || "Could not save this price." });
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
            ) : shownCount === 0 ? (
              <div style={{ padding: 16, color: BRAND.subtext, fontSize: 13 }}>
                {candidates.length === 0 ? "No speaker is available to price yet." : "No speaker matches this search."}
              </div>
            ) : groups.map((group) => (
              <div key={group.manufacturer}>
                <div style={{ padding: "8px 12px", background: BRAND.soft, borderTop: `1px solid ${BRAND.border}`, fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: BRAND.hint }}>
                  {group.manufacturer}
                </div>
                {group.rows.map((candidate, index) => (
                  <div
                    key={candidate.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: TABLE_GRID,
                      gap: 8,
                      alignItems: "center",
                      padding: "10px 12px",
                      borderTop: index === 0 ? 0 : `1px solid ${BRAND.soft}`,
                      background: savedId === candidate.id ? "#F4F8F3" : "#FFF",
                    }}
                  >
                    <div style={{ fontSize: 14, color: BRAND.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{candidate.manufacturer || "—"}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text, minWidth: 0 }}>{candidate.model || "—"}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: BRAND.hint, fontSize: 14 }}>£</span>
                      <input
                        value={valueFor(candidate)}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [candidate.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") savePrice(candidate); }}
                        inputMode="numeric"
                        placeholder="Not set"
                        aria-label={`Retail price including VAT for ${candidate.manufacturer || ""} ${candidate.model || ""}`.trim()}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                      {savedId === candidate.id && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#213428" }}>
                          <Check size={14} /> Saved
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => savePrice(candidate)}
                        disabled={savingId === candidate.id || !isDirty(candidate)}
                        style={{
                          border: 0,
                          borderRadius: 9,
                          padding: "8px 14px",
                          fontSize: 13,
                          fontFamily: "inherit",
                          cursor: isDirty(candidate) ? "pointer" : "default",
                          background: isDirty(candidate) ? BRAND.text : BRAND.soft,
                          color: isDirty(candidate) ? "#FFF" : BRAND.hint,
                        }}
                      >
                        {savingId === candidate.id ? "Saving…" : "Save"}
                      </button>
                    </div>
                    {rowError?.id === candidate.id && (
                      <div style={{ gridColumn: "3 / 5", fontSize: 12, color: "#7A1E19" }}>{rowError.message}</div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: BRAND.hint }}>
              {shownCount} speaker{shownCount === 1 ? "" : "s"} shown · {candidates.length} selectable in RP22 Comparison · leave a price blank to clear it
            </div>
          </div>
        </div>
      )}
    </div>
  );
}