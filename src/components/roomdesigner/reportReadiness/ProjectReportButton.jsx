/**
 * ProjectReportButton
 * -------------------
 * The single Project Report action on the project (Room Designer) page.
 *
 * The verdict it shows is handed to it by useProjectReportReadiness — the same
 * canonical readiness and saved-report authorities the report page itself reads.
 * This component decides nothing about readiness; it states the verdict and
 * either opens the report or explains, in place, what the report is waiting for.
 *
 *   ready            opens the Project Report
 *   waiting          navigation is blocked; the popover names what is missing
 *   update_required  the design moved on; the popover offers the update
 */

import React from 'react';
import { Check, Clock, FileText, TriangleAlert } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { PROJECT_REPORT_BUTTON_LABEL, PROJECT_REPORT_VERDICT } from './projectReportReadiness';

/** Per-verdict presentation. Written as literal class names so the build keeps them. */
const VERDICT_STYLE = {
  [PROJECT_REPORT_VERDICT.READY]: {
    button: 'bg-[#213428] text-white border-transparent hover:bg-[#3E4349]',
    status: '✓ Ready',
    statusClass: 'text-[#2E7D4F]',
    icon: Check,
    title: 'PROJECT REPORT',
  },
  [PROJECT_REPORT_VERDICT.WAITING]: {
    button: 'bg-white text-[#625143] border-[#DCDBD6] hover:bg-[#F8F8F7]',
    status: 'Waiting',
    statusClass: 'text-[#8A6D1F]',
    icon: Clock,
    title: 'PROJECT REPORT NOT READY',
  },
  [PROJECT_REPORT_VERDICT.UPDATE_REQUIRED]: {
    button: 'bg-[#B45309] text-white border-transparent hover:bg-[#92400E]',
    status: 'Update required',
    statusClass: 'text-white',
    icon: TriangleAlert,
    title: 'PROJECT REPORT NEEDS UPDATING',
  },
};

export default function ProjectReportButton({
  readiness,
  onOpen,
  onUpdate,
  disabled = false,
}) {
  const [open, setOpen] = React.useState(false);

  const verdict = readiness?.verdict || PROJECT_REPORT_VERDICT.WAITING;
  const style = VERDICT_STYLE[verdict] || VERDICT_STYLE[PROJECT_REPORT_VERDICT.WAITING];
  const StatusIcon = style.icon;
  const isReady = verdict === PROJECT_REPORT_VERDICT.READY;
  const canOpen = readiness?.canOpen === true;
  const canUpdate = readiness?.canUpdate === true;
  const missing = Array.isArray(readiness?.missing) ? readiness.missing : [];

  const handleClick = () => {
    if (disabled || readiness?.loading) return;
    if (canUpdate) {
      setOpen(true);
      return;
    }
    if (isReady && canOpen) {
      onOpen?.();
      return;
    }
    setOpen((value) => !value);
  };

  // Hovering or focusing a button that cannot open the report states why, in
  // place — no dead control.
  const revealExplanation = () => {
    if (disabled || isReady) return;
    setOpen(true);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          onMouseEnter={revealExplanation}
          onFocus={revealExplanation}
          aria-disabled={disabled || (!canOpen && !canUpdate)}
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${style.button} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <FileText className="w-4 h-4" style={{ flexShrink: 0 }} />
          <span className="flex flex-col items-start leading-tight" style={{ alignItems: 'flex-start' }}>
            <span style={{ fontSize: 9, letterSpacing: '0.08em' }}>
              {isReady ? 'PROJECT REPORT' : style.title}
            </span>
            <span className={`inline-flex items-center gap-1 ${style.statusClass}`} style={{ fontSize: 12 }}>
              <StatusIcon className="w-3 h-3" style={{ flexShrink: 0 }} />
              {style.status}
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4" sideOffset={8}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', fontWeight: 700, color: '#1B1A1A' }}>
          {style.title}
        </div>

        <p className="mt-2 text-sm text-[#3E4349]">{readiness?.reason}</p>

        {readiness?.detail && (
          <p className="mt-1 text-sm font-semibold text-[#8A6D1F]">{readiness.detail}</p>
        )}

        {missing.length > 0 && (
          <ul className="mt-3 space-y-2">
            {missing.map((item) => (
              <li key={item.key} className="text-xs text-[#625143]">
                <span className="font-semibold text-[#1B1A1A]">{item.label}</span>
                {item.action ? <span className="block">{item.action}</span> : null}
              </li>
            ))}
          </ul>
        )}

        {verdict === PROJECT_REPORT_VERDICT.UPDATE_REQUIRED && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-[#213428] text-white hover:bg-[#3E4349]"
              onClick={() => { setOpen(false); onUpdate?.(); }}
            >
              Update Project Report
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-[#DCDBD6] text-[#3E4349]"
              onClick={() => { setOpen(false); onOpen?.(); }}
            >
              View saved report
            </Button>
          </div>
        )}

        {verdict === PROJECT_REPORT_VERDICT.WAITING && (
          <p className="mt-4 text-xs text-[#737373]">
            The Project Report opens as soon as this project is fully assessed.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}