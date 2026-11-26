/**
 * Centre RP22 label ink in the capture copy only.
 *
 * html2canvas 1.4.1 measures baselines with a hidden 1px image in the host
 * document. Tailwind's img { display:block } moves that probe onto another
 * line (10px Didact: baseline 16px instead of 12px). Changing pill line-height
 * cannot correct that baseline; even the inline probe retains a small offset.
 *
 * Keep the real text in flow so every box and page boundary stays unchanged.
 * Paint only its label as an image, using Canvas ink bounds rather than the
 * rasteriser's probe. This uses the existing raster pipeline at its 2x scale.
 * No live component, report data, document storage or other text is changed.
 */
export function centreCapturedRp22Labels(scope) {
  const view = scope?.defaultView;
  if (!view) return 0;
  const cache = new Map();
  let count = 0;
  for (const pill of scope.querySelectorAll('[data-rp22-capture-label]')) {
    if (pill.querySelector('[data-rp22-label-image]')) continue;
    const label = pill.textContent || '';
    const style = view.getComputedStyle(pill);
    const rect = pill.getBoundingClientRect();
    const width = rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
    const height = rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
    if (!label || !(width > 0 && height > 0)) continue;
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const spacing = parseFloat(style.letterSpacing) || 0;
    const key = JSON.stringify([label, font, spacing, style.color, width, height]);
    let src = cache.get(key);
    if (!src) {
      const canvas = scope.createElement('canvas');
      canvas.width = Math.ceil(width * 2);
      canvas.height = Math.ceil(height * 2);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.scale(canvas.width / width, canvas.height / height);
      ctx.font = font;
      ctx.fillStyle = style.color;
      ctx.textBaseline = 'alphabetic';
      const glyphs = [];
      let advance = 0, left = Infinity, right = -Infinity, ascent = -Infinity, descent = -Infinity;
      for (const char of Array.from(label)) {
        const m = ctx.measureText(char);
        glyphs.push({ char, x: advance });
        left = Math.min(left, advance - m.actualBoundingBoxLeft);
        right = Math.max(right, advance + m.actualBoundingBoxRight);
        ascent = Math.max(ascent, m.actualBoundingBoxAscent);
        descent = Math.max(descent, m.actualBoundingBoxDescent);
        advance += m.width + spacing;
      }
      if (![left, right, ascent, descent].every(Number.isFinite)) continue;
      const x = (width - (right - left)) / 2 - left;
      const baseline = (height + ascent - descent) / 2;
      for (const glyph of glyphs) ctx.fillText(glyph.char, x + glyph.x, baseline);
      src = canvas.toDataURL('image/png');
      cache.set(key, src);
    }
    const image = scope.createElement('img');
    image.setAttribute('data-rp22-label-image', '');
    image.setAttribute('aria-hidden', 'true');
    image.alt = '';
    image.src = src;
    image.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;max-width:none;margin:0;padding:0;border:0;display:block;`;
    pill.style.position = 'relative';
    pill.style.color = 'transparent';
    pill.appendChild(image);
    count += 1;
  }
  return count;
}
