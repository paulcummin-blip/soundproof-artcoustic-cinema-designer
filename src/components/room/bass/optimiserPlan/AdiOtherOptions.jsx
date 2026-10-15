// AdiOtherOptions.jsx
// ---------------------------------------------------------------------------
// OTHER OPTIONS — the small number of genuinely useful alternatives beside the
// panel's ONE decision.
//
//   OTHER OPTIONS
//   Seating
//   Move seating block 100 mm away from the screen
//   Predicted to improve seat-to-seat consistency.
//   REVIEW OPTION                       ← its detail, before any Apply
//
// Each option is reviewed individually: the designer opens its own detail and
// reads what its evaluation measured. No Apply is drawn per option here — when an
// option IS the panel's current decision, its control is on the card, and only
// one primary decision is ever offered at a time.
//
// Presentation only: every line arrives already resolved by
// optimiserOtherOptions.js. Nothing is calculated, ranked or applied here.
// ---------------------------------------------------------------------------

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  OTHER_OPTIONS_REVIEW_LABEL,
  OTHER_OPTIONS_REVIEW_OPEN_LABEL,
  OTHER_OPTIONS_TITLE,
} from "./optimiserOtherOptions.js";

export default function AdiOtherOptions({ options = [], className = "" }) {
  const [openKey, setOpenKey] = useState(null);
  const list = Array.isArray(options) ? options : [];
  if (!list.length) return null;

  return (
    <div
      className={`space-y-1.5 border-t border-[#EDEBE6] pt-2.5 ${className}`}
      data-adi-other-options={list.length}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
        {OTHER_OPTIONS_TITLE}
      </div>

      {list.map((option) => {
        const open = openKey === option.key;
        const detail = Array.isArray(option.detail) ? option.detail : [];
        return (
          <div
            key={option.key}
            className="rounded-md border border-[#E7E5E0] bg-[#FCFCFA] px-3 py-2"
            data-adi-other-option={option.key}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]">
              {option.title}
            </div>
            {option.headline && (
              <div className="text-[12.5px] font-semibold text-[#1B1A1A] leading-snug">
                {option.headline}
              </div>
            )}
            {option.support && (
              <div className="text-[11.5px] text-[#3E4349] leading-relaxed">{option.support}</div>
            )}

            {detail.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : option.key)}
                  aria-expanded={open}
                  data-adi-other-option-review={option.key}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[#213428] transition-colors hover:text-[#3E4349]"
                >
                  {open ? OTHER_OPTIONS_REVIEW_OPEN_LABEL : OTHER_OPTIONS_REVIEW_LABEL}
                  <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {open && (
                  <div
                    className="mt-1 space-y-0.5 border-l border-[#E7E5E0] pl-2"
                    data-adi-other-option-detail={option.key}
                  >
                    {detail.map((line) => (
                      <div key={line} className="text-[11px] text-[#625143] leading-relaxed">
                        {line}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}