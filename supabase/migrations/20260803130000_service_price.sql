-- ─────────────────────────────────────────────────────────────────────────────
-- Service price — the first real price anywhere in the system.
--
-- Until now no surface (landing page, chat widget, or bot) could answer "how
-- much does it cost", because the fact simply did not exist: `services` had
-- id, name_he, desc_he, duration_min, icon, image_url, color_hex, sort_order,
-- active, updated_at — and nothing else. Every price question was deflected to
-- WhatsApp by hardcoded copy in four separate files.
--
-- NULL is meaningful here and is NOT the same as 0:
--   NULL → do not publish a price; answer "בתיאום אישי" and offer WhatsApp.
--   0..5000 → the bot may quote this number.
-- That keeps the "should I say a price?" decision in the data, so the bot needs
-- no extra flag and Meital can un-publish a price by clearing the field.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS price_ils INTEGER;

-- Named constraint so it is droppable/inspectable; guarded for re-runs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'services_price_ils_range'
  ) THEN
    ALTER TABLE services
      ADD CONSTRAINT services_price_ils_range
      CHECK (price_ils IS NULL OR (price_ils >= 0 AND price_ils <= 5000));
  END IF;
END $$;

COMMENT ON COLUMN services.price_ils IS
  'Price in ILS. NULL = do not publish (bot answers "בתיאום אישי" + WhatsApp).';

-- Gel polish is the only service with a published price (confirmed 2026-08-03).
UPDATE services SET price_ils = 160 WHERE id = 'gel_hands';

-- brows_wax stays NULL on purpose — eyebrow/lip pricing is arranged personally
-- with Meital, so the bot must keep deflecting for it.
