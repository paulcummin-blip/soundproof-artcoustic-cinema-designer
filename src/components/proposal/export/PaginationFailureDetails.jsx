/**
 * PaginationFailureDetails
 * ------------------------
 * The master-admin technical record of a pagination stop.
 *
 * When the measured compositor refuses to fragment an oversized block it stops
 * the export and says one plain sentence. This shows the master admin WHAT
 * stopped it — the section, the editorial composition, the element, its measured
 * height and the printable height it exceeded — with COPY DIAGNOSTICS so the
 * record can be pasted into a diagnosis without opening the console.
 *
 * Presentation of an identity and millimetres only: the record carries no
 * narrative, no client name and no file. A dealer login never sees it.
 */

import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';

import { REPORT_FONT_BODY as FONT } from '@/components/report/typography/reportTypography';
import { useAuth } from '@/lib/AuthContext';
import { isMasterAdmin } from '@/lib/accountAccess';
import { formatPaginationFailureDiagnostics } from '@/components/proposal/export/composition/paginationFailureDiagnostics';

export default function PaginationFailureDetails({ diagnostics }) {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  // A dealer account is never shown a technical record of the compositor.
  if (!diagnostics || !isMasterAdmin(user)) return null;

  const isReadiness = diagnostics.kind === 'print_readiness';
  const text = isReadiness ? JSON.stringify(diagnostics, null, 2) : formatPaginationFailureDiagnostics(diagnostics);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  };

  return (
    <details className="mt-2 rounded-md border border-[#DCDBD6] bg-white">
      <summary
        className="flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-[0.12em] cursor-pointer select-none"
        style={{ color: '#4A230F', fontFamily: FONT }}
      >
        <AlertCircle className="w-3.5 h-3.5" />
        Technical detail — {isReadiness ? 'print preparation' : 'oversized block'}
      </summary>

      <div className="px-3 pb-3">
        <pre
          className="mt-1 max-h-72 overflow-auto rounded border border-[#DCDBD6] bg-[#F5F4F0] p-3 text-[11px] leading-relaxed whitespace-pre-wrap"
          style={{ color: '#3E4349', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        >
          {text}
        </pre>

        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-1.5 rounded border border-[#B99B70] text-[11px] uppercase tracking-[0.12em] text-[#4A230F] transition-colors hover:bg-[#FBF3E6]"
            style={{ fontFamily: FONT }}
          >
            Copy diagnostics
          </button>
          {copied && (
            <span className="text-[11px]" style={{ color: '#213428', fontFamily: FONT }}>
              Copied
            </span>
          )}
          {copyFailed && (
            <span className="text-[11px]" style={{ color: '#4A230F', fontFamily: FONT }}>
              Clipboard unavailable — select the text above and copy it.
            </span>
          )}
        </div>
      </div>
    </details>
  );
}