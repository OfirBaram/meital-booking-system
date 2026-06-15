-- Waitlist: captures leads when no slots are available.
-- RLS: anon can INSERT (bot writes new leads), service_role has full access (admin reads).

CREATE TABLE IF NOT EXISTS waitlist (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT        NOT NULL,
  phone        TEXT        NOT NULL,
  service      TEXT,
  status       TEXT        NOT NULL DEFAULT 'waiting'
                           CHECK (status IN ('waiting', 'contacted', 'booked', 'cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contacted_at TIMESTAMPTZ
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Anon: INSERT only (no SELECT — privacy)
CREATE POLICY "anon_insert_waitlist"
  ON waitlist FOR INSERT TO anon
  WITH CHECK (true);

-- Service role: unrestricted (admin dashboard reads & updates)
CREATE POLICY "service_role_all_waitlist"
  ON waitlist FOR ALL TO service_role
  USING (true) WITH CHECK (true);
