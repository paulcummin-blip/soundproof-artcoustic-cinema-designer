import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
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
  const [lastVisited, setLastVisited] = useState(null);

  // Capture the user's pre-visit timestamp (for the per-document "New"
  // indicator), then mark Education visited for this user only.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!cancelled) setLastVisited(me?.education_last_visited_at || null);
      } catch {
        // ignore — fall back to "never visited"
      }
      if (!cancelled) markEducationVisited();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isNewDoc = (doc) => {
    if (!doc.new_content_at) return false;
    if (!lastVisited) return true;
    return new Date(doc.new_content_at).getTime() > new Date(lastVisited).getTime();
  };

  return (
    <div className="w-full min-h-full" style={{ background: '#F6F4EE', padding: '40px 24px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "'Didact Gothic', sans-serif",
              fontSize: 30,
              fontWeight: 600,
              color: TEXT_DARK,
              letterSpacing: '0.02em',
            }}
          >
            Education
          </h1>
          <p style={{ margin: '8px 0 0', fontSize: 15, color: SUBTEXT }}>
            Technical knowledge and professional cinema design resources.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: SUBTEXT, padding: 64 }}>Loading…</div>
        ) : error ? (
          <div
            style={{
              textAlign: 'center',
              color: '#9B2C2C',
              padding: 24,
              background: '#FFFFFF',
              border: '1px solid #DCDBD6',
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        ) : docs.length === 0 ? (
          <EducationEmptyState />
        ) : (
          // Bookshelf: zero column gap so each row's bottom-border shelf line
          // runs continuously; documents are centred and narrower than their
          // cells, giving generous spacing. ~4 per row on a wide desktop,
          // reducing naturally on smaller screens.
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              columnGap: 0,
            }}
          >
            {docs.map((doc) => (
              <EducationDocumentCard key={doc.id} document={doc} isNew={isNewDoc(doc)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}