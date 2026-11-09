// BatchReadSourcesDialog.jsx
// ---------------------------------------------------------------------------
// "Read all incomplete" — the batch maintenance action for the RP22 competitor
// library.
//
// It works through every INCOMPLETE row that already carries a Source URL,
// reads each manufacturer source with ADI (the same extractModelSpecification
// backend the single-row Read source uses), and builds a review queue. Nothing
// is saved automatically: the admin reviews each row's Current vs Found
// proposal, accepts the values to use, and applies them in manageable batches
// (one row, or all accepted rows at once). The retail price is never touched.
//
// After applying, the list is reloaded and an outcome summary reports how many
// rows moved to FULL / GOOD / stayed INCOMPLETE, computed from the reloaded
// data — so the reported adequacy is the real classifyDataAdequacy result, not a
// projection.
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Sparkles, ExternalLink, ChevronDown, ChevronUp, Check } from "lucide-react";
import { classifyDataAdequacy } from "@/components/spl/dataAdequacyClassification";
import { saveSpeakerComparison } from "@/components/admin/speaker-library/saveSpeakerComparison";
import {
  FIELD_LABEL,
  PROPOSAL_FIELDS,
  buildSourceEvidence,
  candidateToFormRow,
  currentFormFor,
  decideDefaults,
  displayValue,
  extractionToFound,
  isConflict,
  readSourceExtraction,
  sourceUrlOf,
} from "@/components/spl/adiSourceExtraction";

const BRAND = {
  text: "#1B1A1A", subtext: "#3E4349", hint: "#625143",
  border: "#DCDBD6", soft: "#F1F0EE", panel: "#FFFFFF",
  green: "#213428", red: "#7A1E19", amber: "#9A6E00",
};
const INCOMPLETE = classifyDataAdequacy(null);

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== "";

function buildQueueEntry(candidate, data, error) {
  const currentForm = currentFormFor(candidate);
  if (error || !data) {
    return { candidate, currentForm, readOk: false, readError: error?.message || "Source could not be read.", raw: null, info: {}, found: {}, proposalFields: [], decisions: {}, hasConflict: false };
  }
  const { found, info } = extractionToFound(data);
  const proposalFields = PROPOSAL_FIELDS.filter((key) => info[key]);
  const hasConflict = proposalFields.some((key) => isConflict(currentForm, key, info));
  return {
    candidate, currentForm,
    readOk: true, readError: "",
    raw: data, found, info, proposalFields,
    decisions: decideDefaults(currentForm, info),
    hasConflict,
  };
}

