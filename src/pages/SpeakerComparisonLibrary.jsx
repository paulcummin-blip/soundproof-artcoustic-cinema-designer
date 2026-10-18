// src/pages/SpeakerComparisonLibrary.jsx
//
// Speaker Comparison Library — the one administrator page for the list of
// competitor loudspeakers compared against Artcoustic on RP22 P12/P13.
//
// Add Speaker → enter what the manufacturer publishes → enter the price →
// Save & Compare. The row is written onto the existing Speaker Database records,
// approved and published through the existing bridge, and is available in the
// comparison straight away. Everything else the old administration exposed
// (health, data-quality dashboards, change history, completeness and approval
// percentages, specification review screens) stays in the underlying records,
// reachable as advanced tooling, and is off the normal path.

import React, { useCallback, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/AuthContext";
import SpeakerLibraryTable from "@/components/admin/speaker-library/SpeakerLibraryTable";
import SpeakerFormDialog from "@/components/admin/speaker-library/SpeakerFormDialog";
import { loadLibraryManufacturers, loadSpeakerLibrary } from "@/components/admin/speaker-library/speakerLibraryRows";
import { describeRemoval, removeSpeakerFromLibrary } from "@/components/admin/speaker-library/removeSpeakerFromLibrary";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  panel: "#FFFFFF",
  green: "#213428",
};

