-- ================================================================
-- Migration: 20260619000001_site_config
-- Runtime-editable site configuration: colors, UI texts, landing
-- copy, studio identity. Admin edits via admin-site-config Edge
-- Function; booking + landing pages fetch via get-site-config.
--
-- default_value lets the admin reset any key to its shipped value.
-- ================================================================

CREATE TABLE IF NOT EXISTS site_config (
  key            TEXT        PRIMARY KEY,
  value          TEXT        NOT NULL,
  category       TEXT        NOT NULL
                 CHECK (category IN ('colors','booking','landing','advanced')),
  label_he       TEXT        NOT NULL DEFAULT '',
  description_he TEXT        NOT NULL DEFAULT '',
  default_value  TEXT        NOT NULL DEFAULT '',
  sort_order     INTEGER     NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_config_public_read" ON site_config;
CREATE POLICY "site_config_public_read"
  ON site_config FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "site_config_service_role_all" ON site_config;
CREATE POLICY "site_config_service_role_all"
  ON site_config FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Seed: colors ────────────────────────────────────────────────
INSERT INTO site_config (key, value, category, label_he, default_value, sort_order) VALUES
  ('color_primary',      '#A67C8E', 'colors', 'צבע ראשי (כפתורים/כותרות)',  '#A67C8E', 0),
  ('color_secondary',    '#DDC3A5', 'colors', 'צבע משני (קווים/אקסנטים)',   '#DDC3A5', 1),
  ('color_background',   '#FAF5F0', 'colors', 'רקע האתר',                   '#FAF5F0', 2),
  ('color_card_bg',      '#FFFFFF', 'colors', 'רקע כרטיסי שירות',           '#FFFFFF', 3),
  ('color_text_main',    '#4A2E3A', 'colors', 'טקסט ראשי',                  '#4A2E3A', 4),
  ('color_text_muted',   '#8B6B76', 'colors', 'טקסט משני/תיאורים',          '#8B6B76', 5),
  ('color_progress_bar', '#C4A0B0', 'colors', 'בר התקדמות',                 '#C4A0B0', 6)
ON CONFLICT (key) DO NOTHING;

-- ── Seed: booking-flow texts ────────────────────────────────────
INSERT INTO site_config (key, value, category, label_he, default_value, sort_order) VALUES
  ('booking_hero_title',    'קבעי תור עכשיו',                  'booking', 'כותרת עמוד ההזמנה',  'קבעי תור עכשיו',                  0),
  ('booking_hero_subtitle', 'מיטל שבע ברעם — לק ג''ל בוטיק',   'booking', 'כיתוב מתחת לכותרת',  'מיטל שבע ברעם — לק ג''ל בוטיק',   1),
  ('booking_step1_title',   'בחרי שירות',                      'booking', 'כותרת שלב 1',        'בחרי שירות',                      2),
  ('booking_continue_btn',  'המשיכי',                          'booking', 'טקסט כפתור המשך',    'המשיכי',                          3),
  ('booking_submit_btn',    'שלחי בקשת הזמנה',                 'booking', 'טקסט כפתור שליחה',   'שלחי בקשת הזמנה',                 4),
  ('booking_confirm_note',  'מיטל תאשר את התור בהקדם',         'booking', 'הערה במסך אישור',    'מיטל תאשר את התור בהקדם',         5)
ON CONFLICT (key) DO NOTHING;

-- ── Seed: landing-page texts ────────────────────────────────────
INSERT INTO site_config (key, value, category, label_he, default_value, sort_order) VALUES
  ('landing_hero_title',     'לק ג׳ל בוטיק',           'landing', 'כותרת Hero בדף הנחיתה',  'לק ג׳ל בוטיק',           0),
  ('landing_hero_subtitle',  'מיטל שבע ברעם · רמת גן', 'landing', 'כיתוב Hero',             'מיטל שבע ברעם · רמת גן', 1),
  ('landing_services_title', 'מה אני מציעה',           'landing', 'כותרת סקשן שירותים',     'מה אני מציעה',           2),
  ('landing_cta_text',       'קבעי תור עכשיו',         'landing', 'טקסט כפתור CTA',         'קבעי תור עכשיו',         3)
ON CONFLICT (key) DO NOTHING;

-- ── Seed: advanced/identity ─────────────────────────────────────
INSERT INTO site_config (key, value, category, label_he, default_value, sort_order) VALUES
  ('studio_phone',     '+972547686865', 'advanced', 'מספר WhatsApp',         '+972547686865', 0),
  ('studio_instagram', 'meytal.sheva',  'advanced', 'שם משתמש Instagram',    'meytal.sheva',  1)
ON CONFLICT (key) DO NOTHING;
