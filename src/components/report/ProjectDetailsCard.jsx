import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function ProjectDetailsCard({ project }) {
  if (!project) return null;

  const items = [
    { label: 'Project name', value: project.name || '—' },
    { label: 'Client name', value: project.client_name || '—' },
    { label: 'Project ID', value: project.id || '—' },
    { label: 'Last updated', value: formatDate(project.updated_date) },
  ];

  return (
    <Card className="bg-white border-[#DCDBD6]">
      <CardContent className="p-4 md:p-5">
        <div className="mb-3">
          <div className="text-sm font-semibold text-[#1B1A1A]">Project details</div>
          <div className="text-xs text-[#625143] mt-1">Current saved project linked to this report.</div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div key={item.label} className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#625143]">
                {item.label}
              </div>
              <div className="mt-1 truncate text-sm font-medium text-[#1B1A1A]">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}