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

export default function ProjectDetailsCard({
  project,
  extraItems = [],
  title = 'Project details',
  subtitle = 'Current saved project linked to this report.',
  className = 'bg-white border-[#DCDBD6]',
  contentClassName = 'p-4 md:p-5',
  gridClassName = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4',
}) {
  if (!project) return null;

  const items = [
    { label: 'Project name', value: project.name || '—' },
    { label: 'Client name', value: project.client_name || '—' },
    { label: 'Project ID', value: project.id || '—' },
    { label: 'Last updated', value: formatDate(project.updated_date) },
    ...extraItems,
  ];

  return (
    <Card className={className}>
      <CardContent className={contentClassName}>
        <div className="mb-3">
          <div className="text-sm font-semibold text-[#1B1A1A]">{title}</div>
          <div className="text-xs text-[#625143] mt-1">{subtitle}</div>
        </div>

        <div className={gridClassName}>
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