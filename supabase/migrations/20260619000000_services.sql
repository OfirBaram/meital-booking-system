-- ================================================================
-- Migration: 20260619000000_services
-- Dynamic service catalog. Admin manages services (name, desc,
-- duration, icon/image, color, sort order, active) via the
-- admin-site-config Edge Function — no code change or redeploy.
--
-- Public (anon) may SELECT (the booking page + landing read it);
-- only service_role may write. Booking flow filters active=true.
-- ================================================================

CREATE TABLE IF NOT EXISTS services (
  id           TEXT        PRIMARY KEY,                 -- 'gel_hands', 'brows_thread', ...
  name_he      TEXT        NOT NULL,
  desc_he      TEXT        NOT NULL DEFAULT '',
  duration_min INTEGER     NOT NULL DEFAULT 60
               CHECK (duration_min BETWEEN 5 AND 360),
  icon         TEXT        NOT NULL DEFAULT '💅',       -- emoji (or fallback when image_url set)
  image_url    TEXT,                                    -- optional small image; replaces icon when present
  color_hex    TEXT,                                    -- optional card accent (#RRGGBB)
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  active       BOOLEAN     NOT NULL DEFAULT true,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_services_active_sort
  ON services (active, sort_order);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- Public read (booking page + landing page fetch active services).
DROP POLICY IF EXISTS "services_public_read" ON services;
CREATE POLICY "services_public_read"
  ON services FOR SELECT TO anon, authenticated
  USING (true);

-- service_role full control (admin edits go through Edge Functions).
DROP POLICY IF EXISTS "services_service_role_all" ON services;
CREATE POLICY "services_service_role_all"
  ON services FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Seed: the live services (NO combo — split services only) ──
INSERT INTO services (id, name_he, desc_he, duration_min, icon, sort_order, active) VALUES
  ('gel_hands',    'לק ג''ל לציפורניים',          'לק ג''ל מקצועי עם הכנת ציפורן, עיצוב ואפייה מושלמת. עמיד ל-3–4 שבועות.', 60, '💅', 0, true),
  ('regular_feet', 'לק רגיל לציפורניים ברגליים',  'לק רגיל מקצועי לציפורניים ברגליים — מגוון צבעים רחב, תוצאה נקייה ומטופחת.', 30, '🦶', 1, true)
ON CONFLICT (id) DO NOTHING;
