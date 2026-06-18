-- ================================================================
-- Migration: 20260619000004_theme_presets
-- Meta keys for the palette-based theming UX. The 7 color_* keys
-- still hold the resolved colours (applied to the live site); these
-- three remember WHICH preset / brightness / effects produced them
-- so the admin console can re-open on the right palette.
-- ================================================================
INSERT INTO site_config (key, value, category, label_he, default_value, sort_order) VALUES
  ('theme_preset',     'dust_rose', 'advanced', 'ערכת צבעים נבחרת',  'dust_rose', 10),
  ('theme_brightness', '0',         'advanced', 'בהירות הערכה',      '0',         11),
  ('theme_effects',    '',          'advanced', 'אפקטים מיוחדים',    '',          12)
ON CONFLICT (key) DO NOTHING;
