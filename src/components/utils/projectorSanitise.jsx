const round2 = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : value;
};

const clamp = (value, min, max) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return num;
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.min(Math.max(num, low), high);
};

export function sanitizeProjectorElement(el, roomDims) {
  if (el?.type !== "projector") return el;

  const widthM = Number(roomDims?.widthM);
  const lengthM = Number(roomDims?.lengthM);
  const heightM = Number(roomDims?.heightM);

  let x_lens_m = round2(el.x_lens_m);
  let y_lens_m = round2(el.y_lens_m);
  let z_lens_m = round2(el.z_lens_m);
  const body_width_m = round2(el.body_width_m);
  const body_height_m = round2(el.body_height_m);
  const body_depth_m = round2(el.body_depth_m);

  if (Number.isFinite(widthM)) {
    x_lens_m = clamp(x_lens_m, 0.1, widthM - 0.1);
  }

  if (Number.isFinite(lengthM)) {
    y_lens_m = clamp(y_lens_m, 0.1, lengthM - 0.1);
  }

  if (Number.isFinite(heightM)) {
    z_lens_m = clamp(z_lens_m, 0.1, heightM - 0.1);

    if (Number.isFinite(Number(body_height_m))) {
      const halfBodyHeight = Number(body_height_m) / 2;
      z_lens_m = clamp(z_lens_m, 0.1 + halfBodyHeight, heightM - 0.1 - halfBodyHeight);
    }
  }

  return {
    ...el,
    x_lens_m,
    y_lens_m,
    z_lens_m,
    body_width_m,
    body_height_m,
    body_depth_m,
  };
}