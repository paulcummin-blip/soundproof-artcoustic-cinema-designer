// CandidateModelFinder.jsx
// ---------------------------------------------------------------------------
// "Find candidate models" review screen — a controlled action from the
// Manufacturers list. Discovery runs against the manufacturer's official domain
// only and creates nothing: the admin ticks the models to add, and only then are
// Draft products and specifications created (with data-quality warnings).
// ---------------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import ComparisonQualityBadges from "@/components/spl/ComparisonQualityBadges";
import { Search, X, Loader2, ExternalLink, Link2, FileText } from "lucide-react";
import {
  candidateReadiness,
  candidateBadgeLabel,
  candidateConfidenceLabel,
  candidateExtractRows,
  candidateSourceIndicator,
  candidateSourceType,
  candidateTrustedProposal,
  trustedProposalSummary,
  candidateGapMessage,
  modelKey,
  ROLE_LABELS,
} from "./candidateReview.js";
import { createDraftProductsFromCandidates, loadExistingModelKeys } from "./candidateImport.js";
import SecondaryEvidenceButton from "./secondaryEvidence/SecondaryEvidenceButton.jsx";
import { ensureCandidateProduct } from "./secondaryEvidence/secondaryEvidenceClient.js";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
  soft: "#F7F6F4",
  danger: "#B23A3A",
  warn: "#9A6E00",
};

const HEAD = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-left";
const CELL = "px-3 py-2 text-sm align-top";

function Th({ children }) {
  return <th className={HEAD} style={{ color: BRAND.subtext, borderBottom: `1px solid ${BRAND.border}` }}>{children}</th>;
}