export default function SpeakerComparisonLibrary() {
  const { user, isLoadingAuth } = useAuth();
  const isAdmin = user?.role === "admin";
  const actorName = user?.full_name || user?.email || "Administrator";

  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [manufacturers, setManufacturers] = useState([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [notice, setNotice] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [removal, setRemoval] = useState(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLibraryManufacturers()
      .then((names) => { if (!cancelled) setManufacturers(names); })
      .catch(() => { if (!cancelled) setManufacturers([]); });
    return () => { cancelled = true; };
  }, []);

  // Every search term and filter choice is a fresh server query — the table shows
  // what the database matched, not a subset of whatever happened to be loaded.
  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const page = await loadSpeakerLibrary({ search, manufacturer });
        if (cancelled) return;
        setRows(page.rows);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore);
      } catch (e) {
        if (cancelled) return;
        setRows([]);
        setError(e?.message || "Could not load the comparison library.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search.trim() ? 300 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isAdmin, search, manufacturer, reloadToken]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await loadSpeakerLibrary({ search, manufacturer, cursor });
      setRows((prev) => [...prev, ...page.rows]);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (e) {
      setError(e?.message || "Could not load more speakers.");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, search, manufacturer]);

  const openAdd = () => { setEditingRow(null); setNotice(""); setFormOpen(true); };
  const openEdit = (row) => { setEditingRow(row); setNotice(""); setFormOpen(true); };

  const handleSaved = (saved) => {
    setNotice(saved.published
      ? "Saved and published to RP22 Comparison."
      : "Saved. Not published yet — the manufacturer data is not enough for a defensible comparison.");
    setReloadToken((token) => token + 1);
  };

  const askDelete = async (row) => {
    setPendingDelete(row);
    setRemoval(null);
    try {
      setRemoval(await describeRemoval(row));
    } catch {
      setRemoval(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setRemoving(true);
    try {
      const result = await removeSpeakerFromLibrary({ row: pendingDelete, actorName });
      setNotice(result.mode === "delete"
        ? "Draft speaker removed."
        : "Removed from the comparison list. The record and its price are kept for audit.");
      setPendingDelete(null);
      setRemoval(null);
      setReloadToken((token) => token + 1);
    } catch (e) {
      setNotice(e?.message || "This speaker could not be removed.");
    } finally {
      setRemoving(false);
    }
  };

  if (isLoadingAuth) {
    return <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>Checking access…</div>;
  }
  if (!isAdmin) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: BRAND.subtext }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: BRAND.text }}>Access Denied</div>
        <div style={{ fontSize: 14, marginTop: 6 }}>This page is restricted to admin users.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: "100vh", color: BRAND.text }}>
      <div style={{ marginBottom: 16 }}>
        <a href="/admin" style={{ fontSize: 13, color: BRAND.subtext, textDecoration: "none" }}>← Back to Admin Dashboard</a>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ flex: "1 1 420px", minWidth: 260 }}>
          <h1 style={{ margin: 0, fontSize: 26 }}>Speaker Comparison Library</h1>
          <div style={{ fontSize: 13, color: BRAND.subtext, marginTop: 4, maxWidth: 720 }}>
            The competitor loudspeakers compared against Artcoustic on RP22 P12/P13. Add a speaker with what the
            manufacturer publishes and its retail price, and it is available in the comparison immediately.
          </div>
        </div>
        <button
          type="button"
          onClick={openAdd}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, border: 0, borderRadius: 10, padding: "11px 18px", background: BRAND.green, color: "#FFF", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
        >
          <Plus size={16} /> Add Speaker
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", margin: "18px 0 12px" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "8px 11px", background: BRAND.panel, flex: "1 1 320px" }}>
          <Search size={15} color={BRAND.hint} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search manufacturer or speaker model"
            style={{ border: 0, outline: "none", background: "transparent", fontSize: 14, color: BRAND.text, width: "100%", fontFamily: "inherit" }}
          />
        </label>
        <select
          value={manufacturer}
          onChange={(event) => setManufacturer(event.target.value)}
          style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "9px 10px", background: BRAND.panel, fontSize: 14, color: BRAND.text, fontFamily: "inherit", minWidth: 220, cursor: "pointer" }}
        >
          <option value="">All manufacturers</option>
          {manufacturers.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      {notice && (
        <div style={{ marginBottom: 12, padding: "10px 14px", border: `1px solid ${BRAND.border}`, borderRadius: 10, background: BRAND.panel, fontSize: 13, color: BRAND.subtext }}>
          {notice}
        </div>
      )}

      <SpeakerLibraryTable
        rows={rows}
        loading={loading}
        error={error}
        onEdit={openEdit}
        onDelete={askDelete}
      />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
        <div style={{ fontSize: 12, color: BRAND.hint }}>
          {rows.length} speaker{rows.length === 1 ? "" : "s"} shown · prices are per speaker including VAT
        </div>
        {hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "8px 14px", background: BRAND.panel, color: BRAND.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </div>

      <div style={{ marginTop: 22, fontSize: 12, color: BRAND.hint }}>
        Specifications, sources, approval history and data-quality notes are retained behind these records ·{" "}
        <a href="/admin/speaker-database/advanced" style={{ color: BRAND.hint }}>Advanced tools</a>
      </div>

      <datalist id="speaker-library-manufacturers">
        {manufacturers.map((name) => <option key={name} value={name} />)}
      </datalist>

      <SpeakerFormDialog
        open={formOpen}
        row={editingRow}
        actorName={actorName}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(next) => { if (!next && !removing) { setPendingDelete(null); setRemoval(null); } }}>
        <DialogContent style={{ maxWidth: 560, background: BRAND.panel }}>
          <DialogHeader>
            <DialogTitle style={{ color: BRAND.text }}>{removal?.headline || "Remove this speaker?"}</DialogTitle>
            <DialogDescription style={{ color: BRAND.subtext }}>
              {removal?.detail || "Checking what this removal will do…"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter style={{ gap: 8 }}>
            <button
              type="button"
              onClick={() => { setPendingDelete(null); setRemoval(null); }}
              disabled={removing}
              style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "9px 16px", background: "#FFF", color: BRAND.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={removing || !removal}
              style={{ border: 0, borderRadius: 9, padding: "9px 16px", background: "#7A1E19", color: "#FFF", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}
            >
              {removing ? "Working…" : (removal?.actionLabel || "Confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}