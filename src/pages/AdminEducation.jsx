import React from 'react';
import EducationAdminManager from '@/components/education/EducationAdminManager';

const BRAND = {
  bg: 'rgb(248 248 247)',
  text: '#1B1A1A',
  subtext: '#3E4349',
};

export default function AdminEducation() {
  return (
    <div style={{ padding: 24, background: BRAND.bg, minHeight: '100vh', color: BRAND.text }}>
      <EducationAdminManager />
    </div>
  );
}