export default function CandidateModelFinder({ manufacturer, onClose, onCreated }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [excluded, setExcluded] = useState([]);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [authority, setAuthority] = useState({ url: "", regional: "", allowed: [] });
  const [documentStats, setDocumentStats] = useState({ deepChecked: 0, documentsUsed: 0, rejectedDocuments: 0 });
  const [domain, setDomain] = useState("");
  const [note, setNote] = useState("");
  const [existingKeys, setExistingKeys] = useState(new Set());
  const [selected, setSelected] = useState(new Set());
  const [creating, setCreating] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [actorName, setActorName] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      setOutcome(null);
      setSelected(new Set());
      try {
        const me = await base44.auth.me();
        if (cancelled) return;
        setActorName(me?.full_name || "Admin selection");

        const existing = await loadExistingModelKeys(manufacturer.id);
        if (cancelled) return;
        setExistingKeys(existing);

        const response = await base44.functions.invoke("discoverCandidateModels", {
          manufacturer_id: manufacturer.id,
          manufacturerName: manufacturer.name,
          manufacturerDomain: manufacturer.website,
        });
        if (cancelled) return;
        const data = response?.data || {};
        if (data.error) {
          setError(data.error);
          setCandidates([]);
          return;
        }
        setCandidates(data.candidates || []);
        setExcluded(data.excluded || []);
        setRejectedCount((data.rejected || []).length);
        setDomain(data.searched_domain || "");
        setAuthority({
          url: data.authority_url || "",
          regional: data.regional_preference || "",
          allowed: data.allowed_domains || [],
        });
        setDocumentStats({
          deepChecked: data.deep_checked_count || 0,
          documentsUsed: data.documents_used_count || 0,
          rejectedDocuments: (data.rejected_documents || []).length,
        });
        setNote(data.note || "");
      } catch (err) {
        if (!cancelled) setError(err?.message || "Candidate discovery failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [manufacturer?.id]);

  const rows = useMemo(() => (candidates || []).map((candidate) => {
    const key = modelKey(candidate.model);
    const readiness = candidateReadiness(candidate, manufacturer.name);
    return {
      key,
      candidate,
      readiness,
      extracts: candidateExtractRows(candidate),
      source: candidateSourceIndicator(candidate),
      sourceType: candidateSourceType(candidate),
      confidenceLabel: candidateConfidenceLabel(readiness),
      trusted: candidateTrustedProposal(candidate),
      gapMessage: candidateGapMessage(readiness, candidate),
      added: existingKeys.has(key),
      missing: readiness.missingCriticalLabels,
    };
  }), [candidates, existingKeys, manufacturer.name]);

  const selectableRows = rows.filter((row) => !row.added);
  const allSelected = selectableRows.length > 0 && selectableRows.every((row) => selected.has(row.key));
  const excludedReasons = Array.from(new Set(excluded.map((item) => item.reason)));
  const trustedRows = rows.filter((row) => row.trusted);
  const trustedHosts = Array.from(new Set(trustedRows.map((row) => row.trusted.host).filter(Boolean)));

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableRows.map((row) => row.key)));
  };

  const handleAdd = async () => {
    const chosen = selectableRows.filter((row) => selected.has(row.key)).map((row) => row.candidate);
    if (chosen.length === 0) return;
    setCreating(true);
    setError("");
    try {
      const result = await createDraftProductsFromCandidates({ manufacturer, candidates: chosen, actorName });
      setOutcome(result);
      setExistingKeys(await loadExistingModelKeys(manufacturer.id));
      setSelected(new Set());
      onCreated?.();
    } catch (err) {
      setError(err?.message || "Could not create the selected models.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto p-6" style={{ background: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div className="rounded-lg w-full max-w-[1500px]" style={{ background: BRAND.card, border: `1px solid ${BRAND.border}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5" style={{ borderBottom: `1px solid ${BRAND.border}` }}>
          <div>
            <h3 className="text-lg font-bold" style={{ color: BRAND.text }}>Find candidate models</h3>
            <div className="text-sm mt-0.5" style={{ color: BRAND.subtext }}>
              {manufacturer.name} · official domain only {domain ? `(${domain})` : `(${manufacturer.website || "no website recorded"})`}
            </div>
            {authority.regional && (
              <div className="text-xs mt-1" style={{ color: BRAND.subtext }}>{authority.regional}</div>
            )}
            <div className="text-xs mt-1" style={{ color: BRAND.subtext }}>
              Nothing is created until you select models. Added models are Draft specifications — not approved, not published.
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" style={{ color: BRAND.subtext }} /></button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 p-6 text-sm" style={{ color: BRAND.subtext }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Searching the official domain, its product sheets, datasheets and manuals — this can take up to a minute…
          </div>
        )}

        {!loading && error && (
          <div className="p-5 text-sm" style={{ color: BRAND.danger, background: "#FDF6F6", borderBottom: `1px solid ${BRAND.border}` }}>{error}</div>
        )}

        {!loading && !error && (
          <>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3 text-xs" style={{ color: BRAND.subtext, background: BRAND.soft, borderBottom: `1px solid ${BRAND.border}` }}>
              <span><strong>{rows.length}</strong> candidate model{rows.length === 1 ? "" : "s"} on the official domain</span>
              {documentStats.deepChecked > 0 && (
                <span>
                  <strong>{documentStats.documentsUsed}</strong> of {documentStats.deepChecked} checked models backed by an official document
                </span>
              )}
              <span><strong>{excluded.length}</strong> excluded by the P12/P13 section rules{excludedReasons.length > 0 ? ` (${excludedReasons.join(", ")})` : ""}</span>
              {rejectedCount > 0 && <span><strong>{rejectedCount}</strong> discarded for not being on {domain}</span>}
              {documentStats.rejectedDocuments > 0 && (
                <span><strong>{documentStats.rejectedDocuments}</strong> document{documentStats.rejectedDocuments === 1 ? "" : "s"} discarded as not official</span>
              )}
              {trustedRows.length > 0 && (
                <span style={{ color: BRAND.warn }}>
                  <strong>{trustedRows.length}</strong> model{trustedRows.length === 1 ? "" : "s"} with trusted secondary distributor values proposed for review
                  {trustedHosts.length > 0 ? ` (${trustedHosts.join(", ")})` : ""}
                </span>
              )}
              {note && <span style={{ color: BRAND.warn }}>{note}</span>}
            </div>

            {rows.length === 0 ? (
              <div className="p-6 text-sm" style={{ color: BRAND.subtext }}>
                No candidate models were returned for this manufacturer. Check that the official website is correct, then try again.
              </div>
            ) : (
              <div className="overflow-auto" style={{ maxHeight: "62vh" }}>
                <table className="w-full" style={{ minWidth: 1580, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <Th>
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4" title="Select all" />
                      </Th>
                      <Th>Model</Th>
                      <Th>Role</Th>
                      <Th>Source type</Th>
                      <Th>Sensitivity</Th>
                      <Th>Impedance</Th>
                      <Th>Power / amp</Th>
                      <Th>Max SPL</Th>
                      <Th>Frequency response</Th>
                      <Th>Space</Th>
                      <Th>Confidence preview</Th>
                      <Th>Missing critical fields</Th>
                      <Th>Sources</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key} style={{ borderBottom: `1px solid ${BRAND.soft}`, background: row.added ? BRAND.soft : "#FFF" }}>
                        <td className={CELL}>
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={selected.has(row.key)}
                            disabled={row.added}
                            onChange={() => toggle(row.key)}
                          />
                        </td>
                        <td className={CELL}>
                          <div className="font-medium" style={{ color: BRAND.text }}>{row.candidate.model}</div>
                          <div className="text-xs" style={{ color: BRAND.subtext }}>
                            {[manufacturer.name, row.candidate.series].filter(Boolean).join(" · ")}
                          </div>
                          {row.candidate.is_discontinued && (
                            <div className="text-xs" style={{ color: BRAND.warn }}>Discontinued — no current option found</div>
                          )}
                          {row.candidate.product_url_ok === false && (
                            <div className="text-xs" style={{ color: BRAND.danger }}>Reported page address not found — verify before adding</div>
                          )}
                          {row.added && <div className="text-xs" style={{ color: BRAND.green }}>Already in the Speaker Database</div>}
                          {row.candidate.discarded_values?.length > 0 && (
                            <div className="text-xs" style={{ color: BRAND.warn }}>
                              Discarded as implausible: {row.candidate.discarded_values.join(", ")}
                            </div>
                          )}
                        </td>
                        <td className={CELL} style={{ color: BRAND.subtext }}>{ROLE_LABELS[row.candidate.role_guess] || "Unknown"}</td>
                        <td className={CELL}>
                          <div style={{ color: row.sourceType.trusted ? BRAND.warn : BRAND.text, fontWeight: 600, fontSize: 13 }}>
                            {row.sourceType.label}
                          </div>
                          {row.sourceType.host && (
                            <div className="text-xs" style={{ color: BRAND.subtext }}>{row.sourceType.host}</div>
                          )}
                        </td>
                        <td className={CELL} style={{ color: BRAND.text }}>{row.extracts.sensitivity}</td>
                        <td className={CELL} style={{ color: BRAND.text }}>{row.extracts.impedance}</td>
                        <td className={CELL} style={{ color: BRAND.text }}>{row.extracts.power}</td>
                        <td className={CELL} style={{ color: BRAND.text }}>{row.extracts.maxSpl}</td>
                        <td className={CELL} style={{ color: BRAND.text }}>
                          {row.extracts.response}
                          {row.extracts.dispersion !== "—" && (
                            <div className="text-xs" style={{ color: BRAND.subtext }}>{row.extracts.dispersion}</div>
                          )}
                        </td>
                        <td className={CELL} style={{ color: BRAND.subtext }}>{row.extracts.space}</td>
                        <td className={CELL}>
                          <ComparisonQualityBadges
                            confidence={row.readiness.confidence}
                            label={candidateBadgeLabel(row.readiness, row.sourceType)}
                            basis={row.readiness.capabilityBasis}
                            tone={row.readiness.tone}
                          />
                          <div className="text-xs mt-1" style={{ color: BRAND.subtext }}>{row.confidenceLabel}</div>
                          {row.gapMessage && (
                            <div className="text-xs mt-1" style={{ color: BRAND.danger }}>{row.gapMessage}</div>
                          )}
                        </td>
                        <td className={CELL} style={{ color: BRAND.subtext }}>
                          {row.missing.length === 0 ? "None" : row.missing.join(", ")}
                        </td>
                        <td className={CELL}>
                          <div className="flex flex-col gap-1">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                              style={{ border: `1px solid ${BRAND.border}`, color: row.source.hasDocument ? BRAND.green : BRAND.subtext }}
                              title={row.source.hasDocument ? "An official supporting document was found" : "Only the product page was available"}
                            >
                              <FileText className="w-3 h-3" /> {row.source.label}
                            </span>
                            {row.candidate.product_url && (
                              <a href={row.candidate.product_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs underline" style={{ color: BRAND.green }}>
                                <ExternalLink className="w-3 h-3" /> Product page
                              </a>
                            )}
                            {row.source.documentUrl && (
                              <a href={row.source.documentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs underline" style={{ color: BRAND.green }}>
                                <Link2 className="w-3 h-3" /> {row.source.label}
                              </a>
                            )}
                            {row.source.linkedDocumentUrl && (
                              <a href={row.source.linkedDocumentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs underline" style={{ color: BRAND.subtext }}>
                                <Link2 className="w-3 h-3" /> {row.source.documentLabel} (linked from the page)
                              </a>
                            )}
                            {!row.source.documentUrl && row.candidate.datasheet_url && (
                              <a href={row.candidate.datasheet_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs underline" style={{ color: BRAND.green }}>
                                <Link2 className="w-3 h-3" /> Datasheet
                              </a>
                            )}
                            {!row.source.hasDocument && row.candidate.document_note && (
                              <span className="text-xs" style={{ color: BRAND.warn }}>{row.candidate.document_note}</span>
                            )}
                            {/* When the manufacturer no longer publishes the values, an
                                admin can supply the original document and accept it
                                explicitly — recorded, capped at C, never automatic. */}
                            {/* A trusted secondary distributor document proposed by
                                discovery. It is never used automatically: the admin
                                opens it, reads the sentences and accepts it explicitly. */}
                            {row.trusted && (
                              <div className="text-xs" style={{ color: BRAND.subtext, maxWidth: 360 }}>
                                <a
                                  href={row.trusted.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline"
                                  style={{ color: BRAND.warn, fontWeight: 600 }}
                                >
                                  {row.trusted.sourceName || "Trusted distributor"} · {row.trusted.host}
                                </a>
                                <div style={{ color: BRAND.text }}>
                                  {trustedProposalSummary(row.trusted) || "No P12/P13 value clearly stated in the proposed document."}
                                </div>
                                {row.trusted.sourceQuote && <div>“{row.trusted.sourceQuote}”</div>}
                                <div>Review, then accept — capped at confidence C.</div>
                              </div>
                            )}
                            <SecondaryEvidenceButton
                              manufacturerName={manufacturer.name}
                              model={row.candidate.model}
                              manufacturerWebsite={manufacturer.website}
                              initialUrl={row.trusted?.url || ""}
                              label={row.trusted ? "Review & accept trusted source" : "Add secondary evidence URL"}
                              ensureProduct={() => ensureCandidateProduct({ manufacturer, candidate: row.candidate, actorName })}
                              onAccepted={async () => {
                                setExistingKeys(await loadExistingModelKeys(manufacturer.id));
                                onCreated?.();
                              }}
                              compact
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {outcome && (
          <div className="px-5 py-3 text-sm" style={{ background: "#F2F5F2", borderTop: `1px solid ${BRAND.border}`, color: BRAND.green }}>
            {outcome.created.length} model{outcome.created.length === 1 ? "" : "s"} added as Draft — {outcome.created.map((item) => item.model).join(", ")}.
            {outcome.skipped.length > 0 && (
              <span style={{ color: BRAND.subtext }}> Skipped: {outcome.skipped.map((item) => `${item.model} (${item.reason})`).join(", ")}.</span>
            )}
            <span style={{ color: BRAND.subtext }}> Review them in Speaker Database → Products before approving or publishing.</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 p-5" style={{ borderTop: `1px solid ${BRAND.border}` }}>
          <div className="text-xs" style={{ color: BRAND.subtext }}>
            Values are shown only as published on the official domain. Where the official sources carry no engineering data, a trusted secondary distributor document may be proposed for explicit review — never accepted automatically. A value that is not stated stays empty and appears as a missing critical field.
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-md text-sm" style={{ border: `1px solid ${BRAND.border}`, color: BRAND.text }}>Close</button>
            <button
              onClick={handleAdd}
              disabled={creating || selected.size === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
              style={{ background: BRAND.green, color: "#FFF", opacity: creating || selected.size === 0 ? 0.5 : 1 }}
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {creating ? "Creating drafts…" : `Add ${selected.size || ""} selected as Draft`.replace("  ", " ")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}