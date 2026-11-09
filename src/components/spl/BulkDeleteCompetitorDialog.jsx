// BulkDeleteCompetitorDialog.jsx
// ---------------------------------------------------------------------------
// Confirmation dialog for removing multiple competitor speaker rows at once.
//
// Reuses the existing single-row lifecycle: each selected candidate is probed
// with describeRemoval (reference check), then removed with
// removeSpeakerFromLibrary. Rows whose probe resolves to "archive" mode are
// referenced elsewhere (approved / published data) — they are NEVER silently
// broken: they are listed as "Referenced — will be skipped" and left untouched.
// Only the safe rows (delete / delete_dangling / retire) are removed.
//
// After the operation the dialog reports how many were removed and which were
// skipped, so an admin cleaning a bad import can see exactly what happened.
//
// Admin only: the parent panel is rendered solely for admins and the
// CompetitorSpeaker entity's RLS permits writes to admins alone, so no extra
// guard is needed here.

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { describeRemoval, removeSpeakerFromLibrary } from "@/components/admin/speaker-library/removeSpeakerFromLibrary";

const BRAND = {
  border: "#DCDBD6",
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
  soft: "#F1F0EE",
  warn: "#7A1E19",
  ok: "#213428",
};

/** A candidate is safe to remove when its lifecycle mode is not "archive". */
function isSafeMode(mode) {
  return mode === "delete" || mode === "delete_dangling" || mode === "retire";
}

/**
 * Probe a single selected candidate and return a row descriptor.
 * @param {object} candidate  a comparison candidate from loadComparisonCandidates
 */
async function probeCandidate(candidate) {
  const probe = {
    productId: candidate.productId || null,
    product: candidate.productId ? { id: candidate.productId } : null,
    rowId: candidate.priceRecordId || null,
    manufacturer: candidate.manufacturer || "",
    model: candidate.model || "",
  };
  try {
    const removal = await describeRemoval(probe);
    const safe = isSafeMode(removal?.mode);
    return {
      candidate,
      label: `${candidate.manufacturer || "—"} ${candidate.model || ""}`.trim(),
      mode: removal?.mode || null,
      headline: removal?.headline || "",
      detail: removal?.detail || "",
      safe,
      error: removal?.error || null,
    };
  } catch (e) {
    return {
      candidate,
      label: `${candidate.manufacturer || "—"} ${candidate.model || ""}`.trim(),
      mode: null,
      headline: "",
      detail: "",
      safe: false,
      error: e?.message || "Could not assess this speaker.",
    };
  }
}

export default function BulkDeleteCompetitorDialog({
  open,
  onClose,
  selectedCandidates = [],
  actorName = "Administrator",
  onDone = null,
}) {
  const [probing, setProbing] = useState(false);
  const [rows, setRows] = useState([]);
  const [removing, setRemoving] = useState(false);
  const [result, setResult] = useState(null);

  // Re-probe every time the dialog opens with a fresh selection.
  useEffect(() => {
    if (!open) {
      setRows([]);
      setResult(null);
      setProbing(false);
      setRemoving(false);
      return;
    }
    let cancelled = false;
    setProbing(true);
    setRows([]);
    setResult(null);
    (async () => {
      const probed = await Promise.all(selectedCandidates.map(probeCandidate));
      if (!cancelled) {
        setRows(probed);
        setProbing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, selectedCandidates]);

  const safeRows = useMemo(() => rows.filter((r) => r.safe), [rows]);
  const skippedRows = useMemo(() => rows.filter((r) => !r.safe), [rows]);

  const handleConfirm = async () => {
    setRemoving(true);
    setResult(null);
    const removed = [];
    const failed = [];
    for (const row of safeRows) {
      try {
        const probe = {
          productId: row.candidate.productId || null,
          product: row.candidate.productId ? { id: row.candidate.productId } : null,
          rowId: row.candidate.priceRecordId || null,
          manufacturer: row.candidate.manufacturer || "",
          model: row.candidate.model || "",
        };
        await removeSpeakerFromLibrary({ row: probe, actorName });
        removed.push(row.label);
      } catch (e) {
        failed.push({ label: row.label, reason: e?.message || "Could not remove." });
      }
    }
    setResult({ removed, failed, skipped: skippedRows });
    setRemoving(false);
    onDone?.({ removedCount: removed.length, skippedCount: skippedRows.length, failedCount: failed.length });
  };

  const handleClose = () => {
    if (removing) return;
    onClose();
  };

  const totalCount = selectedCandidates.length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent style={{ maxWidth: 620 }}>
        <DialogHeader>
          <DialogTitle>Remove selected speakers</DialogTitle>
          <DialogDescription>
            {totalCount} speaker{totalCount === 1 ? "" : "s"} selected for removal.
          </DialogDescription>
        </DialogHeader>

        {probing ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: BRAND.subtext }}>
            <Loader2 size={15} className="animate-spin" /> Checking references…
          </div>
        ) : result ? (
          <div style={{ fontSize: 13, color: BRAND.subtext }}>
            <div style={{ fontWeight: 600, color: BRAND.ok, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={15} /> Removed {result.removed.length} speaker{result.removed.length === 1 ? "" : "s"}.
            </div>
            {result.failed.length > 0 && (
              <div style={{ marginBottom: 8, color: BRAND.warn }}>
                {result.failed.length} could not be removed:
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {result.failed.map((f, i) => <li key={i}>{f.label} — {f.reason}</li>)}
                </ul>
              </div>
            )}
            {result.skipped.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {result.skipped.length} referenced speaker{result.skipped.length === 1 ? "" : "s"} skipped:
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {result.skipped.map((s, i) => <li key={i}>{s.label} — {s.headline || s.error || "referenced elsewhere"}</li>)}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: BRAND.subtext, maxHeight: 320, overflowY: "auto" }}>
            {safeRows.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, color: BRAND.text, marginBottom: 4 }}>
                  Will be removed ({safeRows.length}):
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {safeRows.map((r, i) => (
                    <li key={i} style={{ marginBottom: 2 }}>{r.label}</li>
                  ))}
                </ul>
              </div>
            )}
            {skippedRows.length > 0 && (
              <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: 10, background: BRAND.soft }}>
                <div style={{ fontWeight: 600, color: BRAND.warn, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertTriangle size={14} /> Referenced — will be skipped ({skippedRows.length}):
                </div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {skippedRows.map((r, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      <div style={{ fontWeight: 600, color: BRAND.text }}>{r.label}</div>
                      <div style={{ fontSize: 12, color: BRAND.hint }}>{r.error || r.headline || "Referenced elsewhere."}</div>
                    </li>
                  ))}
                </ul>
                <div style={{ fontSize: 12, color: BRAND.hint, marginTop: 6 }}>
                  These speakers have approved or published data and are kept for audit. Remove them individually to archive.
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={handleClose}
            disabled={removing}
            style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: "8px 14px", background: "#FFF", color: BRAND.text, cursor: "pointer", fontSize: 13, fontFamily: "inherit", opacity: removing ? 0.5 : 1 }}
          >
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={removing || safeRows.length === 0}
              style={{ border: 0, borderRadius: 8, padding: "8px 14px", background: BRAND.warn, color: "#FFF", cursor: "pointer", fontSize: 13, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, opacity: removing || safeRows.length === 0 ? 0.5 : 1 }}
            >
              {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {removing ? "Removing…" : `Delete ${safeRows.length} of ${totalCount}`}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}