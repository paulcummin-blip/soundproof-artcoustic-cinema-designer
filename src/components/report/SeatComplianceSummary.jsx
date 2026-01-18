import React from 'react';
import { Card } from '@/components/ui/card';

const SUMMARY_BOXES = {
  left: {
    title: 'Position & Level',
    params: [
      { id: 'P1', desc: 'Minimum distance between the listening area and the room walls (dsw, dbw)' },
      { id: 'P4', desc: 'Maximum SPL difference between screen wall speakers' },
      { id: 'P5', desc: 'Maximum allowable horizontal angle between adjacent surround speakers' },
    ]
  },
  middle: {
    title: 'Balance & Geometry',
    params: [
      { id: 'P6', desc: 'Maximum SPL difference between surround speakers' },
      { id: 'P9', desc: 'Maximum allowable vertical angle between adjacent (L/R rows of) upper speakers' },
      { id: 'P10', desc: 'Maximum SPL difference between upper speakers' },
    ]
  },
  right: {
    title: 'The Consistency',
    params: [
      { id: 'P16', desc: 'Seat-to-seat frequency response variance across all screen wall speakers, normalised to measured RSP response between 500 Hz and 16 kHz (1-octave smoothing)' },
      { id: 'P17', desc: 'Seat-to-seat frequency response variance across all wide / surround / upper speakers, normalised to measured RSP response between 500 Hz and 16 kHz (1-octave smoothing)' },
      { id: 'P20', desc: 'Seat-to-seat frequency response relative to measured RSP response below the room\'s transition frequency per seat (1/3-octave smoothing)' },
    ]
  }
};

export default function SeatComplianceSummary({ position = 'left' }) {
  const box = SUMMARY_BOXES[position];
  if (!box) return null;

  return (
    <Card className="border bg-white border-[#DCDBD6] h-full">
      <div className="p-4" style={{ fontFamily: 'Didact Gothic, Century Gothic, sans-serif' }}>
        {/* Title */}
        <div className="mb-3">
          <h4 
            className="text-xs font-semibold text-[#1B1A1A]"
            style={{ fontFamily: 'Futura PT Light, Century Gothic, sans-serif' }}
          >
            {box.title}
          </h4>
          <div className="border-t border-[#E6E4DD] mt-2"></div>
        </div>

        {/* Parameters */}
        <div className="space-y-2.5">
          {box.params.map(param => (
            <div key={param.id} className="text-[10px] text-[#3E4349] leading-snug">
              <span className="font-normal">
                <strong>{param.id}</strong> — {param.desc}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}