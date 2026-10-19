import React from 'react';
import AdiDesignKnowledgePanel from '@/components/admin/adiKnowledge/AdiDesignKnowledgePanel';

/**
 * AdminAdiDesignKnowledge
 * -----------------------
 * THE MASTER-ADMIN PAGE FOR LEARNED DESIGN KNOWLEDGE.
 *
 * Why it exists: the knowledge ADI builds from repeated designer clarifications has to
 * be reviewable and correctable by a person. This page is the only place it is shown,
 * and it sits behind the master-admin gate — no dealer or client workflow can reach it.
 */
export default function AdminAdiDesignKnowledge() {
  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-[#1B1A1A]" style={{ fontFamily: 'Didact Gothic, sans-serif' }}>
          ADI Design Knowledge
        </h1>
        <p className="mt-1 text-xs text-[#625143]">
          Master admin only. Learned design knowledge, its design conditions and its confidence.
        </p>
      </header>
      <AdiDesignKnowledgePanel />
    </div>
  );
}