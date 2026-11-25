import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Measures the rendered width of the second branding line (the "Powered by
 * Artcoustic Design Intelligence (ADI)" strapline) so the Sound Proof logo can
 * be sized to match it exactly — preserving the logo's original aspect ratio
 * and centring the logo and both branding lines on the same vertical axis.
 *
 * The cover component attaches the returned ref to an inline `<span>` wrapping
 * the sub-strapline text. The hook reads the span's true rendered width and
 * re-measures once web fonts have settled, so the logo matches the final
 * typeset width rather than a fallback-face width.
 *
 * Used by both the on-screen cover and the exported PDF cover, because the PDF
 * is captured from the same rendered DOM (the inline width is preserved when the
 * composition is cloned for capture).
 *
 * In the standalone Technical Report the print cover is mounted inside the
 * `.print-only` block, which is `display: none` on screen. An element whose
 * ancestor is `display: none` reports `offsetWidth` of 0, so a direct
 * measurement can never resolve and the logo would fall back to its fixed CSS
 * default — narrower than the strapline. To measure the true width in that
 * case, the hook clones the strapline, copies its computed font metrics
 * (family, size, weight, letter-spacing, text-transform, white-space — all
 * still resolved by the browser for a hidden element, unlike layout values),
 * appends the clone off-screen to `document.body` where it is visible and
 * measurable, reads its `offsetWidth`, then removes it. The probe carries the
 * exact typeset width the strapline will render at in the exported PDF, where
 * the `.print-only` block is made visible.
 */
export function useStraplineLogoWidth() {
  const straplineRef = useRef(null);
  const [logoWidthPx, setLogoWidthPx] = useState(null);

  useLayoutEffect(() => {
    const el = straplineRef.current;
    if (!el) return undefined;

    let cancelled = false;

    // Read the strapline's true rendered width. When the strapline (or an
    // ancestor) is display:none, offsetWidth is 0; fall back to an off-screen
    // clone whose computed font metrics are copied from the original, so it
    // measures the width the strapline will render at once visible.
    const measureElement = (target) => {
      const direct = target.offsetWidth;
      if (direct > 0) return direct;
      if (typeof document === 'undefined' || !document.body || !document.defaultView) {
        return 0;
      }
      const view = document.defaultView;
      const cs = view.getComputedStyle(target);
      const clone = target.cloneNode(true);
      const s = clone.style;
      s.fontFamily = cs.fontFamily;
      s.fontSize = cs.fontSize;
      s.fontWeight = cs.fontWeight;
      s.letterSpacing = cs.letterSpacing;
      s.textTransform = cs.textTransform;
      s.whiteSpace = cs.whiteSpace || 'nowrap';
      s.display = 'inline-block';
      s.position = 'absolute';
      s.left = '-9999px';
      s.top = '0';
      s.visibility = 'hidden';
      document.body.appendChild(clone);
      const w = clone.offsetWidth;
      document.body.removeChild(clone);
      return w;
    };

    const measure = () => {
      if (cancelled) return;
      const w = measureElement(el);
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