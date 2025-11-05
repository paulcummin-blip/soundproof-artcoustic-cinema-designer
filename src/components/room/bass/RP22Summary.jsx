import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

function fmt1(v, fallback = '—') {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) : fallback;
}
function asText(v, fallback = '—') {
  return (v ?? '').toString().trim() || fallback;
}

export default function RP22Summary({ analysis }) {
  // Show nothing if truly absent
  if (!analysis) return null;

  // Defensive destructuring
  const {
    calculatedSPL,
    rp22Level,
    factors = {}
  } = analysis || {};

  const safeSPL = fmt1(calculatedSPL);
  const hasFactors = factors && typeof factors === 'object';

  return (
    <Card className="bg-[#FFFFFF] border-[#DCDBD6] relative overflow-hidden">
      <CardHeader>
        <CardTitle className="text-[#1B1A1A] font-header">
          RP22 Parameter 14: LFE SPL Capability
        </CardTitle>
        <CardDescription className="text-sm text-[#3E4349] font-body">
          Combined system output at MLP (C-weighted, in-room)
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-[#F9F8F6] rounded-lg border border-[#DCDBD6]">
          <div>
            <div className="text-2xl font-bold text-[#1B1A1A] font-header">
              {safeSPL} dB SPL
            </div>
            <p className="text-sm text-[#3E4349] font-body">Live-calculated Result</p>
          </div>
          <div className="text-right">
            <div className="text-lg font-header text-[#213428]">
              {asText(rp22Level)}
            </div>
            <p className="text-xs text-[#3E4349] font-body">RP22 Level Achieved</p>
          </div>
        </div>

        {hasFactors && (
          <div>
            <h4 className="font-header text-sm text-[#1B1A1A] mb-2">Factors Considered:</h4>
            <ul className="list-disc list-inside text-xs text-[#3E4349] font-body space-y-1">
              <li>Summation Gain: {fmt1(factors.summationGain, '0.0')} dB</li>
              <li>Average Boundary Gain: {fmt1(factors.boundaryGain, '0.0')} dB</li>
              <li>Destructive Nulls Count: {Number.isFinite(Number(factors.nullCount)) ? Number(factors.nullCount) : 0}</li>
            </ul>
          </div>
        )}
      </CardContent>

      <img
        src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/c0d2feeed_Artcoustic-logo_dark-grey-icon_TRANSPARENT_BACKGROUND.png"
        alt="Artcoustic Watermark"
        className="absolute bottom-3 right-3 w-16 h-16 opacity-[0.12] pointer-events-none"
      />
    </Card>
  );
}