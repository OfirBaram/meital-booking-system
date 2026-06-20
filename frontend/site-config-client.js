'use strict';
// ════════════════════════════════════════════════════════════════
// site-config-client.js — shared theme + config loader.
// Used by the booking page (booking.js) and landing page to:
//   • fetch the live service catalog + site_config from
//     get-site-config (public Edge Function), and
//   • apply colours to CSS variables so admin edits flow into every
//     Tailwind utility (rgb(var(--color-*-rgb) / <alpha>)) AND into
//     components.css (var(--color-*) hex form).
// No external dependencies — safe to import anywhere.
// ════════════════════════════════════════════════════════════════

// Maps a site_config colour key → the CSS variable base it drives.
// applyTheme sets both the hex var (--<base>) and the RGB-channel var
// (--<base>-rgb) so utilities and component styles stay in sync.
const COLOR_VAR_MAP = {
  color_primary:      'color-primary',
  color_secondary:    'color-secondary',
  color_background:   'color-cream',
  color_text_main:    'color-text',
  color_text_muted:   'color-text-muted',
  color_progress_bar: 'color-primary-lt',
  // color_card_bg has no Tailwind utility binding; exposed as a raw var.
};

/** "#A67C8E" → "166, 124, 142" (or null if not a valid 6-digit hex). */
export function hexToRgbChannels(hex) {
  if (typeof hex !== 'string') return null;
  const m = hex.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/**
 * Apply colour config to :root CSS variables.
 * Tailwind utilities read --color-*-rgb; components.css reads --color-*.
 */
export function applyTheme(config, root) {
  if (!config) return;
  root = root || document.documentElement;
  for (const [cfgKey, base] of Object.entries(COLOR_VAR_MAP)) {
    const hex = config[cfgKey];
    if (!hex) continue;
    root.style.setProperty(`--${base}`, hex);
    const rgb = hexToRgbChannels(hex);
    if (rgb) root.style.setProperty(`--${base}-rgb`, rgb);
  }
  // Card background — raw var + rgb channel (effects use the channel).
  if (config.color_card_bg) {
    root.style.setProperty('--color-card-bg', config.color_card_bg);
    const cbRgb = hexToRgbChannels(config.color_card_bg);
    if (cbRgb) root.style.setProperty('--color-card-bg-rgb', cbRgb);
  }
  // Special effects (fx-* classes on the root), driven by theme_effects.
  if ('theme_effects' in config) applyEffects(config.theme_effects, root);
}

/** Apply the comma-separated effect ids as fx-* classes on `root`. */
export function applyEffects(effectsCsv, root) {
  root = root || document.documentElement;
  const want = new Set(String(effectsCsv || '').split(',').map(s => s.trim()).filter(Boolean));
  // Remove any existing fx-* classes, then add the requested ones.
  [...root.classList].forEach(c => { if (c.startsWith('fx-')) root.classList.remove(c); });
  want.forEach(id => root.classList.add('fx-' + id));
}

/**
 * Fetch services + config from the public get-site-config function.
 * Returns { services, config } or null on any failure (callers should
 * fall back to their static defaults — the page must never block).
 */
export async function fetchSiteConfig(supabaseUrl, anonKey, { timeoutMs = 8000 } = {}) {
  if (!supabaseUrl || !anonKey) return null;
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/get-site-config`, {
      headers: { 'Authorization': `Bearer ${anonKey}` },
      signal:  ctrl.signal,
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || data.success !== true) return null;
    return { services: data.services ?? [], config: data.config ?? {} };
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}
