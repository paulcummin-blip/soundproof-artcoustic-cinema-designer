import React, { useCallback, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportSpeakerDesignPdf } from "@/components/roomdesigner/speakerDesignPdf";
import useReportFilenameIdentity from "@/components/report/useReportFilenameIdentity";
import { useActiveProjectId } from "@/components/state/project-session";

/**
 * SpeakerDesignPdfButton
 *
 * Exports the Current Speaker Design panel's own list as a PDF — Position, Model
 * and Qty only. It is a quick equipment schedule: no Project Report is created,
 * no report record is written and no report evidence is touched, so the export
 * can never change the client's report.
 *
 * The filename identity — project name, dealer, client name and project
 * reference — is resolved from the authoritative Project record and the owning
 * account, exactly as the Project Library copy of this same schedule is named.
 * The two documents can therefore never carry different names. The rows and the
 * version are supplied by the panel.
 */
export default function SpeakerDesignPdfButton({
  groups = [],
  projectName = null,
  dealerName = null,
  clientName = null,
  projectReference = null,
  versionName = null,
  versionNumber = null,
  layout = null,
  disabled = false,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const isEmpty = !Array.isArray(groups) || groups.length === 0;
  const activeProjectId = useActiveProjectId();
  const identity = useReportFilenameIdentity(activeProjectId ? { id: activeProjectId } : null);

  // A field the records do not hold is omitted, never invented: the caller's own
  // value stands in only while the authoritative read is still resolving.
  const filename = {
    projectName: identity.projectName || projectName,
    dealerName: identity.dealerName || dealerName,
    clientName: identity.clientName || clientName,
    projectReference: identity.projectReference || projectReference,
  };

  const handleClick = useCallback(async () => {
    if (disabled || busy || isEmpty) return;
    setError(null);
    setBusy(true);
    try {
      // The print window is opened inside this call, before its first await, so
      // the browser still sees the click as the user gesture that allowed it.
      const outcome = await exportSpeakerDesignPdf({
        groups,
        projectName: filename.projectName,
        dealerName: filename.dealerName,
        clientName: filename.clientName,
        projectReference: filename.projectReference,
        versionName,
        versionNumber,
        layout,
      });
      if (!outcome?.printed) setError(outcome?.message || "The PDF could not be prepared.");
    } catch {
      setError("The PDF could not be prepared. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [
    busy, disabled, groups, isEmpty, layout, versionName, versionNumber,
    filename.projectName, filename.dealerName, filename.clientName, filename.projectReference,
  ]);

  return (
    <div className="flex flex-col items-start sm:items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        className="font-medium border-[#213428] text-[#213428] whitespace-nowrap"
        style={{ whiteSpace: "nowrap", flexShrink: 0 }}
        onClick={handleClick}
        disabled={disabled || busy || isEmpty}
        title={
          isEmpty
            ? "There is no speaker design to export for this version yet."
            : "Download this speaker design as a PDF"
        }
      >
        <Download className="w-4 h-4 mr-2" style={{ flexShrink: 0 }} />
        {busy ? "Preparing PDF…" : "Download Speaker Design PDF"}
      </Button>
      {error && (
        <p className="text-xs text-red-700 max-w-[280px] text-left sm:text-right">{error}</p>
      )}
    </div>
  );
}