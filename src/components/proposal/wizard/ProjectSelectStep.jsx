import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, ChevronRight, Loader2 } from 'lucide-react';

/**
 * Step 1 — Select Project.
 * Lists every non-archived project available to the current dealer.
 * Displays project name, client, last modified, status, and version count.
 * Supports searching and sorting.
 */
export default function ProjectSelectStep({ selectedProjectId, onSelect }) {
  const [projects, setProjects] = useState([]);
  const [versionCounts, setVersionCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('updated');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [projectResults, versionResults] = await Promise.all([
          base44.entities.Project.list('-updated_date', 200),
          base44.entities.ProjectVersion.list('-updated_date', 500),
        ]);
        if (cancelled) return;
        const nonArchived = (projectResults || []).filter(
          (p) => p.lifecycle_status !== 'Archived'
        );
        setProjects(nonArchived);
        const counts = {};
        (versionResults || []).forEach((v) => {
          const pid = v.project_id;
          if (pid) counts[pid] = (counts[pid] || 0) + 1;
        });
        setVersionCounts(counts);
      } catch (err) {
        console.error('Failed to load projects:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = projects;
    if (q) {
      list = list.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.client_name || '').toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sortBy === 'updated') {
      sorted.sort((a, b) => new Date(b.updated_date || 0) - new Date(a.updated_date || 0));
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortBy === 'client') {
      sorted.sort((a, b) => (a.client_name || '').localeCompare(b.client_name || ''));
    }
    return sorted;
  }, [projects, search, sortBy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-[#625143] animate-spin" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm text-[#625143] py-8 text-center">
        No projects available. Create a project first.
      </p>
    );
  }

  return (
    <div>
      {/* Search + Sort */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#625143]" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-[#DCDBD6] bg-white text-[#1B1A1A] focus:outline-none focus:border-[#213428]"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 text-sm rounded-md border border-[#DCDBD6] bg-white text-[#3E4349] focus:outline-none focus:border-[#213428]"
        >
          <option value="updated">Last Modified</option>
          <option value="name">Project Name</option>
          <option value="client">Client</option>
        </select>
      </div>

      {/* Project list */}
      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-[#625143] py-4 text-center">No projects match your search.</p>
        ) : (
          filtered.map((p) => {
            const isSelected = selectedProjectId === p.id;
            const versionCount = versionCounts[p.id] || 0;
            const updated = p.updated_date
              ? new Date(p.updated_date).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : '—';
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={`w-full text-left p-4 rounded-lg border transition-colors ${
                  isSelected
                    ? 'bg-[#213428] text-white border-[#213428]'
                    : 'bg-white text-[#1B1A1A] border-[#DCDBD6] hover:bg-[#F5F4F0]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-semibold truncate"
                      style={{ fontFamily: 'Didact Gothic, sans-serif' }}
                    >
                      {p.name || 'Untitled Project'}
                    </div>
                    <div
                      className={`text-sm mt-0.5 ${isSelected ? 'text-white/70' : 'text-[#625143]'}`}
                    >
                      {p.client_name || 'No client'}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs ml-4 shrink-0">
                    <div className="text-right">
                      <div className={isSelected ? 'text-white/50' : 'text-[#625143]'}>Modified</div>
                      <div className={isSelected ? 'text-white/80' : 'text-[#3E4349]'}>
                        {updated}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={isSelected ? 'text-white/50' : 'text-[#625143]'}>Status</div>
                      <div className={isSelected ? 'text-white/80' : 'text-[#3E4349]'}>
                        {p.project_status || '—'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={isSelected ? 'text-white/50' : 'text-[#625143]'}>Versions</div>
                      <div className={isSelected ? 'text-white/80' : 'text-[#3E4349]'}>
                        {versionCount}
                      </div>
                    </div>
                  </div>
                  {isSelected && <ChevronRight className="w-5 h-5 ml-2 shrink-0" />}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}