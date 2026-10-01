// AdiDesignerActionBar.jsx
// ---------------------------------------------------------------------------
// The card's action row. Which buttons exist is decided by the summary
// authority, never here:
//
//   recommendation available → Preview · Apply <lever> · Keep current design
//   applied                  → Undo change · Re-run optimisation
//   nothing safe to apply    → Re-run optimisation · Compare subwoofer options
//                              · Keep current design
//
// Apply is rendered only when the summary says it is safe. There is no path to
// an Apply button from stale, rejected, incomplete or combined-only evidence.
// ---------------------------------------------------------------------------

import React from "react";
import { ArrowRight, Check, RotateCcw, Sparkles, Undo2, X } from "lucide-react";

const PRIMARY = "inline-flex items-center gap-1.5 rounded-md bg-[#213428] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#3E4349] disabled:opacity-60";
const SECONDARY = "inline-flex items-center gap-1.5 rounded-md border border-[#D9D5CE] bg-white px-4 py-2 text-[12px] font-semibold text-[#213428] transition-colors hover:border-[#213428]";
const QUIET = "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] font-medium text-[#625143] transition-colors hover:text-[#213428]";

export default function AdiDesignerActionBar({
  summary = null,
  busy = false,
  onPreview = null,
  onApply = null,
  onKeepCurrent = null,
  onRerun = null,
  onUndo = null,
  onCompareSubwoofers = null,
  className = "",
}) {
  const actions = summary?.actions || {};
  const hasApply = actions.canApply === true && typeof onApply === "function";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {hasApply && typeof onPreview === "function" && (
        <button type="button" className={SECONDARY} onClick={onPreview} disabled={busy}>
          <Sparkles className="h-3.5 w-3.5" />
          Preview recommendation
        </button>
      )}

      {hasApply && (
        <button type="button" className={PRIMARY} onClick={onApply} disabled={busy}>
          <Check className="h-3.5 w-3.5" />
          {actions.applyLabel || "Apply recommendation"}
        </button>
      )}

      {actions.canUndo === true && typeof onUndo === "function" && (
        <button type="button" className={SECONDARY} onClick={onUndo} disabled={busy}>
          <Undo2 className="h-3.5 w-3.5" />
          {actions.undoLabel || "Undo change"}
        </button>
      )}

      {typeof onRerun === "function" && actions.canRerun !== false && (
        <button
          type="button"
          className={hasApply || actions.canUndo ? SECONDARY : PRIMARY}
          onClick={onRerun}
          disabled={busy}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {actions.rerunLabel || "Re-run optimisation"}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}

      {!hasApply && typeof onCompareSubwoofers === "function" && (
        <button type="button" className={SECONDARY} onClick={onCompareSubwoofers} disabled={busy}>
          Compare subwoofer options
        </button>
      )}

      {!hasApply && typeof onKeepCurrent === "function" && (
        <button type="button" className={QUIET} onClick={onKeepCurrent} disabled={busy}>
          <X className="h-3 w-3" />
          Keep current design
        </button>
      )}
    </div>
  );
}