export default function BatchReadSourcesDialog({ open, onClose, candidates, actorName, onApplied }) {
  const [phase, setPhase] = useState("idle"); // idle | reading | review | applying | done
  const [queue, setQueue] = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcome, setOutcome] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [applyingId, setApplyingId] = useState(null);
  const [error, setError] = useState("");

  const incompleteWithSource = useMemo(
    () => (candidates || []).filter((c) => classifyDataAdequacy(c?.record).key === "INCOMPLETE" && sourceUrlOf(c)),
    [candidates],
  );

  // Snapshot the targets when the dialog opens, so a candidates reload mid-review
  // (after applying a row) never re-triggers a full re-read and never wipes the
  // admin's decisions.
  const targetsRef = React.useRef([]);
  useEffect(() => {
    if (!open) return;
    targetsRef.current = incompleteWithSource;
    const targets = targetsRef.current;
    setPhase("reading");
    setOutcome(null);
    setError("");
    setExpanded(null);
    setQueue([]);
    setProgress({ done: 0, total: targets.length });
    (async () => {
      const entries = [];
      for (let i = 0; i < targets.length; i++) {
        const candidate = targets[i];
        let data = null;
        let err = null;
        try {
          data = await readSourceExtraction(candidate);
        } catch (e) {
          err = e;
        }
        entries.push(buildQueueEntry(candidate, data, err));
        setQueue([...entries]);
        setProgress({ done: i + 1, total: targets.length });
      }
      setPhase("review");
    })();
    // Intentionally only re-runs when the dialog opens; targets are snapshotted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const summary = useMemo(() => {
    const readOk = queue.filter((q) => q.readOk).length;
    const readFailed = queue.filter((q) => !q.readOk).length;
    const withValues = queue.filter((q) => q.readOk && q.proposalFields.length > 0).length;
    const conflicts = queue.filter((q) => q.hasConflict).length;
    const stillIncomplete = queue.filter((q) => q.readOk && q.proposalFields.length === 0).length;
    return { total: queue.length, readOk, readFailed, withValues, conflicts, stillIncomplete };
  }, [queue]);

  const setRowDecisions = (idx, updater) => {
    setQueue((prev) => prev.map((q, i) => (i === idx ? { ...q, decisions: updater(q.decisions) } : q)));
  };

  const toggleRow = (idx, key) => setRowDecisions(idx, (d) => ({ ...d, [key]: !d[key] }));
  const acceptAllRow = (idx) => setRowDecisions(idx, (d) => {
    const next = { ...d };
    const q = queue[idx];
    for (const key of q.proposalFields) if (q.info[key]?.status === "reported") next[key] = true;
    return next;
  });

  const applyRow = async (idx) => {
    const q = queue[idx];
    if (!q || !q.readOk) return;
    setApplyingId(idx);
    try {
      const overrides = {};
      const acceptedKeys = [];
      for (const key of Object.keys(q.decisions)) {
        if (!q.decisions[key]) continue;
        overrides[key] = q.info[key].value;
        if (key === "power_w" && q.info[key].basis) overrides.power_basis = q.info[key].basis;
        acceptedKeys.push(key);
      }
      const merged = { ...q.currentForm, ...overrides };
      const evidence = buildSourceEvidence(q.raw, acceptedKeys, q.info);
      await saveSpeakerComparison({ values: merged, row: candidateToFormRow(q.candidate), actorName, adiEvidence: evidence });
      const reloaded = await onApplied?.(q.candidate.id);
      const newRecord = reloaded?.find((c) => c.id === q.candidate.id)?.record;
      setQueue((prev) => prev.map((p, i) => (i === idx ? { ...p, applied: true, newAdequacy: classifyDataAdequacy(newRecord) } : p)));
    } catch (e) {
      setError(e?.message || "This row could not be saved.");
    } finally {
      setApplyingId(null);
    }
  };

  const acceptedRows = queue.filter((q) => q.readOk && q.proposalFields.length > 0 && Object.values(q.decisions).some(Boolean) && !q.applied);

  const applyAll = async () => {
    if (acceptedRows.length === 0) return;
    setPhase("applying");
    setError("");
    const appliedIds = [];
    try {
      let reloaded = null;
      for (const q of acceptedRows) {
        const idx = queue.indexOf(q);
        const overrides = {};
        const acceptedKeys = [];
        for (const key of Object.keys(q.decisions)) {
          if (!q.decisions[key]) continue;
          overrides[key] = q.info[key].value;
          if (key === "power_w" && q.info[key].basis) overrides.power_basis = q.info[key].basis;
          acceptedKeys.push(key);
        }
        const merged = { ...q.currentForm, ...overrides };
        const evidence = buildSourceEvidence(q.raw, acceptedKeys, q.info);
        await saveSpeakerComparison({ values: merged, row: candidateToFormRow(q.candidate), actorName, adiEvidence: evidence });
        appliedIds.push(q.candidate.id);
      }
      reloaded = await onApplied?.(null);
      // Tally the real adequacy of the applied rows after reload.
      let full = 0, good = 0, incomplete = 0;
      for (const id of appliedIds) {
        const rec = reloaded?.find((c) => c.id === id)?.record;
        const a = classifyDataAdequacy(rec);
        if (a.key === "FULL") full++;
        else if (a.key === "GOOD") good++;
        else incomplete++;
      }
      setOutcome({ applied: appliedIds.length, full, good, incomplete });
      setQueue((prev) => prev.map((p) => (appliedIds.includes(p.candidate.id) ? { ...p, applied: true } : p)));
      setPhase("done");
    } catch (e) {
      setError(e?.message || "One or more rows could not be saved.");
      setPhase("review");
    }
  };

  const close = () => {
    if (phase === "reading" || phase === "applying") return;
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent style={{ maxWidth: 860, background: BRAND.panel, maxHeight: "90vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle style={{ color: BRAND.text, display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={16} /> Read all incomplete sources
          </DialogTitle>
          <DialogDescription style={{ color: BRAND.subtext }}>
            ADI reads each incomplete row's linked manufacturer source and proposes only P12/P13 values it states. Nothing is saved automatically — review and apply in batches. Prices are never changed.
          </DialogDescription>
        </DialogHeader>

        {phase === "reading" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: BRAND.subtext, padding: "10px 0" }}>
            <Loader2 size={16} className="animate-spin" />
            Reading sources with ADI… {progress.done} of {progress.total}
          </div>
        )}

        {incompleteWithSource.length === 0 && phase !== "reading" && (
          <div style={{ fontSize: 13, color: BRAND.subtext, padding: "10px 0" }}>
            No incomplete rows with a Source URL were found. Add a source URL to an incomplete speaker first.
          </div>
        )}

        {(phase === "review" || phase === "applying" || phase === "done") && queue.length > 0 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
              {[
                { label: "Sources read", value: summary.readOk, tone: BRAND.green },
                { label: "Sources failed", value: summary.readFailed, tone: BRAND.red },
                { label: "Values found", value: summary.withValues, tone: BRAND.text },
                { label: "Conflicting data", value: summary.conflicts, tone: BRAND.amber },
                { label: "No new values", value: summary.stillIncomplete, tone: BRAND.hint },
                { label: "Total rows", value: summary.total, tone: BRAND.subtext },
              ].map((s) => (
                <div key={s.label} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "8px 10px", background: "#FFF" }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", color: BRAND.hint }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.tone }}>{s.value}</div>
                </div>
              ))}
            </div>

            {phase === "done" && outcome && (
              <div style={{ border: `1px solid ${BRAND.green}`, borderRadius: 10, padding: "12px 14px", background: "#F4F8F3", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: BRAND.green, marginBottom: 4 }}>Applied {outcome.applied} row{outcome.applied === 1 ? "" : "s"}</div>
                <div style={{ fontSize: 13, color: BRAND.subtext }}>
                  Moved to FULL: {outcome.full} · GOOD: {outcome.good} · still INCOMPLETE: {outcome.incomplete}
                </div>
              </div>
            )}

            <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, overflow: "hidden" }}>
              {queue.map((q, idx) => {
                const openRow = expanded === idx;
                const a = q.newAdequacy || classifyDataAdequacy(q.candidate.record);
                return (
                  <div key={q.candidate.id} style={{ borderTop: idx === 0 ? 0 : `1px solid ${BRAND.soft}`, background: q.applied ? "#F4F8F3" : "#FFF" }}>
                    <button
                      type="button"
                      onClick={() => setExpanded(openRow ? null : idx)}
                      style={{ width: "100%", border: 0, background: "transparent", padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left" }}
                    >
                      {openRow ? <ChevronUp size={14} color={BRAND.hint} /> : <ChevronDown size={14} color={BRAND.hint} />}
                      <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {q.candidate.manufacturer || ""} {q.candidate.model || ""}
                      </span>
                      {q.hasConflict && <span style={{ fontSize: 10, fontWeight: 700, color: BRAND.amber, letterSpacing: "0.04em" }}>CONFLICT</span>}
                      {q.applied && <span style={{ fontSize: 10, fontWeight: 700, color: BRAND.green, letterSpacing: "0.04em" }}>APPLIED</span>}
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "2px 7px", borderRadius: 999, background: `${a.tone}14`, color: a.tone, whiteSpace: "nowrap" }}>{q.newAdequacy ? a.short : "INCOMPLETE"}</span>
                    </button>
                    {openRow && (
                      <div style={{ padding: "0 12px 12px 34px" }}>
                        <div style={{ fontSize: 11, color: BRAND.hint, marginBottom: 8, wordBreak: "break-all" }}>
                          <ExternalLink size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                          <a href={sourceUrlOf(q.candidate)} target="_blank" rel="noopener noreferrer" style={{ color: BRAND.subtext }}>{sourceUrlOf(q.candidate)}</a>
                        </div>
                        {q.readError ? (
                          <div style={{ fontSize: 12, color: BRAND.red }}>Source could not be read — row left unchanged.</div>
                        ) : q.proposalFields.length === 0 ? (
                          <div style={{ fontSize: 12, color: BRAND.subtext }}>No P12/P13 values were stated in the source. No values proposed.</div>
                        ) : (
                          <>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead style={{ background: BRAND.soft }}>
                                <tr>
                                  {["Field", "Current", "Found in source", "Use"].map((h) => (
                                    <th key={h} style={{ textAlign: h === "Use" ? "center" : "left", padding: "6px 8px", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: BRAND.hint, fontWeight: 600 }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {q.proposalFields.map((key) => {
                                  const f = q.info[key];
                                  const current = q.currentForm[key];
                                  const conflict = isConflict(q.currentForm, key, q.info);
                                  return (
                                    <tr key={key} style={{ borderTop: `1px solid ${BRAND.soft}` }}>
                                      <td style={{ padding: "6px 8px", fontSize: 12, fontWeight: 600, color: BRAND.text, verticalAlign: "top" }}>{FIELD_LABEL[key]}</td>
                                      <td style={{ padding: "6px 8px", fontSize: 12, color: conflict ? BRAND.amber : BRAND.subtext, verticalAlign: "top", fontWeight: conflict ? 600 : 400 }}>{displayValue(key, current)}</td>
                                      <td style={{ padding: "6px 8px", fontSize: 12, color: BRAND.text, verticalAlign: "top" }}>
                                        <div>{displayValue(key, f.value)}</div>
                                        {f.quote && <div style={{ fontSize: 10, color: BRAND.hint, marginTop: 3, fontStyle: "italic" }}>“{f.quote.slice(0, 120)}{f.quote.length > 120 ? "…" : ""}”</div>}
                                      </td>
                                      <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "top" }}>
                                        <input type="checkbox" checked={!!q.decisions[key]} onChange={() => toggleRow(idx, key)} disabled={q.applied} aria-label={`Use source value for ${FIELD_LABEL[key]}`} />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                              <button type="button" onClick={() => acceptAllRow(idx)} disabled={q.applied} style={{ border: `1px solid ${BRAND.green}`, borderRadius: 8, padding: "6px 12px", background: "#FFF", color: BRAND.green, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: q.applied ? "default" : "pointer" }}>Accept all found values</button>
                              <button
                                type="button"
                                onClick={() => applyRow(idx)}
                                disabled={q.applied || applyingId === idx || !Object.values(q.decisions).some(Boolean)}
                                style={{ display: "inline-flex", alignItems: "center", gap: 6, border: 0, borderRadius: 8, padding: "6px 12px", background: q.applied ? BRAND.soft : BRAND.green, color: q.applied ? BRAND.hint : "#FFF", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: q.applied ? "default" : "pointer" }}
                              >
                                {applyingId === idx ? <Loader2 size={13} className="animate-spin" /> : q.applied ? <Check size={13} /> : null}
                                {q.applied ? "Applied" : applyingId === idx ? "Applying…" : "Apply this row"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {error && <div style={{ fontSize: 13, color: BRAND.red, marginTop: 8 }}>{error}</div>}

        <DialogFooter style={{ gap: 8 }}>
          <button type="button" onClick={close} disabled={phase === "reading" || phase === "applying"} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "9px 16px", background: "#FFF", color: BRAND.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
            {phase === "done" ? "Done" : "Close"}
          </button>
          {phase !== "done" && (
            <button
              type="button"
              onClick={applyAll}
              disabled={phase !== "review" || acceptedRows.length === 0}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, border: 0, borderRadius: 9, padding: "9px 18px", background: phase !== "review" || acceptedRows.length === 0 ? "#9CA3A0" : BRAND.green, color: "#FFF", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: phase !== "review" || acceptedRows.length === 0 ? "not-allowed" : "pointer" }}
            >
              {phase === "applying" ? <><Loader2 size={15} className="animate-spin" /> Applying…</> : <>Apply all accepted ({acceptedRows.length})</>}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}