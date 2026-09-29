/**
 * BrandLockup
 * -----------
 * The Sound Proof partnership lockup, stacked vertically:
 *
 *      SOUND PROOF      ← master brand, white wordmark
 *          ×            ← partnership mark
 *      Artcoustic       ← partner mark (the dealer's own logo when uploaded)
 *
 * This is the hierarchy the app header uses (HeroBanner). Sound Proof is always
 * the master brand and the partner mark is always secondary: the wordmark width
 * is the scale anchor and the partner mark is sized from it by the shared shape
 * rules in logoLockup.js, so it can never read as a second headline.
 *
 * Reusable and presentational — sizing is a single `spFontSize`, so the same
 * lockup works at header scale and at cover scale.
 */

import React, { useEffect, useRef, useState } from 'react';
import { detectLogoShape, computeLogoDimensions } from '@/components/ui/logoLockup';

const SP_WORDMARK = 'SOUND PROOF';

// Wordmark treatment — identical to the app header.
const FONT_FAMILY = 'Didact Gothic, Century Gothic, sans-serif';
const FONT_WEIGHT = 300;
const LETTER_SPACING = '0.15em';
const BASE_FONT_SIZE = 40; // reference size used to measure the wordmark width

// Header proportions: the header's × (28px) and item gap (32px) sit against a
// wordmark of roughly 56–80px, so both are expressed as ratios here and scale
// with the wordmark.
const CROSS_RATIO = 0.40;
const GAP_RATIO = 0.46;

// Used before the wordmark is measured and before the partner mark loads.
// 0.19 matches the very-wide shape rule in logoLockup.js.
const FALLBACK_TEXT_FACTOR = 7.7;
const FALLBACK_HEIGHT_RATIO = 0.19;

const WHITE = '#FFFFFF';
const CROSS_COLOUR = 'rgba(255,255,255,0.50)';

export default function BrandLockup({
  spFontSize = 34,
  partnerLogoUrl,
  partnerAlt = 'Artcoustic',
}) {
  const [baseTextWidth, setBaseTextWidth] = useState(null);
  const [partnerNatural, setPartnerNatural] = useState(null);
  const measureRef = useRef(null);

  // Measure the wordmark at a reference size, then re-measure once webfonts
  // settle so the partner mark is sized against the real rendered width.
  useEffect(() => {
    const measure = () => {
      const width = measureRef.current?.offsetWidth;
      if (width > 0) setBaseTextWidth(width);
    };
    measure();
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(measure);
    }
  }, []);

  // A different logo must never be sized from the previous logo's shape.
  useEffect(() => {
    setPartnerNatural(null);
  }, [partnerLogoUrl]);

  const textFactor = baseTextWidth ? baseTextWidth / BASE_FONT_SIZE : FALLBACK_TEXT_FACTOR;
  const spWidth = spFontSize * textFactor;

  // The partner mark sits inside a box derived from the wordmark width, sized
  // by the shared shape rules — the same engine the app header uses.
  let maxPartnerWidth = spWidth * 0.88;
  let maxPartnerHeight = spWidth * FALLBACK_HEIGHT_RATIO;
  if (partnerNatural?.w && partnerNatural?.h) {
    const dimensions = computeLogoDimensions({
      spWidth,
      logoAspect: partnerNatural.w / partnerNatural.h,
      shape: detectLogoShape(partnerNatural.w, partnerNatural.h),
    });
    maxPartnerWidth = dimensions.logoWidth;
    maxPartnerHeight = dimensions.logoHeight;
  }

  const crossSize = Math.round(spFontSize * CROSS_RATIO);
  const gap = Math.round(spFontSize * GAP_RATIO);

  return (
    <div
      style={{
        fontFamily: FONT_FAMILY,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap,
      }}
    >
      {/* Hidden measurement span — the rendered width anchor for the lockup. */}
      <span
        ref={measureRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          visibility: 'hidden',
          fontSize: BASE_FONT_SIZE,
          letterSpacing: LETTER_SPACING,
          fontFamily: FONT_FAMILY,
          fontWeight: FONT_WEIGHT,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          left: -9999,
        }}
      >
        {SP_WORDMARK}
      </span>

      {/* Sound Proof — master brand, floating white wordmark, no panel. */}
      <span
        style={{
          fontSize: spFontSize,
          fontWeight: FONT_WEIGHT,
          letterSpacing: LETTER_SPACING,
          lineHeight: 1,
          color: WHITE,
          whiteSpace: 'nowrap',
        }}
      >
        {SP_WORDMARK}
      </span>

      {/* Partnership mark — fixed proportion of the wordmark, visually neutral. */}
      <span
        style={{
          fontSize: crossSize,
          fontWeight: 300,
          lineHeight: 1,
          color: CROSS_COLOUR,
          userSelect: 'none',
        }}
      >
        ×
      </span>

      {/* Partner mark — the dealer's own logo when uploaded, otherwise the
          approved Artcoustic mark. Always secondary to Sound Proof. */}
      {partnerLogoUrl && (
        <img
          src={partnerLogoUrl}
          alt={partnerAlt}
          onLoad={(event) => {
            const image = event.currentTarget;
            setPartnerNatural({ w: image.naturalWidth, h: image.naturalHeight });
          }}
          style={{
            maxWidth: maxPartnerWidth,
            maxHeight: maxPartnerHeight,
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
          }}
        />
      )}
    </div>
  );
}