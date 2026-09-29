/**
 * ProposalCoverPage
 * -----------------
 * The proposal cover page — full-bleed imagery, a Sound Proof × partner
 * lockup, a lower-third title block and a branded footer strap.
 *
 * Used for BOTH the on-screen Proposal Editor cover and the exported PDF
 * cover, so the two are identical by construction.
 *
 * Background priority:
 *   1. the project's selected cover image (ProposalAsset cover_image)
 *   2. the Sound Proof / dealer hero image — the same image as the app header
 *
 * Branding priority:
 *   dealer logo → approved Artcoustic mark. Sound Proof is always the master
 *   brand; the partner mark is always secondary.
 */

import React from 'react';
import { useBrandImage } from '@/components/account/useBrandImage';
import { APPROVED_DEALER_BRANDING } from '@/components/account/defaultDealerBranding';

const FONT = 'Didact Gothic, Century Gothic, sans-serif';
const DISPLAY_FONT = 'Futura PT Light, Century Gothic, sans-serif';

const SP_WORDMARK = 'SOUND PROOF';

/** Cover date in UK format — DD/MM/YYYY. */
function formatCoverDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

export default function ProposalCoverPage({
  title,
  clientName,
  coverImageUrl,
  heroImageUrl,
  logoUrl,
  generatedDate,
}) {
  // Approved art stays visible while a dealer upload loads, and a failed
  // upload returns to the approved default.
  const heroSrc = useBrandImage(heroImageUrl, APPROVED_DEALER_BRANDING.hero_background_url);
  const logoSrc = useBrandImage(logoUrl, APPROVED_DEALER_BRANDING.white_logo_url);
  const backgroundSrc = coverImageUrl || heroSrc;
  const dateLabel = formatCoverDate(generatedDate);

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor: '#1B1A1A', fontFamily: FONT }}
    >
      {/* Full-bleed cover image */}
      <img
        src={backgroundSrc}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full"
        style={{ objectFit: 'cover', objectPosition: 'center', filter: 'brightness(0.94)' }}
      />

      {/* Dark overlay — keeps white branding and text readable */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.38)' }} />
      {/* Bottom-weighted gradient so the title and footer band stay legible */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.12) 34%, rgba(0,0,0,0.26) 60%, rgba(0,0,0,0.82) 100%)',
        }}
      />

      <div className="relative h-full flex flex-col">
        {/* ── Sound Proof × partner lockup ── */}
        <div className="px-8 pt-8 flex items-center justify-center gap-4">
          <span
            style={{
              fontSize: 30,
              fontWeight: 300,
              letterSpacing: '0.14em',
              lineHeight: 1,
              color: '#FFFFFF',
              whiteSpace: 'nowrap',
            }}
          >
            {SP_WORDMARK}
          </span>
          <span
            style={{
              fontSize: 17,
              fontWeight: 300,
              lineHeight: 1,
              color: 'rgba(255,255,255,0.50)',
              userSelect: 'none',
            }}
          >
            ×
          </span>
          <img
            src={logoSrc}
            alt="Artcoustic"
            style={{
              maxHeight: 52,
              maxWidth: 190,
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
            }}
          />
        </div>

        <div className="flex-1" />

        {/* ── Lower-third title block ── */}
        <div className="px-8 pb-6">
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.26em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.86)',
            }}
          >
            Cinema Design Proposal
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 300,
              lineHeight: 1.12,
              color: '#FFFFFF',
              marginTop: 14,
              fontFamily: DISPLAY_FONT,
            }}
          >
            {title || 'Untitled Project'}
          </div>
          {clientName && (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', marginTop: 10 }}>
              {clientName}
            </div>
          )}
          <div
            style={{
              width: 56,
              height: 1,
              backgroundColor: 'rgba(255,255,255,0.55)',
              marginTop: 18,
            }}
          />
        </div>

        {/* ── Footer strap band ── */}
        <div
          className="px-8 py-4 flex items-center justify-between gap-6"
          style={{
            backgroundColor: 'rgba(0,0,0,0.42)',
            borderTop: '1px solid rgba(255,255,255,0.16)',
          }}
        >
          <span
            style={{
              fontSize: 12,
              letterSpacing: '0.08em',
              color: 'rgba(255,255,255,0.90)',
              whiteSpace: 'nowrap',
            }}
          >
            {dateLabel || ''}
          </span>
          <div style={{ textAlign: 'right', minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.92)',
                lineHeight: 1.3,
              }}
            >
              Professional Home Cinema Engineering
            </div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.72)',
                lineHeight: 1.3,
                marginTop: 3,
              }}
            >
              Powered by Artcoustic Design Intelligence (ADI)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}