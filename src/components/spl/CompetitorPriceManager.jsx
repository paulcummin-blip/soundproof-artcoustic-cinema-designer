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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Search, Plus, Upload, Pencil, Trash2, Loader2, Sparkles, ExternalLink } from "lucide-react";
import { loadComparisonCandidates } from "@/components/utils/spl/speakerDbComparisonCandidates";
import { saveCandidatePrice } from "@/components/spl/comparisonPriceRecord";
import { classifyDataAdequacy } from "@/components/spl/dataAdequacyClassification";
import ReadWithAdiDialog from "@/components/spl/ReadWithAdiDialog";
import BatchReadSourcesDialog from "@/components/spl/BatchReadSourcesDialog";
import BulkDeleteCompetitorDialog from "@/components/spl/BulkDeleteCompetitorDialog";
import { useAuth } from "@/lib/AuthContext";
import SpeakerFormDialog from "@/components/admin/speaker-library/SpeakerFormDialog";
import BulkAddSpeakersDialog from "@/components/admin/speaker-library/BulkAddSpeakersDialog";
import { describeRemoval, removeSpeakerFromLibrary } from "@/components/admin/speaker-library/removeSpeakerFromLibrary";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const BRAND = {
  panel: "#FFFFFF",
  border: "#DCDBD6",
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
  soft: "#F1F0EE",
};

// Columns: Checkbox, Manufacturer, Model, Sens, Power, Max SPL, Data, Retail, Source, Actions
const TABLE_GRID = "34px minmax(100px, 1fr) minmax(120px, 1.2fr) 64px 60px 60px 68px 92px 116px 168px";

const DASH = "—";
const hasVal = (value) => value !== null && value !== undefined && String(value).trim() !== "";

/** The source URL a row carries, preferring source_url then datasheet_url. */
const sourceUrlOf = (candidate) =>
  candidate?.record?.source_url
  || candidate?.sourceUrl
  || candidate?.record?.datasheet_url
  || candidate?.datasheetUrl
  || "";

/** Whether the row already carries any P12/P13 technical value. */
const hasTechnicalValues = (record) => {
  const r = record || {};
  return hasVal(r.sensitivity_value_db)
    || hasVal(r.power_authority_w)
    || hasVal(r.published_max_continuous_spl_db_1m)
    || hasVal(r.halfspace_published_max_continuous_spl_db_1m);
};

function sensitivityText(record) {
  const v = record?.sensitivity_value_db;
  if (!hasVal(v)) return DASH;
  const ref = hasVal(record?.sensitivity_reference) ? record.sensitivity_reference : "";
  return ref ? `${v} dB` : `${v} dB`;
}

function powerText(record) {
  const v = record?.power_authority_w;
  if (!hasVal(v)) return DASH;
  return `${v} W`;
}

function splText(record) {
  const v = record?.published_max_continuous_spl_db_1m ?? record?.halfspace_published_max_continuous_spl_db_1m;
  return hasVal(v) ? `${v} dB` : DASH;
}

