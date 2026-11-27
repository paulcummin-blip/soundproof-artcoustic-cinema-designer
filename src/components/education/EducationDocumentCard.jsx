import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { openEducationDocument, downloadEducationDocument } from './useEducationLibrary';

const BRAND_GREEN = '#213428';
const SHELF = '#C8C0B3';
const MUTED = '#625143';

function pageCountLabel(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return 'PDF';
  return `PDF · ${n} page${n === 1 ? '' : 's'}`;
}

// Temporary branded placeholder shown when a document has no persisted
// thumbnail (generation failed). Same portrait proportions as a PDF page so
// it sits on the shelf like the real covers.
function PlaceholderCover({ title }) {
  return (
    <div
      style={{
        height: '100%',
        aspectRatio: '1 / 1.414',
        maxWidth: '92%',
        background: BRAND_GREEN,
        color: '#FFFFFF',
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '14px 12px',
        boxShadow: '0 10px 22px rgba(0,0,0,0.16)',
      }}
    >
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.8 }}>
        Sound Proof
      </div>
      <div
        style={{
          fontFamily: "'Didact Gothic', sans-serif",
          fontSize: 15,
          fontWeight: 600,
          lineHeight: 1.2,
          textAlign: 'center',
        }}
      >
        {title || 'Document'}
      </div>
      <div style={{ fontSize: 7, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7, textAlign: 'center' }}>
        Technical Education Series
      </div>
    </div>
  );
}

export default function EducationDocumentCard({ document: doc, isNew }) {
  const [busy, setBusy] = useState(false);
  if (!doc) return null;

  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await openEducationDocument(doc.file_uri);
    } finally {
      setBusy(false);
    }
  };

  const download = async (e) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await downloadEducationDocument(doc.file_uri, doc.file_name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Thumbnail sits on the shelf: bottom-aligned, fixed height so all
          documents in a row share a base. The shelf line is the bottom border;
          with zero column gap it runs continuously across the row. */}
      <div
        onClick={open}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') open();
        }}
        className="group"
        style={{
          height: 260,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          borderBottom: `1px solid ${SHELF}`,
          cursor: busy ? 'default' : 'pointer',
          position: 'relative',
          padding: '0 4px',
        }}
      >
        {doc.thumbnailSignedUrl ? (
          <img
            src={doc.thumbnailSignedUrl}
            alt={doc.title}
            loading="lazy"
            style={{
              maxHeight: '100%',
              maxWidth: '92%',
              objectFit: 'contain',
              width: 'auto',
              height: 'auto',
              boxShadow: '0 10px 22px rgba(0,0,0,0.13)',
            }}
            className="transition-transform duration-300 ease-out group-hover:-translate-y-1"
          />
        ) : (
          <div
            className="transition-transform duration-300 ease-out group-hover:-translate-y-1"
            style={{ height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          >
            <PlaceholderCover title={doc.title} />
          </div>
        )}

        {/* Discreet download control, revealed on hover */}
        <button
          type="button"
          onClick={download}
          title="Download PDF"
          aria-label="Download PDF"
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{
            position: 'absolute',
            bottom: 10,
            right: 6,
            width: 30,
            height: 30,
            borderRadius: 6,
            border: 'none',
            background: 'rgba(255,255,255,0.92)',
            color: BRAND_GREEN,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
          }}
        >
          <Download size={15} />
        </button>
      </div>

      <div style={{ paddingTop: 14, paddingBottom: 36, paddingRight: 8 }}>
        <div
          onClick={open}
          className="hover:underline"
          style={{
            fontFamily: "'Didact Gothic', sans-serif",
            fontSize: 15,
            fontWeight: 600,
            color: '#1B1A1A',
            lineHeight: 1.25,
            cursor: 'pointer',
            wordBreak: 'break-word',
          }}
        >
          {doc.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 12, color: MUTED }}>{pageCountLabel(doc.page_count)}</span>
          {isNew ? (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#FFFFFF',
                background: BRAND_GREEN,
                padding: '2px 6px',
                borderRadius: 4,
                lineHeight: 1,
              }}
            >
              New
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}