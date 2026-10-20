import React from 'react';
import { Loader2 } from 'lucide-react';
import { AUTO_ADI_STATUS } from '@/components/proposal/editor/useAutoAdiRewrite';

/** Subtle status line for the automatic ADI pass, with Retry on failure. */
export default function AutoAdiStatusBar({ status, running, onRetry }) {
  if (status === AUTO_ADI_STATUS.RUNNING) {
    return (
      <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-[#625143] bg-[#F8F8F7] border-b border-[#C1B6AD]">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ADI is preparing your report…
      </div>
    );
  }
  if (status === AUTO_ADI_STATUS.FAILED) {
    return (
      <div className="flex items-center gap-3 px-4 py-1.5 text-xs text-[#4A230F] bg-[#F1F0EE] border-b border-[#C1B6AD]">
        ADI could not finish preparing your report.
        <button type="button" disabled={running} onClick={onRetry} className="underline font-semibold">
          Retry
        </button>
      </div>
    );
  }
  return null;
}