import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * CurrentSpeakerDesignDialog
 *
 * The current speaker specification of ONE design version, read-only. Every model
 * name, count and position comes from the report's own product authority, so the
 * panel and the report equipment list always state the same system. There are no
 * edit controls here: changing speakers is done in the Speakers section.
 */

/** "12 Oct 2026" — the version's own last-updated date, when one is recorded. */
function formatUpdated(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Fact({ label, value }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#625143]">
        {label}
      </div>
      <div className="text-sm font-semibold text-[#1B1A1A] truncate">{value}</div>
    </div>
  );
}

export default function CurrentSpeakerDesignDialog({
  open,
  onOpenChange,
  speakerDesign = null,
  projectName = null,
  clientName = null,
  versionName = null,
  updatedDate = null,
}) {
  const groups = Array.isArray(speakerDesign?.groups) ? speakerDesign.groups : [];
  const isEmpty = speakerDesign?.isEmpty !== false;
  const updatedLabel = formatUpdated(updatedDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-white border-[#DCDBD6]">
        <DialogHeader>
          <DialogTitle className="font-header text-[#1B1A1A]">Current Speaker Design</DialogTitle>
          <DialogDescription className="text-[#3E4349]">
            Current speaker specification for this version.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg border border-[#DCDBD6] bg-[#F8F8F7] px-4 py-3">
          <Fact label="Project" value={projectName} />
          <Fact label="Client" value={clientName} />
          <Fact label="Version" value={versionName} />
          <Fact label="System layout" value={speakerDesign?.layout} />
          {updatedLabel && <Fact label="Last updated" value={updatedLabel} />}
        </div>

        {isEmpty ? (
          <p className="text-sm text-[#3E4349] py-6">
            No speaker design has been specified for this version yet.
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-6">
            {groups.map((group) => (
              <section key={group.key} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#213428]">
                  {group.title}
                </h3>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#DCDBD6] text-left text-[11px] uppercase tracking-[0.06em] text-[#625143]">
                      <th className="py-1.5 pr-3 font-semibold">Position</th>
                      <th className="py-1.5 pr-3 font-semibold">Model</th>
                      <th className="py-1.5 pr-3 font-semibold text-right">Qty</th>
                      <th className="py-1.5 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.key} className="border-b border-[#EFEDE8] last:border-b-0 align-top">
                        <td className="py-2 pr-3 text-[#3E4349]">{row.position}</td>
                        <td className="py-2 pr-3 font-medium text-[#1B1A1A]">{row.model}</td>
                        <td className="py-2 pr-3 text-right text-[#3E4349] tabular-nums">
                          {row.quantityLabel}
                        </td>
                        <td className="py-2 text-[#625143]">{row.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="font-medium">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}