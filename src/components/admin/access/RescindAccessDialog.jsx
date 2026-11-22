import React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Confirmation for the only two access-changing actions on this page.
 * Both route through the existing manageSoundProofAccess authority:
 *   rescind  → "suspend" (status "suspended", linked-user flags cleared, audited)
 *   reinstate → "restore" (status "active"; users re-enabled only if the
 *               90-day term has not expired)
 *
 * Props: open, onOpenChange, row, mode ("rescind" | "reinstate"), onConfirm, busy, error
 */
export default function RescindAccessDialog({
  open,
  onOpenChange,
  row,
  mode = "rescind",
  onConfirm,
  busy = false,
  error = null,
}) {
  const dealer = row?.account?.name || "this dealer";
  const isRescind = mode === "rescind";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">
            {isRescind ? "Rescind Sound Proof access" : "Reinstate Sound Proof access"}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-[13px] leading-relaxed">
            {isRescind ? (
              <span className="block">
                You are about to suspend Sound Proof access for {dealer}. Existing projects will remain
                stored but users will not be able to create/open projects until access is restored.
              </span>
            ) : (
              <span className="block">
                Restore Sound Proof access for {dealer}? Their users will be able to open and create
                projects again using their existing credits.
              </span>
            )}
            <span className="block text-[12px] text-[#625143]">
              {isRescind
                ? "This suspends Sound Proof access through the secure authority: account status, linked-user flags and audit events are updated together. The dealer account, Partner Portal identity, memberships, credits and all projects are preserved."
                : "This restores access through the secure authority. If the 90-day term has expired, users are not re-enabled until the term is renewed. No credits or projects are changed."}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-800">{error}</div>
        )}

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              onConfirm?.();
            }}
            className={isRescind ? "bg-[#B23A3A] text-white hover:bg-[#8F2F2F]" : "bg-[#213428] text-white hover:bg-[#3E4349]"}
          >
            {busy ? "Working…" : isRescind ? "Rescind access" : "Reinstate access"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}