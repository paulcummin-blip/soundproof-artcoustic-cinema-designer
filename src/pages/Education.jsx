import React, { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { markEducationVisited } from '@/lib/educationUnread';
import { useEducationLibrary } from '@/components/education/useEducationLibrary';
import EducationDocumentCard from '@/components/education/EducationDocumentCard';
import EducationEmptyState from '@/components/education/EducationEmptyState';

const TEXT_DARK = '#1B1A1A';
const SUBTEXT = '#3E4349';

export default function Education() {
  const { user } = useAuth();
  const { docs, loading, error } = useEducationLibrary();

  // Mark Education visited for the current user once the page successfully opens.
  // Runs after mount (successful open) and persists per-user via updateMe.
  useEffect(() => {
    markEducationVisited();
  }, []);

  return (
    <div className="w-full min-h-full" style={{ background: 'rgb(248 248 247)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "'Didact Gothic', sans-serif",
              fontSize: 28,
              fontWeight: 600,
              color: TEXT_DARK,
              letterSpacing: '0.02em',
            }}
          >
            Education
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 15, color: SUBTEXT }}>
            Technical guidance, acoustic principles and professional home cinema design resources.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: SUBTEXT, padding: 48 }}>Loading…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', color: '#9B2C2C', padding: 24, background: '#FFFFFF', border: '1px solid #DCDBD6', borderRadius: 8 }}>
            {error}
          </div>
        ) : docs.length === 0 ? (
          <EducationEmptyState />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 18,
            }}
          >
            {docs.map((doc) => (
              <EducationDocumentCard key={doc.id} document={doc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}