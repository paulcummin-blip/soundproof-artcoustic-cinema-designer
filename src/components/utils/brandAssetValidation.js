/**
 * Brand asset upload validation — enforces minimum quality standards for
 * dealer logos, white logos, and hero background images.
 *
 * Logos: SVG (preferred) or transparent PNG, min 1200px wide, aspect ratio
 * approximately 4:1 to 1:1, transparent background.
 *
 * Hero background: JPG or PNG, min 2400×900px.
 */

const LOGO_ACCEPTED = ['svg', 'png'];
const HERO_ACCEPTED = ['jpg', 'jpeg', 'png'];
const LOGO_MIN_WIDTH = 1200;
const HERO_MIN_WIDTH = 2400;
const HERO_MIN_HEIGHT = 900;

function getExtension(file) {
  return (file?.name || '').toLowerCase().split('.').pop();
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('IMAGE_LOAD_FAILED'));
    };
    img.src = url;
  });
}

async function checkPngTransparency(file) {
  const img = await loadImageFromFile(file);
  const canvas = document.createElement('canvas');
  const maxDim = 200;
  const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

export async function validateLogo(file) {
  const ext = getExtension(file);
  if (!LOGO_ACCEPTED.includes(ext)) {
    return {
      ok: false,
      error: 'For best results, please upload a transparent SVG or PNG with a minimum width of 1200 pixels.',
    };
  }

  // SVG: accept without pixel checks (vector, inherently transparent)
  if (ext === 'svg' || file.type === 'image/svg+xml') {
    return { ok: true };
  }

  let img;
  try {
    img = await loadImageFromFile(file);
  } catch {
    return { ok: false, error: 'Failed to read the image file. Please try again.' };
  }

  if (img.naturalWidth < LOGO_MIN_WIDTH) {
    return {
      ok: false,
      error: `Logo width is ${img.naturalWidth}px. Please upload a logo at least 1200px wide for crisp display.`,
    };
  }

  const aspectRatio = img.naturalWidth / img.naturalHeight;
  if (aspectRatio < 0.5 || aspectRatio > 6) {
    return {
      ok: false,
      error: 'Logo aspect ratio is outside the recommended range (approximately 4:1 to 1:1). Please use a landscape or square logo.',
    };
  }

  try {
    const hasTransparency = await checkPngTransparency(file);
    if (!hasTransparency) {
      return {
        ok: false,
        error: 'Logo must have a transparent background. Please upload a transparent PNG without a solid white rectangle.',
      };
    }
  } catch {
    return { ok: false, error: 'Failed to check transparency. Please ensure the PNG has a transparent background.' };
  }

  return { ok: true };
}

export async function validateHeroImage(file) {
  const ext = getExtension(file);
  if (!HERO_ACCEPTED.includes(ext)) {
    return { ok: false, error: 'Hero background must be a JPG or PNG image.' };
  }

  let img;
  try {
    img = await loadImageFromFile(file);
  } catch {
    return { ok: false, error: 'Failed to read the image file. Please try again.' };
  }

  if (img.naturalWidth < HERO_MIN_WIDTH || img.naturalHeight < HERO_MIN_HEIGHT) {
    return {
      ok: false,
      error: `Image is ${img.naturalWidth}×${img.naturalHeight}px. Minimum resolution is 2400×900px for a premium display.`,
    };
  }

  return { ok: true };
}

export const LOGO_UPLOAD_CONFIG = {
  accept: '.svg,.png',
  validate: validateLogo,
};

export const HERO_UPLOAD_CONFIG = {
  accept: '.jpg,.jpeg,.png',
  validate: validateHeroImage,
};