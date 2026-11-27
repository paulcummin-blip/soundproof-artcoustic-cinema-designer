import React from 'react';
import AdminSectionCard from '@/components/admin/AdminSectionCard';

/**
 * Admin Dashboard tile for the Education Library. Clicking it opens the
 * full admin management page at /admin/education.
 */
export default function EducationAdminTile() {
  return (
    <AdminSectionCard
      title="Education Library"
      description="Upload, publish, replace and remove technical PDF guides shared with all Sound Proof users."
      status="Ready"
      count="PDF library"
      href="/admin/education"
    />
  );
}