import React from 'react';
import { FileText } from 'lucide-react';

const SUBTEXT = '#3E4349';

export default function EducationEmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '64px 24px',
        background: '#FFFFFF',
        border: '1px solid #DCDBD6',
        borderRadius: 8,
        color: SUBTEXT,
      }}
    >
      <FileText size={36} strokeWidth={1.5} style={{ color: '#A66B5E', marginBottom: 16 }} />
      <div style={{ fontFamily: "'Didact Gothic', sans-serif", fontSize: 17, fontWeight: 600, color: '#1B1A1A', marginBottom: 6 }}>
        No documents yet
      </div>
      <div style={{ fontSize: 14, maxWidth: 420 }}>
        Technical guidance and design resources will appear here once your administrator publishes them.
      </div>
    </div>
  );
}