import React from 'react';
import moment from 'moment';
import { FileText, ExternalLink, Download } from 'lucide-react';
import {
  openEducationDocument,
  downloadEducationDocument,
} from './useEducationLibrary';

const BRAND_GREEN = '#213428';
const SUBTEXT = '#3E4349';
const MUTED = '#625143';

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EducationDocumentCard({ document: doc }) {
  const [busy, setBusy] = React.useState(false);
  if (!doc) return null;

  const dateAdded = doc.published_at || doc.created_date;
  const dateLabel = dateAdded ? moment(dateAdded).format('D MMM YYYY') : '';

  const handleOpen = async () => {
    setBusy(true);
    try {
      await openEducationDocument(doc.file_uri);
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    setBusy(true);
    try {
      await downloadEducationDocument(doc.file_uri, doc.file_name);
    } finally {
      setBusy(false);
    }
  };

  const sizeLabel = formatBytes(doc.file_size);

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #DCDBD6',
        borderRadius: 8,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div
          style={{
            flexShrink: 0,
            width: 44,
            height: 52,
            borderRadius: 4,
            background: '#F3EFEA',
            border: '1px solid #E2DDD6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FileText size={22} strokeWidth={1.6} style={{ color: BRAND_GREEN }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: "'Didact Gothic', sans-serif",
              fontSize: 16,
              fontWeight: 600,
              color: '#1B1A1A',
              lineHeight: 1.25,
              wordBreak: 'break-word',
            }}
          >
            {doc.title}
          </div>
          {doc.description ? (
            <div style={{ fontSize: 13, color: SUBTEXT, marginTop: 6, lineHeight: 1.45 }}>
              {doc.description}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: MUTED }}>
        <span>Added {dateLabel}</span>
        {sizeLabel ? (
          <>
            <span style={{ color: '#C9C5BE' }}>·</span>
            <span>{sizeLabel}</span>
          </>
        ) : null}
        <span style={{ color: '#C9C5CE' }}>·</span>
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, fontSize: 10 }}>PDF</span>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
        <button
          type="button"
          onClick={handleOpen}
          disabled={busy}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 6,
            background: BRAND_GREEN, color: '#FFFFFF',
            fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
            border: 'none', opacity: busy ? 0.6 : 1,
          }}
        >
          <ExternalLink size={15} strokeWidth={2} />
          Open PDF
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={busy}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 6,
            background: '#FFFFFF', color: BRAND_GREEN,
            fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
            border: '1px solid #C9C5BE', opacity: busy ? 0.6 : 1,
          }}
        >
          <Download size={15} strokeWidth={2} />
          Download
        </button>
      </div>
    </div>
  );
}