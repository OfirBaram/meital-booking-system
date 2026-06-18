'use strict';
// ════════════════════════════════════════════════════════════════
// theme-presets.js — curated beauty colour palettes + special
// effects for the admin "עיצוב ומיתוג" studio. Pure data + helpers,
// no DOM. Each palette fully covers the 7 themeable colour keys.
// ════════════════════════════════════════════════════════════════

// key order matters only for the swatch preview strip.
export const COLOR_KEYS = [
  'color_primary', 'color_secondary', 'color_background',
  'color_card_bg', 'color_text_main', 'color_text_muted', 'color_progress_bar',
];

// id → { name (he), dark, colors{} }. The first entry is the default
// (the original Dust-Rose brand palette).
export const PALETTES = [
  { id: 'dust_rose', name: 'ורד אבק', mood: 'הקלאסי של מיטל', dark: false, colors: {
    color_primary: '#A67C8E', color_secondary: '#DDC3A5', color_background: '#FAF5F0',
    color_card_bg: '#FFFFFF', color_text_main: '#4A2E3A', color_text_muted: '#8B6B76', color_progress_bar: '#C4A0B0' } },

  { id: 'champagne_gold', name: 'שמפניה וזהב', mood: 'יוקרה חמה', dark: false, colors: {
    color_primary: '#C2A878', color_secondary: '#E8D7B8', color_background: '#FBF7EF',
    color_card_bg: '#FFFFFF', color_text_main: '#4A3F2E', color_text_muted: '#9A8B70', color_progress_bar: '#D4BC8A' } },

  { id: 'dreamy_lavender', name: 'לבנדר חלומי', mood: 'רך ורומנטי', dark: false, colors: {
    color_primary: '#9B8AC4', color_secondary: '#D8CDEB', color_background: '#F7F4FB',
    color_card_bg: '#FFFFFF', color_text_main: '#3E3551', color_text_muted: '#877C9E', color_progress_bar: '#B5A6D9' } },

  { id: 'nude_biscuit', name: 'נוד ביסקוויט', mood: 'מינימלי וטבעי', dark: false, colors: {
    color_primary: '#B89A82', color_secondary: '#E5D3C0', color_background: '#FAF4EE',
    color_card_bg: '#FFFFFF', color_text_main: '#4A3B2E', color_text_muted: '#9B8472', color_progress_bar: '#CDB39B' } },

  { id: 'blush_petal', name: 'עלי כותרת', mood: 'נשי ועדין', dark: false, colors: {
    color_primary: '#D88BA3', color_secondary: '#F3D1DC', color_background: '#FEF6F8',
    color_card_bg: '#FFFFFF', color_text_main: '#50303C', color_text_muted: '#A8788A', color_progress_bar: '#E6A8BC' } },

  { id: 'sage_mint', name: 'מרווה רעננה', mood: 'נקי וטבעוני', dark: false, colors: {
    color_primary: '#7FA68C', color_secondary: '#CFE0D2', color_background: '#F3F8F4',
    color_card_bg: '#FFFFFF', color_text_main: '#2F4435', color_text_muted: '#748C7A', color_progress_bar: '#9DBFA6' } },

  { id: 'peach_sunset', name: 'אפרסק שקיעה', mood: 'חמים ושמשי', dark: false, colors: {
    color_primary: '#E39A7B', color_secondary: '#F6D2BC', color_background: '#FEF6F0',
    color_card_bg: '#FFFFFF', color_text_main: '#543A2C', color_text_muted: '#AD8470', color_progress_bar: '#F0B597' } },

  { id: 'dusty_blue', name: 'תכלת מרמרה', mood: 'רגוע ונקי', dark: false, colors: {
    color_primary: '#7E9BB5', color_secondary: '#CBDAE6', color_background: '#F3F7FA',
    color_card_bg: '#FFFFFF', color_text_main: '#2E3D4A', color_text_muted: '#74899B', color_progress_bar: '#9DB7CC' } },

  { id: 'terracotta', name: 'טרהקוטה חמים', mood: 'אדמתי ובוהו', dark: false, colors: {
    color_primary: '#BC6E4F', color_secondary: '#E8C3A8', color_background: '#FBF3ED',
    color_card_bg: '#FFFFFF', color_text_main: '#4A2E22', color_text_muted: '#9C7560', color_progress_bar: '#D38E6C' } },

  { id: 'soft_olive', name: 'ירוק זית רך', mood: 'אורגני ושלו', dark: false, colors: {
    color_primary: '#8C9466', color_secondary: '#D7DBC0', color_background: '#F6F7F0',
    color_card_bg: '#FFFFFF', color_text_main: '#3A3D2A', color_text_muted: '#868A6E', color_progress_bar: '#A8B083' } },

  { id: 'rosegold_charcoal', name: 'רוז-גולד ופחם', mood: 'דרמטי וכהה', dark: true, colors: {
    color_primary: '#D49A94', color_secondary: '#6E5A52', color_background: '#272123',
    color_card_bg: '#342D2F', color_text_main: '#F2E9E6', color_text_muted: '#B7A39D', color_progress_bar: '#D9A39C' } },

  { id: 'pearl_noir', name: 'שחור פנינה', mood: 'אלגנטי ויוקרתי', dark: true, colors: {
    color_primary: '#C9A86A', color_secondary: '#4A4441', color_background: '#1F1B1D',
    color_card_bg: '#2C2729', color_text_main: '#F4EFEA', color_text_muted: '#B0A59D', color_progress_bar: '#D8BC84' } },
];

// Special effects — applied as `fx-*` classes on the page root and
// styled by frontend/styles/theme-effects.css.
export const EFFECTS = [
  { id: 'glow',     name: 'זוהר רך',        emoji: '✨', hint: 'הילה עדינה סביב כפתורים וכרטיסים נבחרים' },
  { id: 'gradient', name: 'כפתורי גרדיאנט', emoji: '🌈', hint: 'מילוי מדורג בכפתור הראשי' },
  { id: 'glass',    name: 'זכוכית מט',       emoji: '🧊', hint: 'כרטיסים שקופים-למחצה עם טשטוש' },
  { id: 'rounded',  name: 'פינות רכות',      emoji: '🫧', hint: 'פינות מעוגלות יותר' },
];

// ── helpers ──────────────────────────────────────────────────────
function _hexToHsl(hex) {
  const m = String(hex).trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r)      h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

function _hslToHex({ h, s, l }) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
  }
  const to = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

/** Shift a hex colour's lightness by `pct` (−100..100, roughly perceptual). */
export function adjustBrightness(hex, pct) {
  const hsl = _hexToHsl(hex);
  if (!hsl) return hex;
  if (!pct) return hex.toUpperCase();
  hsl.l = Math.min(1, Math.max(0, hsl.l + (pct / 100) * 0.5));
  return _hslToHex(hsl).toUpperCase();
}

/** Resolve a palette + brightness into the final { color_* : hex } map. */
export function resolvePalette(paletteId, brightness) {
  const p = PALETTES.find(x => x.id === paletteId) || PALETTES[0];
  const out = {};
  for (const k of COLOR_KEYS) out[k] = adjustBrightness(p.colors[k], Number(brightness) || 0);
  return out;
}

export const DEFAULT_PRESET = 'dust_rose';
