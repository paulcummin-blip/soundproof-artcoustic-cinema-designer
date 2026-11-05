// RotateRoomConfirmDialog.jsx
//
// Safety confirmation for the Rotate Room action. Rotating swaps effective
// Width/Length and resets the current version's design, so the designer is
// asked to confirm before any state changes. No data changes until the
// designer presses "Rotate Room"; Cancel leaves everything exactly as it was.

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const BUTTON_PRIMARY =
  "inline-flex items-center rounded-md bg-[#213428] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#3E4349]";
const BUTTON_SECONDARY =
  "inline-flex items-center rounded-md border border-[#D9D5CE] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#213428] transition-colors hover:border-[#213428]";

export default function RotateRoomConfirmDialog({ open, onCancel, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel?.(); }}>
      <DialogContent className="sm:max-w-[420px]" style={{ borderRadius: 12 }}>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Didact Gothic, sans-serif", fontSize: 18, color: "#1B1A1A" }}>
            Rotate Room?
          </DialogTitle>
        </DialogHeader>

        <p style={{ fontSize: 13, color: "#3E4349", lineHeight: 1.5, margin: "4px 0 10px" }}>
          Rotating the room will reset all current design aspects.
        </p>
        <p
          style={{
            fontSize: 13,
            color: "#1B1A1A",
            lineHeight: 1.5,
            fontWeight: 700,
            margin: "0 0 18px",
          }}
        >
          SAVE AS A NEW VERSION FIRST
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" className={BUTTON_SECONDARY} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={BUTTON_PRIMARY} onClick={onConfirm}>
            Rotate Room
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}