/** Build a row object the SpeakerFormDialog expects from a comparison candidate. */
function candidateToFormRow(candidate) {
  return {
    key: candidate.id,
    rowId: candidate.priceRecordId || null,
    productId: candidate.productId || null,
    specificationId: candidate.specificationId || null,
    manufacturer: candidate.manufacturer || "",
    model: candidate.model || "",
    price: candidate.record?.retail_price_inc_vat ?? null,
    record: candidate.record || null,
    specification: null,
    product: null,
  };
}

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

  const { user } = useAuth();
  const actorName = user?.full_name || user?.email || "Administrator";

  const [formOpen, setFormOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [removal, setRemoval] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState("");
  const [adiCandidate, setAdiCandidate] = useState(null);
  const [batchReadOpen, setBatchReadOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // The list is the RP22 selection list itself — the same candidate builder the
  // comparison dropdown uses, including the database products a master admin can
  // select before they are published — so no selectable speaker can be missing.
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    setRowError(null);
    try {
      const list = await loadComparisonCandidates({ includeUnpublished: true });
      setCandidates(list);
      setDrafts({});
      return list;
    } catch (e) {
      setCandidates([]);
      setError(e?.message || "Could not load the comparison speakers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) reload(); }, [open, reload]);

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

  // The set of candidate ids currently visible after search/manufacturer
  // filtering. "Select all visible" toggles exactly these, so a filtered view
  // (e.g. a bad-import manufacturer) selects only the filtered rows.
  const visibleIds = useMemo(() => {
    const ids = new Set();
    for (const group of groups) for (const row of group.rows) ids.add(row.id);
    return ids;
  }, [groups]);

  const allVisibleSelected = visibleIds.size > 0 && [...visibleIds].every((id) => selectedIds.has(id));
  const someVisibleSelected = selectedIds.size > 0 && [...visibleIds].some((id) => selectedIds.has(id));

  const toggleRow = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selectedIds.has(c.id)),
    [candidates, selectedIds],
  );

  const handleBulkDeleteDone = async ({ removedCount, skippedCount, failedCount }) => {
    setBulkDeleteOpen(false);
    const parts = [];
    if (removedCount) parts.push(`Removed ${removedCount}`);
    if (skippedCount) parts.push(`skipped ${skippedCount} referenced`);
    if (failedCount) parts.push(`${failedCount} failed`);
    setNotice(parts.length ? parts.join(" · ") + "." : "No speakers removed.");
    clearSelection();
    await reload();
    setTimeout(() => setNotice(""), 4500);
  };

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

  // ---- Admin management actions (add / edit / bulk / delete) ----------------
  // These reach the same CompetitorSpeaker records the list is built from, so a
  // saved speaker appears in the RP22 dropdown on the next reload without any
  // separate publication step. Only an admin can reach this panel and only an
  // admin can write to CompetitorSpeaker (RLS), so no extra guard is needed here.
  const openAdd = () => { setEditingRow(null); setFormOpen(true); };
  const openEdit = (candidate) => { setEditingRow(candidateToFormRow(candidate)); setFormOpen(true); };
  const openBulk = () => setBulkOpen(true);
  const openReadWithAdi = (candidate) => setAdiCandidate(candidate);

  // After "Save & Read with ADI" from the add form: the new product is on disk,
  // reload the candidate list, then open the proposal dialog for that row.
  const handleReadWithAdiAfterSave = async ({ manufacturer, model }) => {
    const list = await reload();
    const found = (list || []).find((c) => String(c.manufacturer || "") === String(manufacturer)
      && String(c.model || "") === String(model));
    if (found) setAdiCandidate(found);
  };

  const handleSaved = async () => {
    setFormOpen(false);
    setEditingRow(null);
    setNotice("Speaker saved.");
    await reload();
    setTimeout(() => setNotice(""), 3500);
  };

  const handleBulkDone = async (summary) => {
    setBulkOpen(false);
    const added = summary?.created || 0;
    setNotice(added ? `Added ${added} speaker${added === 1 ? "" : "s"}.` : "No speakers added.");
    await reload();
    setTimeout(() => setNotice(""), 3500);
  };

  const askDelete = async (candidate) => {
    setPendingDelete(candidate);
    setRemoval(null);
    setRemoving(true);
    try {
      const probe = {
        productId: candidate.productId || null,
        product: candidate.productId ? { id: candidate.productId } : null,
        rowId: candidate.priceRecordId || null,
        manufacturer: candidate.manufacturer || "",
        model: candidate.model || "",
      };
      const described = await describeRemoval(probe);
      setRemoval(described);
    } catch (e) {
      setRemoval({ error: e?.message || "Could not assess this speaker." });
    } finally {
      setRemoving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setRemoving(true);
    try {
      const probe = {
        productId: pendingDelete.productId || null,
        product: pendingDelete.productId ? { id: pendingDelete.productId } : null,
        rowId: pendingDelete.priceRecordId || null,
        manufacturer: pendingDelete.manufacturer || "",
        model: pendingDelete.model || "",
      };
      await removeSpeakerFromLibrary({ row: probe, actorName });
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(pendingDelete.id); return next; });
      setNotice(`Removed ${pendingDelete.manufacturer || ""} ${pendingDelete.model || ""}.`.trim());
      setPendingDelete(null);
      setRemoval(null);
      await reload();
      setTimeout(() => setNotice(""), 3500);
    } catch (e) {
      setRemoval({ error: e?.message || "Could not remove this speaker." });
    } finally {
      setRemoving(false);
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

  const iconBtn = {
    border: `1px solid ${BRAND.border}`,
    borderRadius: 8,
    padding: 6,
    background: "#FFF",
    color: BRAND.subtext,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div style={{ marginTop: 14, background: BRAND.panel, border: `1px solid ${BRAND.border}`, borderRadius: 14 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", border: 0, background: "transparent", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: BRAND.text }}
      >
        <span style={{ fontWeight: 700 }}>Admin · Manage Competitor Speakers</span>
        {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${BRAND.border}`, padding: 18 }}>
          <div style={{ fontSize: 12, color: BRAND.hint, marginBottom: 12 }}>{PRICE_BASIS_LABEL}</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
            <button type="button" onClick={openAdd} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, border: `1px solid ${BRAND.text}`, background: BRAND.text, color: "#FFF", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
              <Plus size={15} /> Add speaker
            </button>
            <button type="button" onClick={openBulk} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, border: `1px solid ${BRAND.border}`, background: "#FFF", color: BRAND.text, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
              <Upload size={15} /> Add multiple
            </button>
            <button type="button" onClick={() => setBatchReadOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, border: `1px solid ${BRAND.text}`, background: BRAND.text, color: "#FFF", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
              <Sparkles size={15} /> Read all incomplete
            </button>
            {notice && <div style={{ fontSize: 12, color: "#213428" }}>{notice}</div>}
          </div>

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

          {selectedIds.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", marginBottom: 10, border: `1px solid ${BRAND.text}`, borderRadius: 10, background: BRAND.soft }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: 0, background: "#7A1E19", color: "#FFF", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}
              >
                <Trash2 size={14} /> Delete selected
              </button>
              <button
                type="button"
                onClick={clearSelection}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${BRAND.border}`, background: "#FFF", color: BRAND.text, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}
              >
                Clear selection
              </button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: TABLE_GRID, gap: 8, padding: "0 4px 8px", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND.hint }}>
            <div>
              <input
                type="checkbox"
                aria-label="Select all visible speakers"
                checked={allVisibleSelected}
                ref={(el) => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected; }}
                onChange={toggleAllVisible}
                disabled={visibleIds.size === 0}
                style={{ cursor: "pointer" }}
              />
            </div>
            <div>Manufacturer</div>
            <div>Speaker model</div>
            <div>Sens.</div>
            <div>Power</div>
            <div>Max SPL</div>
            <div>Data</div>
            <div>Retail (inc VAT)</div>
            <div>Source</div>
            <div style={{ textAlign: "right" }}>Actions</div>
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
                      background: selectedIds.has(candidate.id) ? "#F4F8F3" : (savedId === candidate.id ? "#F4F8F3" : "#FFF"),
                    }}
                  >
                    <div>
                      <input
                        type="checkbox"
                        aria-label={`Select ${candidate.manufacturer || ""} ${candidate.model || ""}`.trim()}
                        checked={selectedIds.has(candidate.id)}
                        onChange={() => toggleRow(candidate.id)}
                        style={{ cursor: "pointer" }}
                      />
                    </div>
                    <div style={{ fontSize: 14, color: BRAND.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{candidate.manufacturer || "—"}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text, minWidth: 0 }}>{candidate.model || "—"}</div>
                    <div style={{ fontSize: 13, color: BRAND.subtext }}>{sensitivityText(candidate.record)}</div>
                    <div style={{ fontSize: 13, color: BRAND.subtext }}>{powerText(candidate.record)}</div>
                    <div style={{ fontSize: 13, color: BRAND.subtext }}>{splText(candidate.record)}</div>
                    <div>
                      {(() => {
                        const s = classifyDataAdequacy(candidate.record);
                        return (
                          <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "2px 7px", borderRadius: 999, background: `${s.tone}14`, color: s.tone, whiteSpace: "nowrap" }} title={s.meaning || s.label}>{s.label}</span>
                        );
                      })()}
                    </div>
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
                    <div style={{ fontSize: 12, minWidth: 0, display: "flex", alignItems: "center" }}>
                      {(() => {
                        const url = sourceUrlOf(candidate);
                        if (!url) return (
                          <button type="button" onClick={() => openEdit(candidate)} title="Add source URL" style={{ ...iconBtn, fontSize: 11, padding: "4px 8px", color: BRAND.hint }}>Add source</button>
                        );
                        const short = url.replace(/^https?:\/\//, "");
                        return (
                          <a href={url} target="_blank" rel="noopener noreferrer" title={url} style={{ display: "inline-flex", alignItems: "center", gap: 3, color: BRAND.subtext, textDecoration: "none", fontSize: 11, maxWidth: "100%", overflow: "hidden" }}>
                            <ExternalLink size={11} style={{ flexShrink: 0 }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{short.length > 26 ? short.slice(0, 24) + "…" : short}</span>
                          </a>
                        );
                      })()}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                      {sourceUrlOf(candidate) && (
                        <button
                          type="button"
                          title={hasTechnicalValues(candidate.record) ? "Refresh from source" : "Read source"}
                          onClick={() => openReadWithAdi(candidate)}
                          style={iconBtn}
                          aria-label={hasTechnicalValues(candidate.record) ? "Refresh from source" : "Read source"}
                        ><Sparkles size={14} /></button>
                      )}
                      <button type="button" title="Edit speaker" onClick={() => openEdit(candidate)} style={iconBtn}><Pencil size={14} /></button>
                      <button type="button" title="Remove speaker" onClick={() => askDelete(candidate)} style={iconBtn}><Trash2 size={14} /></button>
                      {savedId === candidate.id && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "#213428" }}><Check size={13} /></span>
                      )}
                      <button
                        type="button"
                        onClick={() => savePrice(candidate)}
                        disabled={savingId === candidate.id || !isDirty(candidate)}
                        style={{
                          border: 0,
                          borderRadius: 8,
                          padding: "7px 12px",
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
                      <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "#7A1E19" }}>{rowError.message}</div>
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

      <SpeakerFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingRow(null); }}
        row={editingRow}
        actorName={actorName}
        onSaved={handleSaved}
        onReadWithAdi={handleReadWithAdiAfterSave}
      />
      <BulkAddSpeakersDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        actorName={actorName}
        onDone={handleBulkDone}
      />
      <ReadWithAdiDialog
        open={Boolean(adiCandidate)}
        onClose={() => setAdiCandidate(null)}
        candidate={adiCandidate}
        actorName={actorName}
        onSaved={reload}
      />
      <BatchReadSourcesDialog
        open={batchReadOpen}
        onClose={() => setBatchReadOpen(false)}
        candidates={candidates}
        actorName={actorName}
        onApplied={async () => { const list = await reload(); return list; }}
      />
      <BulkDeleteCompetitorDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        selectedCandidates={selectedCandidates}
        actorName={actorName}
        onDone={handleBulkDeleteDone}
      />
      <Dialog open={Boolean(pendingDelete)} onOpenChange={(v) => { if (!v) { setPendingDelete(null); setRemoval(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove speaker</DialogTitle>
            <DialogDescription>
              {pendingDelete ? `${pendingDelete.manufacturer || ""} ${pendingDelete.model || ""}`.trim() : ""}
            </DialogDescription>
          </DialogHeader>
          {removing && !removal ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: BRAND.subtext }}><Loader2 size={15} className="animate-spin" /> Checking references…</div>
          ) : removal?.error ? (
            <div style={{ fontSize: 13, color: "#7A1E19" }}>{removal.error}</div>
          ) : removal ? (
            <div style={{ fontSize: 13, color: BRAND.subtext }}>
              <div style={{ fontWeight: 600, color: BRAND.text, marginBottom: 6 }}>{removal.headline}</div>
              <div>{removal.detail}</div>
            </div>
          ) : null}
          <DialogFooter>
            <button type="button" onClick={() => { setPendingDelete(null); setRemoval(null); }} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: "8px 14px", background: "#FFF", color: BRAND.text, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={removing || !removal || Boolean(removal?.error)}
              style={{ border: 0, borderRadius: 8, padding: "8px 14px", background: "#7A1E19", color: "#FFF", cursor: "pointer", fontSize: 13, fontFamily: "inherit", opacity: removing || !removal || removal?.error ? 0.5 : 1 }}
            >
              {removing ? "Removing…" : (removal?.actionLabel || "Remove")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}