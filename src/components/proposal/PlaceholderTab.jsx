import React from 'react';
import { Construction } from 'lucide-react';

/**
 * Placeholder tab for future Proposal Centre sections
 * (Templates, Product Library, Proposal History).
 *
 * Props:
 * - title: string
 * - description: string
 */
export default function PlaceholderTab({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 bg-white border border-[#DCDBD6] rounded-lg">
      <Construction className="w-10 h-10 text-[#625143] mb-4" />
      <h3
        className="text-lg font-bold text-[#1B1A1A]"
        style={{ fontFamily: 'Didact Gothic, sans-serif' }}
      >
        {title}
      </h3>
      <p className="text-sm text-[#625143] mt-2 text-center max-w-md px-6">
        {description}
      </p>
    </div>
  );
}