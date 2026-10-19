import React, { useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import AdiKnowledgeRow from '@/components/admin/adiKnowledge/AdiKnowledgeRow';
import useAdiKnowledgeRecords from '@/components/admin/adiKnowledge/useAdiKnowledgeRecords';

/**
 * AdiDesignKnowledgePanel
 * -----------------------
 * WHAT ADI HAS LEARNED, AND WHAT IT MAY STILL BE ASKED ABOUT.
 *
 * Why it exists: learned design knowledge is only trustworthy if it can be read and
 * corrected. This panel lists every matter ADI holds — the design condition it belongs
 * to, the canonical rationale, its confidence, how many separate projects gave that
 * reason and when it was last confirmed — and offers the five curation decisions on
 * each row. A matter still being learned and a matter that a later answer disputed are
 * shown as they are, so nothing is quietly treated as settled knowledge.
 *
 * Master-admin only, and never part of a dealer's or client's workflow.
 */
export default function AdiDesignKnowledgePanel() {
  const { records, loading, error, busy, applyAction } = useAdiKnowledgeRecords();

  const counts = useMemo(() => records.reduce((totals, record) => {
    const key = record?.status || 'candidate';
    return { ...totals, [key]: (totals[key] || 0) + 1 };
  }, {}), [records]);

  return (
    <section className="rounded-xl border border-[#E5E1D8] bg-[#FBFAF7] p-5">
      <div className="mb-1 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-[#213428]" />
        <h2 className="text-base font-semibold text-[#1B1A1A]" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
          ADI Design Knowledge
        </h2>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-[#625143]">
        Reasons designers have given for the same design decision in separate projects. One answer is a
        candidate, two matching answers strengthen it, and three make it learned knowledge that ADI no longer
        asks about. A later answer that disagrees reduces confidence and returns it to the question. This is
        design understanding only: it never changes a figure, a level, a product or a result.
      </p>

      {error && (
        <div className="mb-3 rounded-md border border-[#E8D9C7] bg-[#FBF7F1] p-3 text-xs text-[#6B4A2A]">
          {error}
        </div>
      )}

      {loading && <p className="text-xs text-[#8A8477]">Reading what ADI has learned…</p>}

      {!loading && records.length === 0 && (
        <p className="rounded-md border border-[#E5E1D8] bg-white p-4 text-xs text-[#625143]">
          Nothing learned yet. ADI builds design knowledge from the reasons designers give to its clarification
          questions, and only where the same reason comes back from separate projects.
        </p>
      )}

      {records.length > 0 && (
        <div className="mb-3 text-[11px] text-[#8A8477]">
          {records.length} matter{records.length === 1 ? '' : 's'} · {counts.learned || 0} learned ·{' '}
          {counts.strengthened || 0} strengthened · {counts.candidate || 0} candidate · {counts.disabled || 0} disabled
        </div>
      )}

      <div className="space-y-3">
        {records.map((record) => (
          <AdiKnowledgeRow
            key={record.id || record.knowledge_key}
            record={record}
            records={records}
            busy={busy}
            onAction={applyAction}
          />
        ))}
      </div>
    </section>
  );
}