/** @file Color math utilities: hex/RGB/OKLCH conversions, gamut fitting, scale generation, and blending used by the theme system. */
/**
 * Clamp a number into an inclusive range.
 * @param {number} v - The value.
 * @param {number} min - Lower bound.
 * @param {number} max - Upper bound.
 * @returns {number} The clamped value.
 */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
/**
 * Normalize an angle into the [0, 360) range.
 * @param {number} v - The angle in degrees.
 * @returns {number} The wrapped hue angle.
 */
function hue(v) {
  return (v % 360 + 360) % 360;
}
/**
 * Parse a hex color (3/4/6/8 digit, with or without leading `#`) into normalized RGB.
 * @param {string} hex - The hex color string.
 * @returns {Object} Object with `r`, `g`, `b` in the 0..1 range.
 */
export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 || h.length === 4 ? h.split("").map(c => c + c).join("") : h;
  const rgb = full.length === 8 ? full.slice(0, 6) : full;
  const num = parseInt(rgb, 16);
  return {
    r: (num >> 16 & 255) / 255,
    g: (num >> 8 & 255) / 255,
    b: (num & 255) / 255
  };
}
/**
 * Convert normalized RGB channels to a 6-digit hex color string.
 * @param {number} r - Red channel, 0..1.
 * @param {number} g - Green channel, 0..1.
 * @param {number} b - Blue channel, 0..1.
 * @returns {string} The `#rrggbb` hex color.
 */
