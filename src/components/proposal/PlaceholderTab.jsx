import React from 'react';

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
    <div className="flex flex-col items-center justify-center py-24 border-t border-[#E5E1D8]">
      <h3
        className="text-lg font-normal text-[#1B1A1A] tracking-tight"
        style={{ fontFamily: 'Didact Gothic, sans-serif' }}
      >
        {title}
      </h3>
      <p className="text-sm text-[#8A8477] mt-3 text-center max-w-md leading-relaxed">
        {description}
      </p>
    </div>
  );
}