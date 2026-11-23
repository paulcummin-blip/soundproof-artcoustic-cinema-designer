import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Measures the rendered width of the strapline title text so the Sound Proof
 * logo can be sized to match it exactly — preserving the logo's original aspect
 * ratio and centring the logo and both branding lines on the same vertical axis.
 *
 * The cover component attaches the returned ref to an inline `<span>` wrapping
 * the title text. The hook reads the span's `offsetWidth` (the text's true
 * rendered width, independent of the surrounding block) and re-measures once
 * web fonts have settled, so the logo matches the final typeset width rather
 * than a fallback-face width.
 *
 * Used by both the on-screen cover and the exported PDF cover, because the PDF
 * is captured from the same rendered DOM (the inline width is preserved when the
 * composition is cloned for capture).
 */
export function useStraplineLogoWidth() {
  const straplineRef = useRef(null);
  const [logoWidthPx, setLogoWidthPx] = useState(null);

  useLayoutEffect(() => {
    const el = straplineRef.current;
    if (!el) return undefined;

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const w = el.offsetWidth;
      if (w > 0) setLogoWidthPx(w);
    };

    measure();
    // Re-measure once web fonts have loaded, since the strapline width depends
    // on the resolved font family (Futura PT Light / Century Gothic / Didact
    // Gothic all have different metrics).
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }

    return () => { cancelled = true; };
  }, []);

  return { straplineRef, logoWidthPx };
}