export function rgbToHex(r, g, b) {
  const toHex = v => {
    const clamped = clamp(v, 0, 1);
    const int = Math.round(clamped * 255);
    return int.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
/**
 * Apply the sRGB transfer function to convert a linear channel value to sRGB.
 * @param {number} c - Linear channel value.
 * @returns {number} The sRGB-encoded channel value.
 */
function linearToSrgb(c) {
  if (c <= 0.0031308) return c * 12.92;
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
/**
 * Apply the inverse sRGB transfer function to convert an sRGB channel value to linear.
 * @param {number} c - sRGB-encoded channel value.
 * @returns {number} The linear channel value.
 */
function srgbToLinear(c) {
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
}
/**
 * Convert normalized sRGB to OKLCH (lightness, chroma, hue).
 * @param {number} r - Red channel, 0..1.
 * @param {number} g - Green channel, 0..1.
 * @param {number} b - Blue channel, 0..1.
 * @returns {Object} Object with `l`, `c`, and `h` (hue in degrees).
 */
export function rgbToOklch(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l = Math.cbrt(l_);
  const m = Math.cbrt(m_);
  const s = Math.cbrt(s_);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bOk = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(a * a + bOk * bOk);
  let H = Math.atan2(bOk, a) * (180 / Math.PI);
  if (H < 0) H += 360;
  return {
    l: L,
    c: C,
    h: H
  };
}
/**
 * Convert an OKLCH color to normalized sRGB (channels may fall outside 0..1 if out of gamut).
 * @param {Object} oklch - Object with `l`, `c`, and `h` (hue in degrees).
 * @returns {Object} Object with `r`, `g`, `b` in the 0..1 range.
 */
export function oklchToRgb(oklch) {
  const {
    l: L,
    c: C,
    h: H
  } = oklch;
  const a = C * Math.cos(H * Math.PI / 180);
  const b = C * Math.sin(H * Math.PI / 180);
  const l = L + 0.3963377774 * a + 0.2158037573 * b;
  const m = L - 0.1055613458 * a - 0.0638541728 * b;
  const s = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l * l * l;
  const m3 = m * m * m;
  const s3 = s * s * s;
  const lr = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  return {
    r: linearToSrgb(lr),
    g: linearToSrgb(lg),
    b: linearToSrgb(lb)
  };
}
/**
 * Convert a hex color string to OKLCH.
 * @param {string} hex - The hex color string.
 * @returns {Object} Object with `l`, `c`, and `h` (hue in degrees).
 */
export function hexToOklch(hex) {
  const {
    r,
    g,
    b
  } = hexToRgb(hex);
  return rgbToOklch(r, g, b);
}
/**
 * Fit an OKLCH color into the sRGB gamut by clamping lightness/chroma/hue and, if still
 * out of gamut, progressively reducing chroma until it converts to valid sRGB.
 * @param {Object} oklch - Object with `l`, `c`, and `h` (hue in degrees).
 * @returns {Object} An in-gamut OKLCH color.
 */
export function fitOklch(oklch) {
  const base = {
    l: clamp(oklch.l, 0, 1),
    c: Math.max(0, oklch.c),
    h: hue(oklch.h)
  };
  const rgb = oklchToRgb(base);
  if (rgb.r >= 0 && rgb.r <= 1 && rgb.g >= 0 && rgb.g <= 1 && rgb.b >= 0 && rgb.b <= 1) {
    return base;
  }
  let c = base.c;
  for (let i = 0; i < 24; i++) {
    c *= 0.9;
    const next = {
      ...base,
      c
    };
    const out = oklchToRgb(next);
    if (out.r >= 0 && out.r <= 1 && out.g >= 0 && out.g <= 1 && out.b >= 0 && out.b <= 1) {
      return next;
    }
  }
  return {
    ...base,
    c: 0
  };
}
/**
 * Convert an OKLCH color to a hex string, fitting it into the sRGB gamut first.
 * @param {Object} oklch - Object with `l`, `c`, and `h` (hue in degrees).
 * @returns {string} The `#rrggbb` hex color.
 */
export function oklchToHex(oklch) {
  const {
    r,
    g,
    b
  } = oklchToRgb(fitOklch(oklch));
  return rgbToHex(r, g, b);
}
/**
 * Generate a 12-step chromatic color scale from a seed color, tuned for light or dark mode.
 * @param {string} seed - The seed hex color.
 * @param {boolean} isDark - Whether to generate the dark-mode scale.
 * @returns {Array} Array of 12 hex color strings, lightest-to-darkest ordering per mode.
 */
export function generateScale(seed, isDark) {
  const base = hexToOklch(seed);
  const scale = [];
  const lightSteps = isDark ? [0.118, 0.138, 0.167, 0.202, 0.246, 0.304, 0.378, 0.468, clamp(base.l * 0.825, 0.53, 0.705), clamp(base.l * 0.89, 0.61, 0.79), clamp(base.l + 0.033, 0.868, 0.943), 0.984] : [0.993, 0.983, 0.962, 0.936, 0.906, 0.866, 0.811, 0.74, base.l, Math.max(0, base.l - 0.036), 0.49, 0.27];
  const chromaMultipliers = isDark ? [0.52, 0.68, 0.86, 1.02, 1.14, 1.24, 1.36, 1.48, 1.56, 1.64, 1.62, 1.15] : [0.12, 0.24, 0.46, 0.68, 0.84, 0.98, 1.08, 1.16, 1.22, 1.26, 1.18, 0.98];
  for (let i = 0; i < 12; i++) {
    scale.push(oklchToHex({
      l: lightSteps[i],
      c: base.c * chromaMultipliers[i],
      h: base.h
    }));
  }
  return scale;
}
/**
 * Generate a 12-step neutral (low-chroma) color scale from a seed, tuned for light or dark mode.
 * When `ink` is provided, the scale is produced by mixing a derived background toward the ink color.
 * @param {string} seed - The seed hex color.
 * @param {boolean} isDark - Whether to generate the dark-mode scale.
 * @param {string} ink - Optional ink hex color; when set, uses a background-to-ink mix strategy.
 * @returns {Array} Array of 12 hex color strings.
 */
export function generateNeutralScale(seed, isDark, ink) {
  if (ink) {
    const base = hexToOklch(seed);
    const lift = tone => oklchToHex({
      l: base.l + (1 - base.l) * tone,
      c: base.c * Math.max(0, 1 - tone),
      h: base.h
    });
    const sink = tone => oklchToHex({
      l: base.l * (1 - tone),
      c: base.c * Math.max(0, 1 - tone * (isDark ? 0.12 : 0.3)),
      h: base.h
    });
    const bg = isDark ? sink(clamp(0.19 + Math.max(0, base.l - 0.12) * 0.33 + base.c * 1.95, 0.17, 0.27)) : base.l < 0.82 ? lift(0.86) : lift(clamp(0.1 + base.c * 3.2 + Math.max(0, 0.95 - base.l) * 0.35, 0.1, 0.28));
    const steps = isDark ? [0, 0.018, 0.039, 0.064, 0.097, 0.143, 0.212, 0.31, 0.46, 0.649, 0.845, 0.984] : [0, 0.022, 0.042, 0.068, 0.102, 0.146, 0.208, 0.296, 0.432, 0.61, 0.81, 0.965];
    return steps.map(step => mixColors(bg, ink, step));
  }
  const base = hexToOklch(seed);
  const scale = [];
  const neutralChroma = Math.min(base.c, isDark ? 0.068 : 0.04);
  const lightSteps = isDark ? [0.138, 0.156, 0.178, 0.202, 0.232, 0.272, 0.326, 0.404, clamp(base.l * 0.83, 0.43, 0.55), 0.596, 0.719, 0.956] : [0.991, 0.979, 0.964, 0.946, 0.931, 0.913, 0.891, 0.83, base.l, 0.617, 0.542, 0.205];
  for (let i = 0; i < 12; i++) {
    scale.push(oklchToHex({
      l: lightSteps[i],
      c: neutralChroma,
      h: base.h
    }));
  }
  return scale;
}
/**
 * Flatten a color scale onto a solid background using per-step alpha values, producing
 * opaque hex equivalents of translucent overlays.
 * @param {Array} scale - Array of 12 hex color strings.
 * @param {boolean} isDark - Whether to use dark-mode alphas and a black (vs white) backdrop.
 * @returns {Array} Array of 12 opaque hex color strings.
 */
export function generateAlphaScale(scale, isDark) {
  const alphas = isDark ? [0.02, 0.04, 0.08, 0.12, 0.16, 0.2, 0.26, 0.36, 0.44, 0.52, 0.76, 0.96] : [0.01, 0.03, 0.06, 0.09, 0.12, 0.15, 0.2, 0.28, 0.48, 0.56, 0.64, 0.88];
  return scale.map((hex, i) => {
    const {
      r,
      g,
      b
    } = hexToRgb(hex);
    const a = alphas[i];
    const bg = isDark ? 0 : 1;
    const blendedR = r * a + bg * (1 - a);
    const blendedG = g * a + bg * (1 - a);
    const blendedB = b * a + bg * (1 - a);
    return rgbToHex(blendedR, blendedG, blendedB);
  });
}
/**
 * Interpolate between two hex colors in OKLCH space, taking the shortest hue path.
 * @param {string} color1 - Start hex color (amount 0).
 * @param {string} color2 - End hex color (amount 1).
 * @param {number} amount - Interpolation factor in 0..1.
 * @returns {string} The mixed hex color.
 */
export function mixColors(color1, color2, amount) {
  const c1 = hexToOklch(color1);
  const c2 = hexToOklch(color2);
  const delta = ((c2.h - c1.h) % 360 + 540) % 360 - 180;
  return oklchToHex({
    l: c1.l + (c2.l - c1.l) * amount,
    c: c1.c + (c2.c - c1.c) * amount,
    h: c1.h + delta * amount
  });
}
/**
 * Shift a hex color in OKLCH space by adding to lightness/hue and multiplying chroma.
 * @param {string} color - The base hex color.
 * @param {Object} value - Adjustment record: `l` (lightness delta), `c` (chroma factor), `h` (hue delta).
 * @returns {string} The shifted hex color.
 */
export function shift(color, value) {
  const base = hexToOklch(color);
  return oklchToHex({
    l: base.l + (value.l ?? 0),
    c: base.c * (value.c ?? 1),
    h: base.h + (value.h ?? 0)
  });
}
/**
 * Alpha-composite a foreground hex color over a background hex color in linear-free RGB.
 * @param {string} color - Foreground hex color.
 * @param {string} background - Background hex color.
 * @param {number} alpha - Foreground opacity in 0..1.
 * @returns {string} The blended hex color.
 */
export function blend(color, background, alpha) {
  const fg = hexToRgb(color);
  const bg = hexToRgb(background);
  return rgbToHex(fg.r * alpha + bg.r * (1 - alpha), fg.g * alpha + bg.g * (1 - alpha), fg.b * alpha + bg.b * (1 - alpha));
}
/**
 * Increase the OKLCH lightness of a hex color by a given amount.
 * @param {string} color - The base hex color.
 * @param {number} amount - Lightness increase in 0..1.
 * @returns {string} The lightened hex color.
 */
export function lighten(color, amount) {
  const oklch = hexToOklch(color);
  return oklchToHex({
    ...oklch,
    l: clamp(oklch.l + amount, 0, 1)
  });
}
/**
 * Decrease the OKLCH lightness of a hex color by a given amount.
 * @param {string} color - The base hex color.
 * @param {number} amount - Lightness decrease in 0..1.
 * @returns {string} The darkened hex color.
 */
export function darken(color, amount) {
  const oklch = hexToOklch(color);
  return oklchToHex({
    ...oklch,
    l: clamp(oklch.l - amount, 0, 1)
  });
}
/**
 * Convert a hex color and alpha into an `rgba(...)` CSS color string.
 * @param {string} color - The hex color.
 * @param {number} alpha - Opacity in 0..1.
 * @returns {string} An `rgba(r, g, b, a)` string.
 */
export function withAlpha(color, alpha) {
  const {
    r,
    g,
    b
  } = hexToRgb(color);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
}