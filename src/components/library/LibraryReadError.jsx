/**
 * LibraryReadError
 * ----------------
 * A small, reusable read-failure state for the Project Library tabs.
 *
 * Distinguishes a failed read from a successfully loaded but empty library:
 * the empty library shows its own "No … yet" message, while a failed read
 * shows this error with a Retry action. When previous rows were retained
 * from an earlier successful load, pass `variant="banner"` so the rows stay
 * visible below the banner.
 */
import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

export default function LibraryReadError({ onRetry, variant = 'full' }) {
  if (variant === 'banner') {
    return (
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 mb-4 rounded-lg border border-[#E5C6C6] bg-[#FBF3F3]"
        role="alert"
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className="w-4 h-4 shrink-0" style={{ color: '#9B3A3A' }} />
          <span
            className="text-xs text-[#7A2E2E] truncate"
            style={{ fontFamily: REPORT_FONT_BODY }}
          >
            Some assets could not be loaded. The items shown may be incomplete.
          </span>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[#DCDBD6] text-[#3E4349] bg-white hover:bg-[#F8F8F7] transition-colors shrink-0"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <AlertCircle className="w-9 h-9 mb-4" style={{ color: '#9B3A3A' }} />
      <p
        className="text-sm text-[#7A2E2E] text-center max-w-md leading-relaxed"
        style={{ fontFamily: REPORT_FONT_BODY }}
      >
        These assets could not be loaded. Please try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex items-center gap-2 px-6 py-3 text-xs uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3E4349]"
        style={{ backgroundColor: '#213428', fontFamily: REPORT_FONT_BODY }}
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Retry
      </button>
    </div>
  );
}