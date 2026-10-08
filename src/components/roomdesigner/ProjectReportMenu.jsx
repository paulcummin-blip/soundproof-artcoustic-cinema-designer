/**
 * ProjectReportMenu.jsx
 * ---------------------
 * The Room Designer's ONE report entry point.
 *
 * The action bar used to carry two separate report buttons — Visual Report and
 * Technical Report — which asked the designer to decide from the header which
 * report they wanted. This file replaces both with a single "Project Report"
 * action: one report button, opening the report area for the active project and
 * the version on screen.
 *
 * Presentation only. It resolves each entry to the SHARED report route and hands
 * the chosen key back to the caller, which opens it through the header's existing
 * project + version link. No report generation, no report authority, no readiness
 * logic and no export naming lives here: the report pages keep their own
 * readiness and their own generate / update flows untouched.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, Eye, ClipboardList, ChevronDown } from "lucide-react";
import { PROJECT_REPORT_ENTRIES } from "@/components/roomdesigner/projectReportEntries";

/** The icon a menu entry asks for. */
const ENTRY_ICONS = { eye: Eye, "file-text": FileText, "clipboard-list": ClipboardList };

export default function ProjectReportMenu({ disabled = false, onSelect = null }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="secondary"
          className="font-semibold border-[#213428] text-[#213428] whitespace-nowrap"
          disabled={disabled}
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <FileText className="w-4 h-4 mr-2" style={{ flexShrink: 0 }} />
          Project Report
          <ChevronDown className="w-3 h-3 ml-2" style={{ flexShrink: 0 }} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {PROJECT_REPORT_ENTRIES.map(({ key, label, icon }) => {
          const Icon = ENTRY_ICONS[icon] || FileText;
          return (
            <DropdownMenuItem
              key={key}
              className="cursor-pointer"
              onSelect={() => onSelect?.(key)}
            >
              <Icon className="w-4 h-4 mr-2" />
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}