/**
 * ProposalEditCopyPreview
 * -----------------------
 * The copy as the client would read it, and the export of exactly that copy.
 *
 * What is previewed and exported is the resolved copy — the latest valid edit if
 * one exists, otherwise the original validated generated output — so the screen
 * and the exported PDF can never show different words. The export is offered only
 * while the copy may be issued: an invalid newest edit blocks it, and the last
 * good copy stays on screen to be reverted to.
 *
 * The print node is hidden on screen and re-shown inside the app-owned print
 * window, the same mechanism every other Sound Proof report exports through.
 *
 * Props:
 * - layer: the resolved copy layer
 * - title: the proposal title, used for the exported filename
 * - readOnly: the proposal is archived
 */

import React, { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import {
  REPORT_FONT_BODY as FONT_BODY,
  REPORT_FONT_HEADING as FONT_HEADING,
} from '@/components/report/typography/reportTypography';
import {
  openReportPrintWindow,
  printReportInWindow,
} from '@/components/report/reportPrintWindow';

const NODE_CLASS = 'proposal-copy-print-portal';

const SOURCE_LABEL = {
  generated: 'Original generated copy',
  edit: 'Your edited copy',
};

/** Only ever visible in the print window: hidden on screen, shown when printed. */
const SCREEN_HIDE = `@media screen { .${NODE_CLASS} { display: none; } }`;
const PRINT_WINDOW_SHOW = `@media screen { .${NODE_CLASS} { display: block !important; } }`;

export default function ProposalEditCopyPreview({ layer, title = 'Proposal', readOnly = false }) {
  const nodeRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  const sections = layer?.export_sections || [];

  const handleExport = () => {
    if (!layer?.ready) return;
    const filename = `${title} - Proposal Copy`;
    const win = openReportPrintWindow(filename);
    if (!win) {
      setExportError('The print window could not be opened. Check your browser’s pop-up setting and try again.');
      return;
    }
    setExportError(null);
    setExporting(true);
    printReportInWindow(win, {
      title: filename,
      node: nodeRef.current,
      bodyClass: '',
      extraCss: PRINT_WINDOW_SHOW,
    }).finally(() => setExporting(false));
  };

  return (
    <div style={{ background: '#F5F4F0', borderTop: '1px solid #DCDBD6', padding: '20px 24px' }}>
      <style>{SCREEN_HIDE}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 400, color: '#213428' }}>
            {SOURCE_LABEL[layer?.copy?.source] || 'Proposal copy'}
          </h3>
          <p style={{ margin: '4px 0 0', fontFamily: FONT_BODY, fontSize: 12, color: '#8A8477' }}>
            {layer?.ready
              ? 'This is the copy that will be issued and exported.'
              : 'Shown for review. Issue and export are blocked until this copy is corrected or reverted.'}
          </p>
        </div>
        <button
          type="button"
          disabled={!layer?.ready || exporting || readOnly}
          onClick={handleExport}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            fontFamily: FONT_BODY,
            fontSize: 12,
            borderRadius: 6,
            cursor: layer?.ready && !readOnly ? 'pointer' : 'not-allowed',
            background: '#213428',
            color: '#FFFFFF',
            border: '1px solid #213428',
            opacity: !layer?.ready || readOnly ? 0.5 : 1,
          }}
        >
          <Download style={{ width: 14, height: 14 }} />
          {exporting ? 'Preparing…' : 'Export this copy'}
        </button>
      </div>

      {exportError && (
        <p style={{ margin: '10px 0 0', fontFamily: FONT_BODY, fontSize: 13, color: '#8B4A2B' }}>{exportError}</p>
      )}

      <div style={{ marginTop: 14, background: '#FFFFFF', border: '1px solid #DCDBD6', borderRadius: 8, padding: '18px 20px' }}>
        {sections.length === 0 ? (
          <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: 13, color: '#8A8477' }}>No copy to show yet.</p>
        ) : sections.map((section) => (
          <div key={section.section} style={{ marginBottom: 14 }}>
            <h4 style={{ margin: '0 0 4px', fontFamily: FONT_HEADING, fontSize: 13, fontWeight: 400, color: '#213428' }}>
              {layer.fields?.find((field) => field.section === section.section)?.title || section.section}
            </h4>
            <p style={{ margin: 0, fontFamily: FONT_BODY, fontSize: 13, lineHeight: 1.6, color: '#3E4349' }}>
              {section.text}
            </p>
          </div>
        ))}
      </div>

      {/* The printed copy. Hidden on screen; it is the page inside the print window. */}
      <div className={NODE_CLASS} ref={nodeRef}>
        <div style={{ padding: '32px 36px', fontFamily: FONT_BODY, color: '#3E4349' }}>
          <h1 style={{ margin: '0 0 4px', fontFamily: FONT_HEADING, fontSize: 22, fontWeight: 400, color: '#213428' }}>
            {title}
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8A8477' }}>
            Sound Proof · Proposal copy
          </p>
          {sections.map((section) => (
            <div key={`print-${section.section}`} style={{ marginBottom: 18 }}>
              <h2 style={{ margin: '0 0 6px', fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 400, color: '#213428' }}>
                {layer.fields?.find((field) => field.section === section.section)?.title || section.section}
              </h2>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>{section.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}