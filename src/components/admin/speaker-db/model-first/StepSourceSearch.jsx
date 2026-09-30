// StepSourceSearch.jsx
// Step 2 of the model-first workflow: official-source search for the one typed
// model. Candidates are already filtered to the manufacturer's domain, or the
// admin can continue with no source (the product stays a Draft with a warning).

import React from "react";
import { Loader2, ExternalLink, AlertTriangle } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#3E4349",
  border: "#DCDBD6",
  bg: "rgb(248 248 247)",
  green: "#213428",
};

export default function StepSourceSearch({
  manufacturerName,
  manufacturerDomain,
  model,
  candidates,
  rejected,
  searching,
  searchError,
  searched,
  onSearch,
  onChoose,
  onUsePastedUrl,
  pastedUrl,
}) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ fontSize: 13, color: BRAND.subtext }}>
        {manufacturerDomain
          ? <>Searching <strong>{manufacturerDomain}</strong> only, for the exact model <strong>{model || "—"}</strong>.</>
          : <>{manufacturerName || "This manufacturer"} has no website recorded, so there is no official domain to search.</>}
      </div>

      {pastedUrl && (
        <button
          type="button"
          onClick={onUsePastedUrl}
          style={{ textAlign: "left", padding: 12, borderRadius: 10, border: `1px solid ${BRAND.green}`, background: "#FFF", color: BRAND.text, fontSize: 13, cursor: "pointer" }}
        >
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Use the URL you supplied</div>
          <div style={{ fontSize: 12, color: BRAND.subtext, wordBreak: "break-all" }}>{pastedUrl}</div>
        </button>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={onSearch}
          disabled={searching || !manufacturerDomain}
          style={{ padding: "9px 14px", borderRadius: 9, border: "none", background: BRAND.green, color: "#FFF", fontSize: 13, fontWeight: 600, cursor: searching ? "wait" : "pointer", opacity: searching || !manufacturerDomain ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {searching && <Loader2 size={14} className="animate-spin" />}
          {searched ? "Search again" : "Search official sources"}
        </button>
      </div>

      {searchError && (
        <div style={{ padding: 10, borderRadius: 9, border: "1px solid #F0C7BD", background: "#FBEFEC", color: "#8A2E1C", fontSize: 12 }}>
          {searchError}
        </div>
      )}

      {searched && !searching && candidates.length === 0 && !searchError && (
        <div style={{ padding: 12, borderRadius: 10, border: "1px solid #F0D9A8", background: "#FDF6E7", color: "#7A5B12", fontSize: 12, display: "flex", gap: 8 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            No official page or datasheet was found on {manufacturerDomain} for this exact model.
            Create the product as a Draft with a missing-source warning, and enter the specification
            by hand from the documentation you have.
          </div>
        </div>
      )}

      {candidates.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {candidates.map((candidate) => (
            <button
              key={candidate.url}
              type="button"
              onClick={() => onChoose(candidate)}
              style={{ textAlign: "left", padding: 12, borderRadius: 10, border: `1px solid ${BRAND.border}`, background: BRAND.bg, color: BRAND.text, cursor: "pointer" }}
            >
              <div style={{ fontSize: 13, fontWeight: 700 }}>{candidate.title}</div>
              <div style={{ fontSize: 12, color: BRAND.subtext, marginTop: 2 }}>{candidate.source_type} · {candidate.domain}</div>
              <div style={{ fontSize: 11, color: BRAND.subtext, marginTop: 4, wordBreak: "break-all", display: "flex", alignItems: "center", gap: 4 }}>
                <ExternalLink size={11} /> {candidate.url}
              </div>
              {candidate.states_model === false && (
                <div style={{ fontSize: 11, color: "#8A2E1C", marginTop: 4 }}>
                  The page may not name this exact model — check before extracting.
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {rejected.length > 0 && (
        <div style={{ fontSize: 11, color: BRAND.subtext }}>
          {rejected.length} off-domain result{rejected.length === 1 ? "" : "s"} were discarded (not the manufacturer's own site).
        </div>
      )}
    </div>
  );
}