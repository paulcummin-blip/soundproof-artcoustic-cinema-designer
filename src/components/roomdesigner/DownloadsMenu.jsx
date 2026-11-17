/**
 * DownloadsMenu
 * -------------
 * A compact dropdown that groups the two CAD download actions:
 *   · Product CAD Files — external Artcoustic Dropbox folder (opens new tab)
 *   · Project CAD Download — the active design version's DXF export
 *
 * Both actions keep their current destinations and download behaviour; this
 * component only changes how they are presented (one menu instead of two
 * permanently visible buttons).
 */
import React, { useState } from "react";
import { Download, ExternalLink, ChevronDown } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import ProjectCadExportButton from "./ProjectCadExportButton";

// External resource — Artcoustic product CAD files (Dropbox folder).
const PRODUCT_CAD_FILES_URL =
  "https://www.dropbox.com/scl/fo/uh8061fp2gcua4qya4vsl/AIB6tiWKiYJ1kmc1bkav8Ag?rlkey=13gap6ajvpnlgjs74u8jopctq&st=c8f27qoy&dl=0";

export default function DownloadsMenu({
  projectName,
  versionName,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#DCDBD6] bg-white px-3 py-1.5 text-xs font-semibold text-[#213428] hover:bg-[#F4F3F0] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          CAD Downloads
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-64 p-2 border-[#DCDBD6]">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => {
              window.open(PRODUCT_CAD_FILES_URL, "_blank", "noopener,noreferrer");
              setOpen(false);
            }}
            className="flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-[#F4F3F0] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#625143]" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#213428]">Product CAD Files</div>
              <div className="text-[10px] text-[#8B8378]">Artcoustic product library (opens new tab)</div>
            </div>
          </button>
          <div className="border-t border-[#E2DED7] my-1" />
          <div className="px-1 py-0.5">
            <ProjectCadExportButton
              projectName={projectName}
              versionName={versionName}
              disabled={disabled}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}